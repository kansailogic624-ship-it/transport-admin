"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelectedDate } from "@/contexts/selected-date-context";
import { AlertTriangle, CheckCircle2, Download, Plus, Trash2 } from "lucide-react";
import { AlertList } from "@/components/alert-list";
import { AttendanceCompareTable } from "@/components/attendance-compare-table";
import {
  attendanceSnapshotsFromRecord,
  emptyAttendanceSnapshots,
} from "@/lib/attendance-snapshots";
import { formatYen } from "@/lib/currency-format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getRecordAlerts, getTripAlerts } from "@/lib/alerts";
import { exportDailyRecordsCsv } from "@/lib/csv";
import { newCrewMember } from "@/lib/crew-utils";
import { addUniqueToList } from "@/lib/masters";
import { normalizeTrip } from "@/lib/trip-normalize";
import {
  jobOptionsForTrip,
  TripEntryForm,
} from "@/components/trip-entry-form";
import { DailyImportRedirectGrid } from "@/components/daily-import-redirect-grid";
import { PreprocessedJsonImportPanel } from "@/components/preprocessed-json-import-panel";
import type { PreprocessSourceType } from "@/lib/import-preprocessor";
import {
  ReportStatusBadge,
  ReportStatusSelect,
} from "@/components/report-status-control";
import { normalizeJobDetails } from "@/lib/job-price-history";
import { loadJobDetails } from "@/services/firestore-storage";
import type {
  DailyRecord,
  DailyReportStatus,
  JobDetail,
  MasterData,
  TripEntry,
  RunType,
} from "@/lib/types";
import { PAGE_GRID_2COL_CLASS } from "@/lib/page-layout";
import { isPartnerRecord } from "@/lib/run-type";
import { applyJointOperationMerge } from "@/lib/joint-operation-merge";
import {
  withManualAttendanceFromForm,
  withReportStatusManual,
} from "@/lib/record-manual-override";

type DailyDashboardProps = {
  records: DailyRecord[];
  masters: MasterData;
  onRecordsChange: (records: DailyRecord[]) => void;
  onMastersChange: (masters: MasterData) => void;
  onGoToPreprocess: (sourceType: PreprocessSourceType) => void;
};

function newTrip(driverName = "", runType: RunType = "own"): TripEntry {
  const crewMember = newCrewMember("employee");
  crewMember.name = driverName;
  return {
    id: crypto.randomUUID(),
    runType,
    vehicleNumber: "",
    shipperName: "",
    jobName: "",
    revenue: "",
    tollFee: "",
    startMeter: "",
    endMeter: "",
    crew: runType === "partner" ? [] : [crewMember],
    partnerName: "",
    partnerFee: "",
  };
}

function emptyForm(date: string) {
  return {
    date,
    operationType: "own" as RunType,
    driverName: "",
    customDriver: "",
    useCustomDriver: false,
    clockIn: "",
    clockOut: "",
    rollCallTime: "",
    rollCallEndTime: "",
    attendanceSnapshots: emptyAttendanceSnapshots(),
    reportStatus: "not_submitted" as DailyReportStatus,
    trips: [newTrip()],
  };
}

function mergeSavedWithExisting(
  existing: DailyRecord | undefined,
  saved: DailyRecord,
): DailyRecord {
  if (!existing) return saved;
  return {
    ...existing,
    ...saved,
    timecardIn: existing.timecardIn,
    timecardOut: existing.timecardOut,
    employeeId: existing.employeeId,
    dayStatus: existing.dayStatus,
    rollCallPreRecorded: existing.rollCallPreRecorded,
    rollCallPostRecorded: existing.rollCallPostRecorded,
    importHistoryId: existing.importHistoryId,
    fusionDispatchOptions: existing.fusionDispatchOptions,
    primaryLinkedDispatchName: existing.primaryLinkedDispatchName,
    isFusionDraft: false,
    reportedDistanceKm: saved.reportedDistanceKm ?? existing.reportedDistanceKm,
  };
}

function primaryDriverName(form: ReturnType<typeof emptyForm>): string {
  return form.useCustomDriver ? form.customDriver.trim() : form.driverName;
}

function primaryTrip(record: DailyRecord): TripEntry | undefined {
  return record.trips[0];
}

function formatCompactLine1(record: DailyRecord): string {
  const trip = primaryTrip(record);
  if (!trip) {
    if (record.dayStatus) return `${record.date} ${record.dayStatus}`;
    return `${record.date} ${record.driverName || "（記録）"}`;
  }
  const shipper = trip.shipperName.trim() || "荷主未入力";
  const job = trip.jobName.trim() || "業務未入力";
  const vehicle = trip.vehicleNumber.trim();
  const extra =
    record.trips.length > 1 ? ` 他${record.trips.length - 1}件` : "";
  return `${record.date} ${shipper} - ${job}${
    vehicle ? ` (${vehicle})` : ""
  }${extra}`;
}

function formatCompactLine2(record: DailyRecord): string {
  const trip = primaryTrip(record);
  if (isPartnerRecord(record) || trip?.runType === "partner") {
    const partner = trip?.partnerName.trim() || "—";
    const fee = trip?.partnerFee
      ? ` / 傭車料 ${formatYen(trip.partnerFee)}`
      : "";
    return `傭車: ${partner}${fee}`;
  }
  const driver =
    record.driverName.trim() ||
    trip?.crew?.find((c) => c.memberType === "employee")?.name?.trim() ||
    trip?.crew?.[0]?.name?.trim() ||
    "—";
  const assistants =
    trip?.crew
      ?.slice(1)
      .map((c) => c.name.trim())
      .filter(Boolean)
      .join("、") || "—";
  const remark =
    trip?.reportSourceLabel?.trim() ||
    record.dayStatus ||
    record.primaryLinkedDispatchName?.trim() ||
    "";
  return `運転手: ${driver} / 助手: ${assistants}${
    remark ? ` ${remark}` : ""
  }`;
}

function recordFromForm(
  form: ReturnType<typeof emptyForm>,
  existingId?: string,
): DailyRecord {
  const isPartner = form.operationType === "partner";
  const driverName = isPartner
    ? "（傭車）"
    : form.useCustomDriver
      ? form.customDriver.trim()
      : form.driverName;

  const base: DailyRecord = {
    id: existingId ?? crypto.randomUUID(),
    date: form.date,
    operationType: form.operationType,
    driverName,
    clockIn: form.clockIn,
    clockOut: form.clockOut,
    rollCallTime: form.rollCallTime,
    rollCallEndTime: form.rollCallEndTime.trim() || undefined,
    reportStatus:
      form.operationType === "partner" ? "not_required" : form.reportStatus,
    trips: form.trips,
    createdAt: new Date().toISOString(),
  };

  return withManualAttendanceFromForm(base, {
    clockIn: form.clockIn,
    clockOut: form.clockOut,
    rollCallTime: form.rollCallTime,
    rollCallEndTime: form.rollCallEndTime,
    reportStatus:
      form.operationType === "partner" ? "not_required" : form.reportStatus,
    isPartner: form.operationType === "partner",
  });
}

export function DailyDashboard({
  records,
  masters,
  onRecordsChange,
  onMastersChange,
  onGoToPreprocess,
}: DailyDashboardProps) {
  const drivers = masters.drivers;
  const { selectedDate, setSelectedDate } = useSelectedDate();
  const [form, setForm] = useState(() => emptyForm(selectedDate));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<JobDetail[]>([]);

  const persistRecords = useCallback(
    (next: DailyRecord[]) => {
      onRecordsChange(next);
    },
    [onRecordsChange],
  );

  const draftRecord = useMemo(
    () => recordFromForm(form, editingId ?? undefined),
    [form, editingId],
  );
  const draftAlerts = useMemo(() => getRecordAlerts(draftRecord), [draftRecord]);

  const attendanceSourceRecord = useMemo(() => {
    if (editingId) {
      return records.find((r) => r.id === editingId);
    }
    const driver = primaryDriverName(form);
    if (!driver || !form.date) return undefined;
    return records.find(
      (r) =>
        r.date === form.date &&
        r.driverName === driver &&
        (r.timecardIn ||
          r.timecardOut ||
          r.clockIn ||
          r.rollCallTime ||
          r.rollCallEndTime),
    );
  }, [
    editingId,
    records,
    form.date,
    form.driverName,
    form.customDriver,
    form.useCustomDriver,
  ]);

  useEffect(() => {
    if (editingId) return;
    setForm((prev) =>
      prev.date === selectedDate ? prev : { ...prev, date: selectedDate },
    );
  }, [selectedDate, editingId]);

  useEffect(() => {
    loadJobDetails()
      .then((rows) => setJobDetails(normalizeJobDetails(rows)))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (editingId || !attendanceSourceRecord) return;
    setForm((prev) => {
      const snap = prev.attendanceSnapshots;
      const hasSnapshots =
        snap.timecardIn ||
        snap.timecardOut ||
        snap.rollCallClockIn ||
        snap.rollCallStart;
      if (hasSnapshots) return prev;
      return {
        ...prev,
        attendanceSnapshots: attendanceSnapshotsFromRecord(attendanceSourceRecord),
      };
    });
  }, [attendanceSourceRecord, editingId]);

  const dayRecords = useMemo(
    () =>
      records
        .filter((r) => r.date === selectedDate)
        .sort((a, b) => {
          const draftA = a.isFusionDraft ? 0 : 1;
          const draftB = b.isFusionDraft ? 0 : 1;
          if (draftA !== draftB) return draftA - draftB;
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [records, selectedDate],
  );

  const pendingDraftCount = useMemo(
    () => dayRecords.filter((r) => r.isFusionDraft).length,
    [dayRecords],
  );

  const editingDraft = useMemo(
    () =>
      editingId
        ? (records.find((r) => r.id === editingId)?.isFusionDraft ?? false)
        : false,
    [editingId, records],
  );

  const resetForm = () => {
    const base = emptyForm(selectedDate);
    base.trips = [newTrip()];
    setForm(base);
    setEditingId(null);
  };

  const syncPrimaryDriverToFirstCrew = (
    trips: TripEntry[],
    driver: string,
  ): TripEntry[] => {
    if (!driver || trips.length === 0) return trips;
    const first = trips[0];
    const crew = first.crew?.length ? [...first.crew] : [newCrewMember("employee")];
    if (crew[0]?.memberType === "employee" && !crew[0].name) {
      crew[0] = { ...crew[0], name: driver };
    }
    return [{ ...first, crew }, ...trips.slice(1)];
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const record = recordFromForm(form, editingId ?? undefined);
    const isPartner = form.operationType === "partner";
    if (!isPartner && !record.driverName) return;
    if (isPartner) {
      const invalid = record.trips.some(
        (t) => !t.partnerName.trim() || !Number(t.partnerFee),
      );
      if (invalid) {
        alert("傭車運行は協力会社名と傭車料金を入力してください。");
        return;
      }
    }

    if (form.useCustomDriver && form.customDriver.trim()) {
      const name = form.customDriver.trim();
      if (!masters.drivers.includes(name)) {
        onMastersChange({
          ...masters,
          drivers: addUniqueToList(masters.drivers, name),
        });
      }
    }

    if (editingId) {
      const syncedTrips = syncPrimaryDriverToFirstCrew(
        form.trips,
        primaryDriverName(form),
      );
      const existing = records.find((r) => r.id === editingId);
      const savedRecord = mergeSavedWithExisting(
        existing,
        recordFromForm({ ...form, trips: syncedTrips }, editingId),
      );
      const withSaved = records.map((r) =>
        r.id === editingId ? savedRecord : r,
      );
      const { records: mergedRecords } = applyJointOperationMerge(
        withSaved,
        savedRecord,
      );
      persistRecords(mergedRecords);
    } else {
      persistRecords([record, ...records]);
    }
    resetForm();
  };

  const startEdit = (record: DailyRecord) => {
    const inList = drivers.includes(record.driverName);
    setEditingId(record.id);
    setForm({
      date: record.date,
      operationType: record.operationType ?? "own",
      driverName: inList ? record.driverName : "",
      customDriver: inList ? "" : record.driverName,
      useCustomDriver: !inList,
      clockIn: record.clockIn,
      clockOut: record.clockOut,
      rollCallTime: record.rollCallTime,
      rollCallEndTime:
        record.rollCallEndTime ??
        (record.rollCallPostRecorded ? record.clockOut : ""),
      attendanceSnapshots: attendanceSnapshotsFromRecord(record),
      reportStatus: record.reportStatus,
      trips:
        record.trips.length > 0
          ? record.trips.map((t) => normalizeTrip(t, record.driverName))
          : [newTrip(record.driverName)],
    });
  };

  const removeRecord = (id: string) => {
    persistRecords(records.filter((r) => r.id !== id));
    if (editingId === id) resetForm();
  };

  const updateTrip = (id: string, patch: Partial<TripEntry>) => {
    setForm((prev) => ({
      ...prev,
      trips: prev.trips.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  };

  const filterYearMonth = selectedDate.slice(0, 7);
  const showAttendance =
    form.operationType !== "partner" &&
    form.trips.some((t) => t.runType !== "partner");

  const setOperationType = (type: RunType) => {
    setForm((prev) => ({
      ...prev,
      operationType: type,
      reportStatus:
        type === "partner"
          ? "not_required"
          : prev.reportStatus === "not_required"
            ? "not_submitted"
            : prev.reportStatus,
      trips: prev.trips.map((t) => ({
        ...t,
        runType: type,
        crew: type === "partner" ? [] : t.crew.length ? t.crew : [newCrewMember("employee")],
        startMeter: type === "partner" ? "" : t.startMeter,
        endMeter: type === "partner" ? "" : t.endMeter,
      })),
    }));
  };

  return (
    <>
      <DailyImportRedirectGrid onGoToPreprocess={onGoToPreprocess} />
      <PreprocessedJsonImportPanel />

      <div className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-blue-100 bg-blue-50/40 p-5 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
        <div className="min-w-[220px] flex-1 space-y-2">
          <Label
            htmlFor="filter-date"
            className="mb-2 block text-lg font-bold text-gray-800 dark:text-gray-100"
          >
            一覧表示する日付
          </Label>
          <Input
            id="filter-date"
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setForm((prev) => ({ ...prev, date: e.target.value }));
            }}
            className="h-auto w-full max-w-[280px] rounded-lg border-2 border-blue-500 bg-white p-3 text-xl font-semibold shadow-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-300 dark:bg-background"
          />
        </div>
        <Badge
          variant="secondary"
          className="px-3 py-1.5 text-sm font-medium"
        >
          {dayRecords.length} 件の記録
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto shrink-0"
          onClick={() =>
            exportDailyRecordsCsv(records, filterYearMonth, masters)
          }
        >
          <Download className="size-4" />
          当月CSVダウンロード
        </Button>
      </div>

      <div className={PAGE_GRID_2COL_CLASS}>
        {/* 左：入力フォーム */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>
              {editingId ? "記録を編集" : "日々の実績入力"}
            </CardTitle>
            <CardDescription>
              ドライバー1名分の勤怠・点呼・運行業務を登録します
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                <Label>運行区分（この記録全体）</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={form.operationType === "own" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOperationType("own")}
                  >
                    自社便
                  </Button>
                  <Button
                    type="button"
                    variant={
                      form.operationType === "partner" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setOperationType("partner")}
                  >
                    傭車（協力会社）
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  各業務ごとに切り替えることもできます。傭車は点呼・日報・メーター不要です。
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="form-date">日付</Label>
                  <Input
                    id="form-date"
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                {showAttendance && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>ドライバー名（代表・勤怠の対象）</Label>
                  {!form.useCustomDriver ? (
                    <Select
                      value={form.driverName ?? ""}
                      onValueChange={(v) => {
                        const name = v ?? "";
                        setForm((prev) => ({
                          ...prev,
                          driverName: name,
                          trips: syncPrimaryDriverToFirstCrew(prev.trips, name),
                        }));
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="ドライバーを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {drivers.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="ドライバー名を入力"
                      value={form.customDriver}
                      onChange={(e) =>
                        setForm({ ...form, customDriver: e.target.value })
                      }
                      required
                    />
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.useCustomDriver}
                      onCheckedChange={(c) =>
                        setForm({
                          ...form,
                          useCustomDriver: c === true,
                        })
                      }
                    />
                    一覧にない名前を直接入力する
                  </label>
                </div>
                )}
              </div>

              {showAttendance && (
              <>
              <Separator />

              <fieldset className="space-y-1.5">
                <legend className="text-sm font-semibold">勤怠・点呼</legend>
                <p className="text-[11px] text-muted-foreground">
                  出退勤の乖離チェック（30分以上のズレは行全体を赤で表示）
                </p>
                <AttendanceCompareTable snapshots={form.attendanceSnapshots} />
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">日報提出ステータス</legend>
                <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <ReportStatusSelect
                    value={form.reportStatus}
                    onChange={(reportStatus) =>
                      setForm({ ...form, reportStatus })
                    }
                  />
                  <ReportStatusBadge status={form.reportStatus} />
                </div>
              </fieldset>

              <Separator />
              </>
              )}

              <fieldset className="space-y-4">
                <div className="flex items-center justify-between">
                  <legend className="text-sm font-semibold">
                    当日の運行業務
                  </legend>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm({
                        ...form,
                        trips: [
                          ...form.trips,
                          newTrip(
                            primaryDriverName(form),
                            form.operationType,
                          ),
                        ],
                      })
                    }
                  >
                    <Plus className="size-4" />
                    業務を追加
                  </Button>
                </div>

                {form.trips.map((trip, index) => (
                  <TripEntryForm
                    key={trip.id}
                    trip={trip}
                    index={index}
                    recordDate={form.date}
                    masters={masters}
                    records={records}
                    drivers={drivers}
                    canRemove={form.trips.length > 1}
                    jobOptions={jobOptionsForTrip(masters, trip, jobDetails)}
                    jobDetails={jobDetails}
                    onChange={(patch) => updateTrip(trip.id, patch)}
                    onRemove={() =>
                      setForm({
                        ...form,
                        trips: form.trips.filter((t) => t.id !== trip.id),
                      })
                    }
                  />
                ))}
              </fieldset>

              {draftAlerts.length > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>入力内容の警告</AlertTitle>
                  <AlertDescription>
                    <AlertList alerts={draftAlerts} />
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="flex-1 sm:flex-none">
                  {editingDraft
                    ? "確定（保存）"
                    : editingId
                      ? "更新する"
                      : "登録する"}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    キャンセル
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 右：当日一覧（コンパクト2行） */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                {selectedDate} の入力一覧
              </CardTitle>
              {pendingDraftCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-amber-400 bg-amber-50 text-amber-800"
                >
                  未確定 {pendingDraftCount} 件
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              クリックで左フォームに読み込み。未確定データは橙色、確定済みはチェック表示。
              {pendingDraftCount > 0 &&
                " 左の「確定（保存）」で登録完了すると未確定から外れます。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {dayRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                この日付のデータはまだありません。左のフォームから登録してください。
              </p>
            ) : (
              <div className="max-h-[min(72vh,640px)] overflow-y-auto rounded-md border">
                {dayRecords.map((record) => {
                  const alerts = getRecordAlerts(record);
                  const isEditing = editingId === record.id;
                  const isDraft = record.isFusionDraft === true;
                  const totalRev = record.trips
                    .map((t) => Number(String(t.revenue).replace(/,/g, "")))
                    .filter((n) => Number.isFinite(n) && n > 0)
                    .reduce((s, n) => s + n, 0);
                  return (
                    <div
                      key={record.id}
                      className={[
                        "group border-b last:border-b-0 transition-colors",
                        isEditing
                          ? "bg-blue-50"
                          : isDraft
                            ? "bg-amber-50/50"
                            : "bg-background",
                        isDraft ? "border-l-2 border-l-amber-400" : "",
                        !isDraft ? "border-l-2 border-l-emerald-400/60" : "",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "grid cursor-pointer gap-0.5 px-2 py-1.5",
                          "hover:bg-muted/40",
                          isEditing ? "hover:bg-blue-100/60" : "",
                        ].join(" ")}
                        onClick={() => startEdit(record)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            startEdit(record);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex min-w-0 items-start justify-between gap-1">
                          <p className="min-w-0 truncate text-[11px] font-medium leading-tight">
                            {formatCompactLine1(record)}
                          </p>
                          <div className="flex shrink-0 items-center gap-1">
                            {totalRev > 0 && (
                              <span className="tabular-nums text-[11px] font-bold">
                                {formatYen(totalRev)}
                              </span>
                            )}
                            {isDraft ? (
                              <Badge
                                variant="outline"
                                className="h-4 px-1 text-[9px] border-amber-400 text-amber-800"
                              >
                                未確定
                              </Badge>
                            ) : (
                              <CheckCircle2
                                className="size-3.5 text-emerald-600"
                                aria-label="確定済み"
                              />
                            )}
                            {alerts.length > 0 && (
                              <AlertTriangle
                                className="size-3.5 text-red-500"
                                aria-label={alerts.map((a) => a.message).join(" ")}
                              />
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-5 text-destructive opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    `${record.driverName} の記録を削除しますか？`,
                                  )
                                ) {
                                  removeRecord(record.id);
                                }
                              }}
                              aria-label="削除"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="truncate text-[10px] leading-tight text-muted-foreground">
                          {formatCompactLine2(record)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
