"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Database,
  FileText,
  Pencil,
  Save,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useSelectedDate } from "@/contexts/selected-date-context";
import {
  CheckDetailTripEditor,
  draftRowsToTrips,
  tripDraftTotal,
  tripDraftsEqual,
  tripsToDraftRows,
  type TripDraftRow,
} from "@/components/check-detail-trip-editor";
import { formatYen } from "@/lib/currency-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DayStatusBadge } from "@/components/day-status-badge";
import { ReportStatusSelect } from "@/components/report-status-control";
import { VehiclePlateSelect } from "@/components/vehicle-plate-select";
import {
  applyVehicleMeterToTrips,
  extractDriverDayVehicleMeter,
  resolveTripDistanceDisplay,
} from "@/lib/trip-utils";
import {
  availableDates,
  buildDriverDayChecks,
  filterChecks,
  statusLabel,
  summarizeChecks,
  type CheckFilterType,
  type DriverDayCheck,
  type DriverDayCheckStatus,
} from "@/lib/check-missing-records";
import { normalizeDriverName } from "@/lib/driving-report-parser";
import { datesMatch } from "@/lib/import-match-keys";
import { CHECK_DETAIL_MODAL_CLASS } from "@/lib/page-layout";
import { getRecordAlerts } from "@/lib/alerts";
import { cn } from "@/lib/utils";
import type { DailyRecord, DailyReportStatus, MasterData } from "@/lib/types";

// ---------------------------------------------------------------------------
// 設定定数
// ---------------------------------------------------------------------------

type StatusConfig = {
  rowClass: string;
  badgeClass: string;
};

const STATUS_CONFIG: Record<DriverDayCheckStatus, StatusConfig> = {
  schedule_missing: {
    rowClass: "border-l-4 border-l-red-500 bg-red-50/80",
    badgeClass: "border-red-300 bg-red-100 text-red-800",
  },
  ok: {
    rowClass: "",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  rollcall_missing: {
    rowClass: "border-l-4 border-l-red-500 bg-red-50/50",
    badgeClass: "border-red-200 bg-red-50 text-red-800",
  },
  report_missing: {
    rowClass: "border-l-4 border-l-red-400 bg-red-50/40",
    badgeClass: "border-red-200 bg-red-50 text-red-800",
  },
  fm_missing: {
    rowClass: "border-l-4 border-l-amber-400 bg-amber-50/40",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  not_required: {
    rowClass: "opacity-55",
    badgeClass: "border-gray-200 bg-gray-50 text-gray-500",
  },
  no_data: {
    rowClass: "opacity-40",
    badgeClass: "border-gray-200 bg-gray-50 text-gray-400",
  },
};

const FILTER_CONFIG: {
  value: CheckFilterType;
  label: string;
  activeClass: string;
}[] = [
  { value: "all", label: "すべて", activeClass: "bg-foreground text-background" },
  { value: "issues", label: "要確認のみ", activeClass: "bg-red-600 text-white border-red-600" },
  { value: "rollcall_missing", label: "点呼漏れ", activeClass: "bg-red-500 text-white border-red-500" },
  { value: "report_missing", label: "日報漏れ", activeClass: "bg-red-400 text-white border-red-400" },
  { value: "fm_missing", label: "FM未登録", activeClass: "bg-amber-500 text-white border-amber-500" },
];

// ---------------------------------------------------------------------------
// セルコンポーネント
// ---------------------------------------------------------------------------

function IconOk() {
  return <CheckCircle2 className="mx-auto size-4 text-emerald-500" />;
}
function IconMissing() {
  return <XCircle className="mx-auto size-4 text-red-500" />;
}
function IconWarning() {
  return <AlertTriangle className="mx-auto size-4 text-amber-500" />;
}
function IconNa() {
  return <span className="block text-center text-muted-foreground/60">—</span>;
}

function FmCell({ check }: { check: DriverDayCheck }) {
  if (check.isMissing) {
    return (
      <div className="flex flex-col items-center gap-1 px-1">
        <XCircle className="mx-auto size-4 text-red-500" />
        <span className="text-center text-[10px] font-semibold leading-tight text-red-600">
          {check.missingMessage ?? "スケジュール未入力"}
        </span>
      </div>
    );
  }
  if (check.dayStatus) {
    return (
      <div className="flex flex-col items-center gap-1">
        <DayStatusBadge status={check.dayStatus} />
        {(check.timecardIn || check.timecardOut) && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {check.timecardIn ?? "—"} 〜 {check.timecardOut ?? "—"}
          </span>
        )}
      </div>
    );
  }
  if (check.isNotRequired) return <IconNa />;
  if (check.hasFmSchedule) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <IconOk />
        {(check.timecardIn || check.timecardOut) && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {check.timecardIn ?? "—"} 〜 {check.timecardOut ?? "—"}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-0.5">
      <IconWarning />
      <span className="text-xs text-amber-600">未登録</span>
    </div>
  );
}

function RollCallCell({ check }: { check: DriverDayCheck }) {
  if (check.isNotRequired) return <IconNa />;
  if (check.hasRollCall) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <IconOk />
        {(check.clockIn || check.clockOut) && (
          <span
            className={cn(
              "text-xs tabular-nums",
              check.hasTimecardDeviation
                ? "font-semibold text-red-600"
                : "text-muted-foreground",
            )}
          >
            {check.clockIn ?? "—"} 〜 {check.clockOut ?? "—"}
            {check.hasTimecardDeviation && (
              <AlertTriangle className="ml-0.5 inline size-3 text-red-500" />
            )}
          </span>
        )}
      </div>
    );
  }
  if (check.issues.includes("rollcall_missing")) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <IconMissing />
        <span className="text-xs text-red-600">未打刻</span>
      </div>
    );
  }
  return <IconNa />;
}

function ReportCell({ check }: { check: DriverDayCheck }) {
  if (check.isNotRequired) {
    return <span className="block text-center text-xs text-muted-foreground">不要</span>;
  }
  if (check.hasReport) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <IconOk />
        <span className="text-xs text-emerald-700">提出済</span>
      </div>
    );
  }
  if (check.issues.includes("report_missing")) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <IconMissing />
        <span className="text-xs text-red-600">未提出</span>
      </div>
    );
  }
  return <IconNa />;
}

function StatusBadge({ check }: { check: DriverDayCheck }) {
  if (check.isMissing) {
    return (
      <Badge className="gap-1 whitespace-nowrap border-red-300 bg-red-100 text-xs text-red-800">
        <AlertTriangle className="size-3" />
        未入力警告
      </Badge>
    );
  }
  if (check.dayStatus) {
    return <DayStatusBadge status={check.dayStatus} className="text-xs" />;
  }
  const cfg = STATUS_CONFIG[check.primaryStatus];
  const icons: Record<DriverDayCheckStatus, React.ReactNode> = {
    schedule_missing: <AlertTriangle className="size-3" />,
    ok: <CheckCircle2 className="size-3" />,
    rollcall_missing: <XCircle className="size-3" />,
    report_missing: <XCircle className="size-3" />,
    fm_missing: <AlertTriangle className="size-3" />,
    not_required: <Circle className="size-3" />,
    no_data: <Circle className="size-3" />,
  };
  return (
    <Badge className={cn("gap-1 whitespace-nowrap text-xs", cfg.badgeClass)}>
      {icons[check.primaryStatus]}
      {statusLabel(check.primaryStatus)}
      {check.issues.length > 1 && (
        <span className="ml-0.5 rounded-full bg-current/20 px-1 text-[10px]">
          +{check.issues.length - 1}
        </span>
      )}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// 統計チップ
// ---------------------------------------------------------------------------

type StatChipProps = {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  highlight?: "red" | "amber" | "default";
  onClick: () => void;
};

function StatChip({ icon, label, count, active, highlight = "default", onClick }: StatChipProps) {
  const countColor =
    count > 0
      ? highlight === "red"
        ? "text-red-600 font-bold"
        : highlight === "amber"
          ? "text-amber-600 font-bold"
          : "font-semibold"
      : "text-muted-foreground";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent",
        active && "bg-accent ring-1 ring-inset ring-foreground/20",
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className={countColor}>{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 指導メモ
// ---------------------------------------------------------------------------

function GuidanceNote({ check }: { check: DriverDayCheck }) {
  const notes: string[] = [];
  if (check.isMissing) {
    return (
      <span className="font-medium text-red-600">
        FileMaker元データの入力漏れを確認し、修正後に再インポートしてください
      </span>
    );
  }
  if (check.issues.includes("rollcall_missing")) notes.push("点呼打刻を確認・督促");
  if (check.issues.includes("report_missing")) notes.push("日報提出を督促");
  if (check.issues.includes("fm_missing")) notes.push("FM へ配車・勤怠を入力");
  if (check.hasTimecardDeviation) notes.push("タイムカード乖離 → 事実確認");

  if (notes.length === 0) {
    if (check.isNotRequired) return <span>—</span>;
    return (
      <span className="flex items-center gap-1 text-emerald-600">
        <CheckCircle2 className="size-3.5" /> 対応不要
      </span>
    );
  }
  return (
    <ul className="space-y-0.5">
      {notes.map((n) => (
        <li key={n} className="flex items-start gap-1">
          <span className="mt-0.5 shrink-0 text-red-400">▶</span>
          {n}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 編集モーダル
// ---------------------------------------------------------------------------

type ModalDraft = {
  clockIn: string;
  clockOut: string;
  timecardIn: string;
  timecardOut: string;
  reportStatus: DailyReportStatus;
  vehicleNumber: string;
  startMeter: string;
  endMeter: string;
};

type CheckDetailModalProps = {
  check: DriverDayCheck;
  allRecords: DailyRecord[];
  masters: MasterData;
  onSave: (updated: DailyRecord[]) => void;
  onClose: () => void;
};

function MissingScheduleModal({
  check,
  onClose,
}: {
  check: DriverDayCheck;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-red-900">
          {check.driverName} — {check.date}
        </h2>
        <p className="mt-3 text-sm font-semibold text-red-700">
          {check.missingMessage}
        </p>
        <p className="mt-2 text-sm text-red-800/80">
          この日付は FileMaker スケジュール（Excel）にレコードが存在しません。
          元データを確認・追記してから再インポートしてください。
        </p>
        <Button type="button" className="mt-4 w-full" onClick={onClose}>
          閉じる
        </Button>
      </div>
    </div>
  );
}

function CheckDetailModal({
  check,
  allRecords,
  masters,
  onSave,
  onClose,
}: CheckDetailModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // このドライバー×日のレコード一覧
  const matchingRecords = useMemo(() => {
    const key = normalizeDriverName(check.driverName);
    return allRecords.filter(
      (r) =>
        datesMatch(r.date, check.date) &&
        normalizeDriverName(r.driverName) === key,
    );
  }, [allRecords, check.date, check.driverName]);

  const originalTrips = useMemo(
    () => matchingRecords.flatMap((r) => r.trips),
    [matchingRecords],
  );

  const initialTripDraft = useMemo(
    () => tripsToDraftRows(originalTrips, masters),
    [originalTrips, masters],
  );

  const initialVehicleMeter = useMemo(
    () => extractDriverDayVehicleMeter(matchingRecords, masters.vehicles),
    [matchingRecords, masters.vehicles],
  );

  const [draft, setDraft] = useState<ModalDraft>({
    clockIn: check.clockIn ?? "",
    clockOut: check.clockOut ?? "",
    timecardIn: check.timecardIn ?? "",
    timecardOut: check.timecardOut ?? "",
    reportStatus: check.reportStatus,
    vehicleNumber: initialVehicleMeter.vehicleNumber,
    startMeter: initialVehicleMeter.startMeter,
    endMeter: initialVehicleMeter.endMeter,
  });

  const [tripDraft, setTripDraft] = useState<TripDraftRow[]>(initialTripDraft);

  const tripTotal = useMemo(() => tripDraftTotal(tripDraft), [tripDraft]);

  const tripsModified = !tripDraftsEqual(tripDraft, initialTripDraft);

  const vehicleModified =
    draft.vehicleNumber !== initialVehicleMeter.vehicleNumber ||
    draft.startMeter !== initialVehicleMeter.startMeter ||
    draft.endMeter !== initialVehicleMeter.endMeter;

  const distanceDisplay = useMemo(
    () =>
      resolveTripDistanceDisplay(
        draft.startMeter,
        draft.endMeter,
        initialVehicleMeter.totalDistanceKm,
      ),
    [
      draft.startMeter,
      draft.endMeter,
      initialVehicleMeter.totalDistanceKm,
    ],
  );

  // 初期値と比較して変更があるか
  const isModified =
    draft.clockIn !== (check.clockIn ?? "") ||
    draft.clockOut !== (check.clockOut ?? "") ||
    draft.timecardIn !== (check.timecardIn ?? "") ||
    draft.timecardOut !== (check.timecardOut ?? "") ||
    draft.reportStatus !== check.reportStatus ||
    tripsModified ||
    vehicleModified;

  // このドライバー×日の全アラート（重複排除）
  const allAlerts = useMemo(() => {
    const seen = new Set<string>();
    return matchingRecords
      .flatMap((r) => getRecordAlerts(r))
      .filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
  }, [matchingRecords]);

  // ESC で閉じる
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // スクロールロック
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 背景クリックで閉じる
  function handleBackdropClick(e: React.MouseEvent) {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  function handleSave() {
    const key = normalizeDriverName(check.driverName);
    const primaryId = check.record.id;
    const savedTrips = draftRowsToTrips(
      tripDraft,
      check.driverName,
      originalTrips,
    );

    const updated = allRecords.map((r): DailyRecord => {
      if (
        !datesMatch(r.date, check.date) ||
        normalizeDriverName(r.driverName) !== key
      ) {
        return r;
      }

      let next = { ...r };

      // 点呼時間（変更時のみ手動フラグ立て）
      const clockInChanged = draft.clockIn !== (r.clockIn ?? "");
      const clockOutChanged = draft.clockOut !== (r.clockOut ?? "");
      if (clockInChanged || clockOutChanged) {
        next = {
          ...next,
          clockIn: draft.clockIn,
          clockOut: draft.clockOut,
          clockInManualOverride: true,
          clockOutManualOverride: true,
        };
      }

      // タイムカード（FM からの補正値）
      const newTcIn = draft.timecardIn || undefined;
      const newTcOut = draft.timecardOut || undefined;
      if (newTcIn !== r.timecardIn || newTcOut !== r.timecardOut) {
        next = { ...next, timecardIn: newTcIn, timecardOut: newTcOut };
      }

      // 日報ステータス（変更時のみ手動フラグ立て）
      if (draft.reportStatus !== r.reportStatus) {
        next = {
          ...next,
          reportStatus: draft.reportStatus,
          reportStatusManualOverride: true,
        };
      }

      // 業務一覧・車両メーター：代表レコードに集約し、重複表示を防ぐ
      if (tripsModified || vehicleModified) {
        if (r.id === primaryId) {
          const baseTrips = tripsModified ? savedTrips : r.trips;
          next = {
            ...next,
            trips: applyVehicleMeterToTrips(baseTrips, {
              vehicleNumber: draft.vehicleNumber,
              startMeter: draft.startMeter,
              endMeter: draft.endMeter,
            }),
          };
        } else if (r.trips.length > 0) {
          next = { ...next, trips: [] };
        }
      }

      return next;
    });

    onSave(updated);
    onClose();
  }

  const inputClass =
    "flex h-8 w-full max-w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-sm tabular-nums shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
      aria-label={`${check.driverName} ${check.date} 詳細編集`}
    >
      {/* 背景オーバーレイ */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* モーダルパネル */}
      <div
        ref={panelRef}
        className={`relative z-10 flex max-h-[90vh] w-full ${CHECK_DETAIL_MODAL_CLASS} flex-col overflow-hidden rounded-xl bg-background shadow-2xl`}
        style={{ animation: "modalIn 0.18s ease-out both" }}
      >
        {/* ─── ヘッダー ─── */}
        <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{check.driverName}</h2>
              <StatusBadge check={check} />
            </div>
            <p className="text-xs text-muted-foreground">
              {check.date} &nbsp;|&nbsp; 業務 {tripDraft.length} 件
              {tripTotal > 0 && (
                <>
                  {" "}
                  &nbsp;|&nbsp; 合計 {formatYen(tripTotal)}
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="閉じる"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* ─── 本体（スクロール可） ─── */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-3">

            {/* 点呼簿の出退勤 */}
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                <Clock className="size-3.5 text-indigo-500" />
                点呼簿の出退勤
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    出勤（clockIn）
                  </Label>
                  <input
                    type="time"
                    className={inputClass}
                    value={draft.clockIn}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, clockIn: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    退勤（clockOut）
                  </Label>
                  <input
                    type="time"
                    className={inputClass}
                    value={draft.clockOut}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, clockOut: e.target.value }))
                    }
                  />
                </div>
              </div>
            </section>

            {/* タイムカード（FM） */}
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                <Database className="size-3.5 text-blue-500" />
                タイムカード（FileMaker）
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    出勤（timecardIn）
                  </Label>
                  <input
                    type="time"
                    className={inputClass}
                    value={draft.timecardIn}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, timecardIn: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    退勤（timecardOut）
                  </Label>
                  <input
                    type="time"
                    className={inputClass}
                    value={draft.timecardOut}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, timecardOut: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* 乖離警告 */}
              {check.hasTimecardDeviation && (
                <p className="mt-2 flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  タイムカードと点呼簿の時刻に30分以上の乖離があります
                </p>
              )}
            </section>

            {/* 日報ステータス */}
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                <FileText className="size-3.5 text-green-600" />
                日報ステータス
              </h3>
              <ReportStatusSelect
                value={draft.reportStatus}
                onChange={(s) => setDraft((d) => ({ ...d, reportStatus: s }))}
              />
            </section>

            {/* 車両・走行距離 */}
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                <Car className="size-3.5 text-amber-600" />
                車両・走行距離
              </h3>
              <div className="grid max-w-md grid-cols-2 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    車両番号
                  </Label>
                  {masters.vehicles.length > 0 ? (
                    <VehiclePlateSelect
                      value={draft.vehicleNumber}
                      vehicles={masters.vehicles}
                      onChange={(plate) =>
                        setDraft((d) => ({ ...d, vehicleNumber: plate }))
                      }
                      className="h-8 text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      className={inputClass}
                      value={draft.vehicleNumber}
                      placeholder="車両番号"
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          vehicleNumber: e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    開始メーター (km)
                  </Label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={draft.startMeter}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, startMeter: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    終了メーター (km)
                  </Label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={draft.endMeter}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, endMeter: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    走行距離 (km)
                  </Label>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    className={`${inputClass} bg-muted/40 text-muted-foreground`}
                    value={distanceDisplay}
                  />
                </div>
              </div>
            </section>

            <Separator />

            <CheckDetailTripEditor
              rows={tripDraft}
              masters={masters}
              onChange={setTripDraft}
            />

            {/* アラート一覧（読み取り専用） */}
            {allAlerts.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                  現在のアラート
                </h3>
                <ul className="space-y-1">
                  {allAlerts.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {a.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        {/* ─── フッター ─── */}
        <div className="border-t px-4 py-2.5">
          <div className="mb-2 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              合計金額
            </span>
            <span className="text-lg font-bold tabular-nums tracking-tight">
              {formatYen(tripTotal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {isModified ? (
              <span className="flex items-center gap-1 text-amber-600">
                <Pencil className="size-3" /> 未保存の変更があります
              </span>
            ) : (
              "変更なし"
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              キャンセル
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isModified}
              className="gap-1.5"
            >
              <Save className="size-3.5" />
              保存する
            </Button>
          </div>
          </div>
        </div>
      </div>

      {/* アニメーション用スタイル */}
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

type Props = {
  records: DailyRecord[];
  masters: MasterData;
  onRecordsChange?: (records: DailyRecord[]) => void;
};

export function AttendanceCheckView({ records, masters, onRecordsChange }: Props) {
  const dates = useMemo(() => availableDates(records), [records]);

  const { selectedDate, setSelectedDate } = useSelectedDate();
  const [filter, setFilter] = useState<CheckFilterType>("all");
  const [selectedCheck, setSelectedCheck] = useState<DriverDayCheck | null>(null);

  const allChecks = useMemo(
    () => buildDriverDayChecks(records, selectedDate),
    [records, selectedDate],
  );

  const displayed = useMemo(
    () => filterChecks(allChecks, filter),
    [allChecks, filter],
  );

  const summary = useMemo(() => summarizeChecks(allChecks), [allChecks]);

  const dateIdx = dates.indexOf(selectedDate);
  const canPrev = dateIdx < dates.length - 1;
  const canNext = dateIdx > 0;

  function goToPrev() {
    if (canPrev) setSelectedDate(dates[dateIdx + 1]!);
  }
  function goToNext() {
    if (canNext) setSelectedDate(dates[dateIdx - 1]!);
  }

  const handleClose = useCallback(() => setSelectedCheck(null), []);

  const handleSave = useCallback(
    (updated: DailyRecord[]) => {
      onRecordsChange?.(updated);
    },
    [onRecordsChange],
  );

  return (
    <div className="space-y-4">
      {/* ヘッダー：日付ナビ + サマリ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={goToPrev}
                disabled={!canPrev}
                title="前日"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setFilter("all");
                }}
                className="rounded-md border px-2.5 py-1.5 text-sm tabular-nums shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={goToNext}
                disabled={!canNext}
                title="翌日"
              >
                <ChevronRight className="size-4" />
              </Button>
              {dates.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  （{dates.length} 日分のデータ）
                </span>
              )}
            </div>
            <CardTitle className="text-base">管理チェック・入力状況一覧</CardTitle>
          </div>
          <CardDescription className="mt-1">
            FM スケジュール・点呼簿・日報の3データ照合。行クリックで詳細確認と修正ができます。
          </CardDescription>
        </CardHeader>

        {/* 統計チップ行 */}
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <StatChip
            icon={<Users className="size-4" />}
            label="全ドライバー"
            count={summary.total}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <StatChip
            icon={<AlertTriangle className="size-4 text-red-500" />}
            label="要確認"
            count={summary.issues}
            active={filter === "issues"}
            highlight="red"
            onClick={() => setFilter("issues")}
          />
          <StatChip
            icon={<Clock className="size-4 text-red-500" />}
            label="点呼漏れ"
            count={summary.rollcallMissing}
            active={filter === "rollcall_missing"}
            highlight="red"
            onClick={() => setFilter("rollcall_missing")}
          />
          <StatChip
            icon={<FileText className="size-4 text-red-400" />}
            label="日報漏れ"
            count={summary.reportMissing}
            active={filter === "report_missing"}
            highlight="red"
            onClick={() => setFilter("report_missing")}
          />
          <StatChip
            icon={<Database className="size-4 text-amber-500" />}
            label="FM未登録"
            count={summary.fmMissing}
            active={filter === "fm_missing"}
            highlight="amber"
            onClick={() => setFilter("fm_missing")}
          />
          {summary.scheduleMissing > 0 && (
            <StatChip
              icon={<AlertTriangle className="size-4 text-red-500" />}
              label="スケジュール欠落"
              count={summary.scheduleMissing}
              active={filter === "issues"}
              highlight="red"
              onClick={() => setFilter("issues")}
            />
          )}
          {summary.deviations > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="size-3.5" />
              タイムカード乖離 {summary.deviations} 名
            </div>
          )}
        </CardContent>
      </Card>

      {/* フィルターボタン */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_CONFIG.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all",
              filter === f.value
                ? f.activeClass
                : "border-muted bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {f.label}
            {f.value !== "all" && (
              <span className="ml-1 opacity-70">
                (
                {f.value === "issues"
                  ? summary.issues
                  : f.value === "rollcall_missing"
                    ? summary.rollcallMissing
                    : f.value === "report_missing"
                      ? summary.reportMissing
                      : summary.fmMissing}
                )
              </span>
            )}
          </button>
        ))}
      </div>

      {/* メインテーブル */}
      <Card>
        <CardContent className="p-0">
          {allChecks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Users className="size-10 opacity-30" />
              <p className="text-sm">
                {selectedDate
                  ? `${selectedDate} のデータはありません`
                  : "日付を選択してください"}
              </p>
              <p className="text-xs">
                融合インポートまたは日次入力でデータを登録するとここに表示されます
              </p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <CheckCircle2 className="size-8 text-emerald-400" />
              <p className="text-sm">
                該当する問題は見つかりません（フィルター:{" "}
                {FILTER_CONFIG.find((f) => f.value === filter)?.label}）
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-[180px] pl-4 font-semibold">
                      ドライバー
                    </TableHead>
                    <TableHead className="w-[150px] text-center">
                      <span className="flex items-center justify-center gap-1 text-xs">
                        <Database className="size-3.5 text-blue-500" />
                        FM スケジュール
                      </span>
                    </TableHead>
                    <TableHead className="w-[150px] text-center">
                      <span className="flex items-center justify-center gap-1 text-xs">
                        <Clock className="size-3.5 text-indigo-500" />
                        点呼簿
                      </span>
                    </TableHead>
                    <TableHead className="w-[120px] text-center">
                      <span className="flex items-center justify-center gap-1 text-xs">
                        <FileText className="size-3.5 text-green-600" />
                        日報
                      </span>
                    </TableHead>
                    <TableHead className="text-center text-xs font-semibold">
                      総合評価
                    </TableHead>
                    <TableHead className="min-w-[180px] text-xs font-semibold">
                      指導メモ
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.map((check) => (
                    <TableRow
                      key={`${check.driverName}-${check.date}`}
                      className={cn(
                        "text-sm transition-colors",
                        check.isMissing
                          ? "cursor-pointer bg-red-50/80 hover:bg-red-100/80"
                          : "cursor-pointer hover:bg-muted/50",
                        STATUS_CONFIG[check.primaryStatus].rowClass,
                      )}
                      onClick={() => setSelectedCheck(check)}
                      title={
                        check.isMissing
                          ? `${check.driverName} — スケジュール未入力`
                          : `${check.driverName} の詳細を開く`
                      }
                    >
                      {/* ドライバー名（クリック可アイコン付き） */}
                      <TableCell className="py-2 pl-4">
                        <span className="flex items-center gap-1.5 font-medium">
                          {check.driverName}
                          <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </span>
                      </TableCell>

                      <TableCell className="py-2">
                        <FmCell check={check} />
                      </TableCell>

                      <TableCell className="py-2">
                        <RollCallCell check={check} />
                      </TableCell>

                      <TableCell className="py-2">
                        <ReportCell check={check} />
                      </TableCell>

                      <TableCell className="py-2 text-center">
                        <StatusBadge check={check} />
                      </TableCell>

                      <TableCell className="py-2 text-xs text-muted-foreground">
                        <GuidanceNote check={check} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 凡例 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium">凡例:</span>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="size-3.5 text-emerald-500" /> 入力あり
        </span>
        <span className="flex items-center gap-1">
          <XCircle className="size-3.5 text-red-500" /> 漏れ（要確認）
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="size-3.5 text-amber-500" /> 未登録（注意）
        </span>
        <span className="flex items-center gap-1">
          <Circle className="size-3.5 text-gray-400" /> 対象外
        </span>
        <span className="text-muted-foreground/70">
          ※ 行をクリックすると詳細確認・修正ができます
        </span>
      </div>

      {/* 詳細編集モーダル */}
      {selectedCheck?.isMissing && (
        <MissingScheduleModal check={selectedCheck} onClose={handleClose} />
      )}
      {selectedCheck && !selectedCheck.isMissing && (
        <CheckDetailModal
          check={selectedCheck}
          allRecords={records}
          masters={masters}
          onSave={handleSave}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
