import { normalizeDriverName } from "./driving-report-parser";
import { datesMatch } from "./import-match-keys";
import { isPartnerRecord, isPartnerTrip } from "./run-type";
import type { DailyRecord, TripEntry } from "./types";

/** 日報提出ステータス（3状態） */
export type DailyReportStatus =
  | "submitted"
  | "not_submitted"
  | "not_required";

export const DAILY_REPORT_STATUS_OPTIONS: {
  value: DailyReportStatus;
  label: string;
}[] = [
  { value: "submitted", label: "提出済" },
  { value: "not_submitted", label: "未提出" },
  { value: "not_required", label: "提出不要" },
];

/** 提出不要とみなすキーワード（業務名・荷主名・日報ラベルに部分一致） */
export const REPORT_NOT_REQUIRED_KEYWORDS = [
  "休み",
  "勤怠用",
  "事務所",
  "事務作業",
] as const;

export function reportStatusLabel(status: DailyReportStatus): string {
  return (
    DAILY_REPORT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
  );
}

export function reportStatusBadgeClass(status: DailyReportStatus): string {
  switch (status) {
    case "submitted":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "not_submitted":
      return "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300";
    case "not_required":
      return "border-amber-200/80 bg-amber-50/80 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
    default:
      return "";
  }
}

function tripTextForCheck(trip: TripEntry): string {
  return [
    trip.jobName,
    trip.shipperName,
    trip.reportSourceLabel ?? "",
  ]
    .join(" ")
    .trim();
}

export function tripIsNotRequiredWork(trip: TripEntry): boolean {
  if (isPartnerTrip(trip)) return true;
  const text = tripTextForCheck(trip);
  if (!text) return false;
  return REPORT_NOT_REQUIRED_KEYWORDS.some((kw) => text.includes(kw));
}

/** 旧 boolean / 不正値から正規化 */
export function coerceReportStatus(
  raw: unknown,
  legacySubmitted?: boolean,
): DailyReportStatus {
  if (raw === "submitted" || raw === "not_submitted" || raw === "not_required") {
    return raw;
  }
  if (legacySubmitted === true) return "submitted";
  return "not_submitted";
}

/**
 * インポート・融合時の自動判別。
 * - 傭車運行・提出不要キーワードのみの日 → not_required
 * - 日報取込で提出済フラグあり → submitted
 * - それ以外 → not_submitted
 */
export function inferReportStatus(
  record: DailyRecord,
  options?: { importedSubmitted?: boolean },
): DailyReportStatus {
  if (isPartnerRecord(record)) return "not_required";

  const trips = record.trips;
  if (trips.length > 0 && trips.every((t) => tripIsNotRequiredWork(t))) {
    return "not_required";
  }

  if (options?.importedSubmitted === true) return "submitted";

  return "not_submitted";
}

export function withInferredReportStatus(
  record: DailyRecord,
  options?: { importedSubmitted?: boolean },
): DailyRecord {
  return {
    ...record,
    reportStatus: inferReportStatus(record, options),
  };
}

export function isReportSubmissionMissing(status: DailyReportStatus): boolean {
  return status === "not_submitted";
}

/** 同一日の2レコード統合時 */
/** デジタコ日報（See-Drive）由来の実績データがあるか */
export function recordHasDrivingReportData(record: DailyRecord): boolean {
  if (record.reportedDistanceKm != null && record.reportedDistanceKm > 0) {
    return true;
  }
  if (record.trips.some((t) => Boolean(t.reportSourceLabel?.trim()))) {
    return true;
  }
  if (
    record.trips.some(
      (t) =>
        Boolean(t.jobName?.trim()) &&
        (Boolean(t.shipperName?.trim()) || Boolean(t.tollFee?.trim())),
    )
  ) {
    return true;
  }
  return false;
}

export function driverDayHasDrivingReport(
  records: DailyRecord[],
  date: string,
  driverName: string,
): boolean {
  const key = normalizeDriverName(driverName);
  return records.some(
    (r) =>
      datesMatch(r.date, date) &&
      normalizeDriverName(r.driverName) === key &&
      recordHasDrivingReportData(r),
  );
}

export function driverDayHasRollCallBook(
  records: DailyRecord[],
  date: string,
  driverName: string,
): boolean {
  const key = normalizeDriverName(driverName);
  return records.some(
    (r) =>
      datesMatch(r.date, date) &&
      normalizeDriverName(r.driverName) === key &&
      (r.rollCallPreRecorded || r.rollCallPostRecorded),
  );
}

/**
 * 点呼記録簿 × デジタコ日報の連動判定（3択）
 * - 提出不要: 点呼なし / キーワード業務のみ / 傭車
 * - 提出済: 点呼あり ＋ 日報データあり
 * - 未提出: 点呼あり ＋ 日報データなし
 */
export function resolveLinkedReportStatus(
  record: DailyRecord,
  allRecords: DailyRecord[],
): DailyReportStatus {
  if (isPartnerRecord(record)) return "not_required";

  const trips = record.trips;
  if (trips.length > 0 && trips.every((t) => tripIsNotRequiredWork(t))) {
    return "not_required";
  }

  const hasRollCall = driverDayHasRollCallBook(
    allRecords,
    record.date,
    record.driverName,
  );
  if (!hasRollCall) return "not_required";

  const hasDrivingReport = driverDayHasDrivingReport(
    allRecords,
    record.date,
    record.driverName,
  );
  if (hasDrivingReport) return "submitted";

  return "not_submitted";
}

export function applyReportStatusLinkage(
  record: DailyRecord,
  allRecords: DailyRecord[],
): DailyRecord {
  if (record.reportStatusManualOverride) {
    return record;
  }
  return {
    ...record,
    reportStatus: resolveLinkedReportStatus(record, allRecords),
  };
}

/** 全レコードの日報ステータスを点呼×日報連動で再計算 */
export function recomputeAllReportStatuses(
  records: DailyRecord[],
): DailyRecord[] {
  return records.map((r) => applyReportStatusLinkage(r, records));
}

export function mergeReportStatus(
  a: DailyReportStatus,
  b: DailyReportStatus,
  merged: DailyRecord,
): DailyReportStatus {
  if (a === "not_required" && b === "not_required") return "not_required";
  const inferred = inferReportStatus(merged);
  if (inferred === "not_required") return "not_required";
  if (a === "not_submitted" || b === "not_submitted") return "not_submitted";
  if (a === "submitted" && b === "submitted") return "submitted";
  if (a === "submitted" || b === "submitted") return "submitted";
  return inferred;
}
