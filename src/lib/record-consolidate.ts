import { normalizeDriverName } from "./driving-report-parser";
import { normalizeIsoDate } from "./import-match-keys";
import { applyDayRevenueToTrips, dailyRevenueFromTrips } from "./day-revenue";
import { mergeReportStatus } from "./report-status";
import { normalizeRecord } from "./trip-normalize";
import type { DailyRecord, FusionDispatchOption, TripEntry } from "./types";

export function driverDayKey(
  date: string,
  driverName: string,
  vehicleNumber?: string,
): string {
  const v = vehicleNumber?.trim() ?? "";
  return `${normalizeIsoDate(date)}|${normalizeDriverName(driverName)}|${v}`;
}

/** 1人×1日で統合（車両が違っても同一日は1レコード） */
export function recordDayKey(record: DailyRecord): string {
  return driverDayKey(record.date, record.driverName);
}

function mergeFusionOptions(
  a: FusionDispatchOption[] = [],
  b: FusionDispatchOption[] = [],
): FusionDispatchOption[] {
  const seen = new Set<string>();
  const out: FusionDispatchOption[] = [];
  for (const o of [...a, ...b]) {
    if (!o.dispatchName || seen.has(o.dispatchName)) continue;
    seen.add(o.dispatchName);
    out.push(o);
  }
  return out;
}

function dedupeTrips(trips: TripEntry[]): TripEntry[] {
  const seen = new Set<string>();
  const out: TripEntry[] = [];
  for (const t of trips) {
    const key = `${t.reportSourceLabel ?? ""}|${t.jobName}|${t.shipperName}|${t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** 同一ドライバー×日付（＋車両）の2レコードを1日分に統合 */
export function mergeTwoDailyRecords(
  a: DailyRecord,
  b: DailyRecord,
): DailyRecord {
  const keepId = a.createdAt <= b.createdAt ? a.id : b.id;
  const primary = a.createdAt <= b.createdAt ? a : b;
  const secondary = a.createdAt <= b.createdAt ? b : a;

  const trips = dedupeTrips([...primary.trips, ...secondary.trips]);

  // FM配車では業務ごとに異なる売上が設定される（per-trip モデル）。
  // 2種類以上の異なる売上が既に存在する場合は再配分せずそのまま保持する。
  // 同値または単一の場合は従来の「1日1売上→先頭集約」モデルを適用する。
  const nonZeroRevs = trips
    .map((t) => Number(String(t.revenue).replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const uniqueRevCount = new Set(nonZeroRevs).size;

  const mergedTrips =
    uniqueRevCount > 1
      ? trips // 異なる売上が複数 → 各トリップの売上を保持
      : applyDayRevenueToTrips(trips, dailyRevenueFromTrips(trips)); // 単一売上 → 先頭集約

  const km = Math.max(
    primary.reportedDistanceKm ?? 0,
    secondary.reportedDistanceKm ?? 0,
  );

  const clockIn = primary.clockInManualOverride
    ? primary.clockIn
    : secondary.clockInManualOverride
      ? secondary.clockIn
      : primary.clockIn || secondary.clockIn;
  const clockOut = primary.clockOutManualOverride
    ? primary.clockOut
    : secondary.clockOutManualOverride
      ? secondary.clockOut
      : secondary.clockOut || primary.clockOut;
  const rollCallTime = primary.clockInManualOverride
    ? primary.rollCallTime
    : secondary.clockInManualOverride
      ? secondary.rollCallTime
      : primary.rollCallTime || secondary.rollCallTime;
  const rollCallEndTime =
    primary.rollCallEndTime || secondary.rollCallEndTime || undefined;

  // タイムカードは新しい方（secondary）を優先し、なければ primary を保持
  const timecardIn =
    secondary.timecardIn || primary.timecardIn || undefined;
  const timecardOut =
    secondary.timecardOut || primary.timecardOut || undefined;

  const hasRevenueTrips = mergedTrips.some(
    (t) => Number(String(t.revenue).replace(/,/g, "")) > 0,
  );
  const dayStatus = hasRevenueTrips
    ? undefined
    : primary.dayStatus === "有給" || secondary.dayStatus === "有給"
      ? "有給"
      : primary.dayStatus === "公休" || secondary.dayStatus === "公休"
        ? "公休"
        : undefined;

  const base = normalizeRecord({
    ...primary,
    id: keepId,
    clockIn,
    clockOut,
    rollCallTime,
    rollCallEndTime,
    reportedDistanceKm: km > 0 ? km : undefined,
    trips: mergedTrips,
    dayStatus,
    fusionDispatchOptions: mergeFusionOptions(
      primary.fusionDispatchOptions,
      secondary.fusionDispatchOptions,
    ),
    primaryLinkedDispatchName:
      primary.primaryLinkedDispatchName ??
      secondary.primaryLinkedDispatchName,
    isFusionDraft: primary.isFusionDraft || secondary.isFusionDraft,
    rollCallPreRecorded:
      primary.rollCallPreRecorded || secondary.rollCallPreRecorded,
    rollCallPostRecorded:
      primary.rollCallPostRecorded || secondary.rollCallPostRecorded,
    employeeId: primary.employeeId ?? secondary.employeeId,
    timecardIn,
    timecardOut,
  });

  let reportStatus = mergeReportStatus(
    primary.reportStatus,
    secondary.reportStatus,
    base,
  );
  if (primary.reportStatusManualOverride) {
    reportStatus = primary.reportStatus;
  } else if (secondary.reportStatusManualOverride) {
    reportStatus = secondary.reportStatus;
  }

  return {
    ...base,
    reportStatus,
    reportStatusManualOverride:
      primary.reportStatusManualOverride ||
      secondary.reportStatusManualOverride,
    clockInManualOverride:
      primary.clockInManualOverride || secondary.clockInManualOverride,
    clockOutManualOverride:
      primary.clockOutManualOverride || secondary.clockOutManualOverride,
  };
}

/** ストレージ・インポート後：同じ人の同じ日の重複レコードを1件にまとめる */
export function consolidateDailyRecordsByDriverDay(
  records: DailyRecord[],
): DailyRecord[] {
  const map = new Map<string, DailyRecord>();
  const order: string[] = [];

  for (const record of records) {
    const key = recordDayKey(record);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, record);
      order.push(key);
      continue;
    }
    map.set(key, mergeTwoDailyRecords(existing, record));
  }

  return order.map((k) => map.get(k)!);
}
