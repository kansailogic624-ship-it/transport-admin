"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelectedDate } from "@/contexts/selected-date-context";
import { Download, Plus, Trash2 } from "lucide-react";
import { AlertList } from "@/components/alert-list";
import { AttendanceCompareTable } from "@/components/attendance-compare-table";
import {
  attendanceSnapshotsFromRecord,
  emptyAttendanceSnapshots,
} from "@/lib/attendance-snapshots";
import { DayStatusBadge } from "@/components/day-status-badge";
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
import { formatCrewSummary } from "@/lib/labor-cost";
import { addUniqueToList } from "@/lib/masters";
import { normalizeTrip } from "@/lib/trip-normalize";
import {
  jobOptionsForTrip,
  TripEntryForm,
} from "@/components/trip-entry-form";
import { DailyImportGrid } from "@/components/fusion-import";
import { RollCallImport } from "@/components/roll-call-import";
import { TripFusionEditor } from "@/components/trip-fusion-editor";
import {
  ReportStatusBadge,
  ReportStatusSelect,
} from "@/components/report-status-control";
import type {
  DailyRecord,
  DailyReportStatus,
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
    isFusionDraft: existing.isFusionDraft,
    reportedDistanceKm: saved.reportedDistanceKm ?? existing.reportedDistanceKm,
  };
}

function primaryDriverName(form: ReturnType<typeof emptyForm>): string {
  return form.useCustomDriver ? form.customDriver.trim() : form.driverName;
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
}: DailyDashboardProps) {
  const drivers = masters.drivers;
  const { selectedDate, setSelectedDate } = useSelectedDate();
  const [form, setForm] = useState(() => emptyForm(selectedDate));
  const [editingId, setEditingId] = useState<string | null>(null);
  /** FM配車アコーディオン管理: key = "${recordId}|${tripIndex}" */
  const [expandedFusion, setExpandedFusion] = useState<Set<string>>(new Set());
  /** 業務タブ選択: key = recordId, value = tripIndex */
  const [activeJobTabs, setActiveJobTabs] = useState<Map<string, number>>(new Map());

  const toggleFusion = (key: string) => {
    setExpandedFusion((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setActiveTab = (recordId: string, tabIdx: number) => {
    setActiveJobTabs((prev) => {
      const next = new Map(prev);
      next.set(recordId, tabIdx);
      return next;
    });
  };

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
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [records, selectedDate],
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
      <DailyImportGrid
        records={records}
        masters={masters}
        onRecordsChange={persistRecords}
        onMastersChange={onMastersChange}
        rollCall={
          <RollCallImport
            records={records}
            masters={masters}
            onRecordsChange={persistRecords}
            onMastersChange={onMastersChange}
          />
        }
      />

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
                      value={form.driverName}
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
                    jobOptions={jobOptionsForTrip(masters, trip)}
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
                  {editingId ? "更新する" : "登録する"}
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

        {/* 右：当日一覧 */}
        <Card>
          <CardHeader>
            <CardTitle>{selectedDate} の入力一覧</CardTitle>
            <CardDescription>
              警告がある行は赤字で表示されます。クリックで編集できます。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dayRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                この日付のデータはまだありません。左のフォームから登録してください。
              </p>
            ) : (
              <div className="space-y-1.5">
              {dayRecords.map((record) => {
                const alerts = getRecordAlerts(record);
                const hasFusion = (record.fusionDispatchOptions?.length ?? 0) > 0;
                const totalRev = record.trips
                  .map((t) => Number(String(t.revenue).replace(/,/g, "")))
                  .filter((n) => Number.isFinite(n) && n > 0)
                  .reduce((s, n) => s + n, 0);
                return (
                  <div
                    key={record.id}
                    className="rounded-lg border transition-colors hover:bg-muted/30"
                  >
                    {/* ── ヘッダー行（クリックで編集） ── */}
                    <div
                      className="flex cursor-pointer flex-wrap items-center justify-between gap-1.5 px-3 py-2"
                      onClick={() => startEdit(record)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") startEdit(record);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">
                          {isPartnerRecord(record) ? "傭車運行" : record.driverName}
                        </p>
                        {!isPartnerRecord(record) && (
                          <p className="text-[11px] text-muted-foreground">
                            出勤 {record.clockIn || "—"} / 退勤 {record.clockOut || "—"} / 点呼 {record.rollCallTime || "—"}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {record.dayStatus && (
                          <DayStatusBadge status={record.dayStatus} />
                        )}
                        {totalRev > 0 && (
                          <span className="tabular-nums text-sm font-bold text-foreground">
                            {formatYen(totalRev)}
                          </span>
                        )}
                        {record.isFusionDraft && (
                          <Badge variant="outline" className="border-amber-400 text-[10px] px-1 py-0">
                            下書き
                          </Badge>
                        )}
                        {isPartnerRecord(record) ? (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">傭車</Badge>
                        ) : (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <ReportStatusSelect
                              compact
                              value={record.reportStatus}
                              onChange={(reportStatus) => {
                                persistRecords(
                                  records.map((r) =>
                                    r.id === record.id
                                      ? withReportStatusManual(r, reportStatus)
                                      : r,
                                  ),
                                );
                              }}
                            />
                          </div>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`${record.driverName} の記録を削除しますか？`)) {
                              removeRecord(record.id);
                            }
                          }}
                        >
                          削除
                        </Button>
                      </div>
                    </div>

                    <AlertList alerts={alerts} className="px-3 pb-1" />

                    {record.dayStatus && record.trips.length === 0 && (
                      <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                        FileMakerスケジュールより {record.dayStatus} を反映済み
                      </div>
                    )}

                    {/* ── 業務タブ＋コンテンツ ── */}
                    {record.trips.length > 0 && (() => {
                      const activeIdx = activeJobTabs.get(record.id) ?? 0;
                      const safeIdx = Math.min(activeIdx, record.trips.length - 1);
                      const activeTrip = record.trips[safeIdx]!;
                      const fusionKey = `${record.id}|${safeIdx}`;
                      const fusionOpen = expandedFusion.has(fusionKey);
                      const start = Number(activeTrip.startMeter);
                      const end = Number(activeTrip.endMeter);
                      const dist =
                        !Number.isNaN(start) &&
                        !Number.isNaN(end) &&
                        activeTrip.startMeter !== "" &&
                        activeTrip.endMeter !== ""
                          ? end - start
                          : null;
                      return (
                        <div className="border-t px-3 pb-2 pt-1 text-xs">
                          {/* タブボタン行（複数業務の場合のみ表示） */}
                          {record.trips.length > 1 && (
                            <div className="mb-1 flex flex-wrap gap-0.5">
                              {record.trips.map((trip, i) => {
                                const hasRev = Number(String(trip.revenue).replace(/,/g, "")) > 0;
                                return (
                                  <button
                                    key={trip.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTab(record.id, i);
                                    }}
                                    className={[
                                      "flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                                      safeIdx === i
                                        ? "bg-blue-600 text-white"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                                    ].join(" ")}
                                  >
                                    業務{i + 1}
                                    {hasRev && (
                                      <span className="tabular-nums">
                                        {formatYen(trip.revenue)}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {/* アクティブ業務の1行サマリー */}
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 rounded bg-muted/40 px-2 py-0.5 leading-snug">
                            {record.trips.length === 1 && (
                              <span className="shrink-0 font-medium">
                                業務1{activeTrip.runType === "partner" ? "（傭）" : ""}
                              </span>
                            )}
                            <span className="text-muted-foreground">
                              {activeTrip.shipperName || "荷主未入力"}
                              {activeTrip.jobName ? ` / ${activeTrip.jobName}` : ""}
                            </span>
                            {activeTrip.revenue ? (
                              <span className="tabular-nums font-semibold">
                                {formatYen(activeTrip.revenue)}
                              </span>
                            ) : null}
                            {activeTrip.runType === "partner" && activeTrip.partnerName
                              ? <span className="text-muted-foreground">{activeTrip.partnerName}</span>
                              : null}
                            {activeTrip.runType === "partner" && activeTrip.partnerFee
                              ? <span className="tabular-nums">傭{formatYen(activeTrip.partnerFee)}</span>
                              : null}
                            {activeTrip.runType !== "partner" && activeTrip.tollFee
                              ? <span className="tabular-nums text-muted-foreground">高速{formatYen(activeTrip.tollFee)}</span>
                              : null}
                            {dist !== null && activeTrip.runType !== "partner"
                              ? <span className="text-muted-foreground">{dist}km</span>
                              : null}
                            {activeTrip.runType !== "partner" && (
                              <span className="text-muted-foreground">
                                {formatCrewSummary(activeTrip.crew ?? [])}
                              </span>
                            )}
                            {hasFusion && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFusion(fusionKey);
                                }}
                                className={[
                                  "ml-auto shrink-0 rounded border px-1.5 py-0 text-[10px] font-medium transition-colors",
                                  fusionOpen
                                    ? "border-amber-400 bg-amber-50 text-amber-700"
                                    : "border-muted-foreground/30 text-muted-foreground hover:border-amber-400 hover:text-amber-700",
                                ].join(" ")}
                              >
                                FM配車 {fusionOpen ? "▲" : "▼"}
                              </button>
                            )}
                          </div>
                          {/* FM配車エディタ（展開時のみ） */}
                          {hasFusion && fusionOpen && (
                            <div
                              className="mt-0.5 rounded border border-amber-200 bg-amber-50/40 px-2 pb-2 pt-1"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <TripFusionEditor
                                record={record}
                                trip={activeTrip}
                                tripIndex={safeIdx}
                                masters={masters}
                                compact
                                onRecordChange={(updated) => {
                                  onRecordsChange(
                                    records.map((r) =>
                                      r.id === updated.id ? updated : r,
                                    ),
                                  );
                                }}
                                onMastersChange={onMastersChange}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
