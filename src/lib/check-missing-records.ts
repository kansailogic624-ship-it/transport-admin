import { normalizeDriverName } from "./driving-report-parser";
import {
  datesMatch,
  normalizeEmployeeId,
  normalizeIsoDate,
} from "./import-match-keys";
import {
  driversWithScheduleDataInMonth,
  isMissingScheduleDateForDriver,
  SCHEDULE_MISSING_MESSAGE,
} from "./schedule-gap-detection";
import { isPartnerRecord } from "./run-type";
import { recordHasDrivingReportData } from "./report-status";
import type { DailyRecord } from "./types";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** ドライバー1人×1日の入力状態ステータス */
export type DriverDayCheckStatus =
  | "schedule_missing" // FMスケジュール欠落日（元データ漏れ・赤）
  | "ok" //             全データ揃い
  | "rollcall_missing" // FMスケジュールあり・点呼なし（赤）
  | "report_missing" //   点呼あり・日報なし（赤）
  | "fm_missing" //       点呼/日報あり・FM未入力（黄）
  | "not_required" //    休み等・確認不要
  | "no_data"; //        データ皆無（リスト非表示）

/** フィルター種別 */
export type CheckFilterType =
  | "all"
  | "issues"
  | "rollcall_missing"
  | "report_missing"
  | "fm_missing";

/** ドライバー1人×1日のチェック結果 */
export type DriverDayCheck = {
  driverName: string;
  date: string;
  /** FileMaker スケジュール（timecardIn/Out）が存在する */
  hasFmSchedule: boolean;
  /** 点呼簿の記録が存在する（clockIn 非空 または rollCallPreRecorded） */
  hasRollCall: boolean;
  /** See-Drive 日報のデータが存在する */
  hasReport: boolean;
  /** 休み・事務所等で提出不要と判定済み */
  isNotRequired: boolean;
  /** 最高優先度のステータス */
  primaryStatus: DriverDayCheckStatus;
  /** 発生している問題一覧（複数あり得る） */
  issues: DriverDayCheckStatus[];
  // 表示用の代表値
  timecardIn?: string;
  timecardOut?: string;
  clockIn?: string;
  clockOut?: string;
  reportStatus: DailyRecord["reportStatus"];
  /** タイムカードとの乖離アラートがあるか */
  hasTimecardDeviation: boolean;
  /** 編集・詳細表示用の代表レコード */
  record: DailyRecord;
  /** FileMakerスケジュールから検出した休日ステータス */
  dayStatus?: DailyRecord["dayStatus"];
  /** 元Excelに当該日の行が無い欠落日プレースホルダー */
  isMissing?: boolean;
  missingMessage?: string;
};

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<DriverDayCheckStatus, number> = {
  schedule_missing: 0,
  rollcall_missing: 1,
  report_missing: 2,
  fm_missing: 3,
  ok: 4,
  not_required: 5,
  no_data: 6,
};

function createMissingPlaceholderRecord(
  driverName: string,
  date: string,
): DailyRecord {
  return {
    id: `missing-${normalizeDriverName(driverName)}-${date}`,
    date,
    operationType: "own",
    driverName,
    clockIn: "",
    clockOut: "",
    rollCallTime: "",
    reportStatus: "not_submitted",
    trips: [],
    createdAt: new Date().toISOString(),
  };
}

function buildMissingDriverDayCheck(
  driverName: string,
  date: string,
): DriverDayCheck {
  return {
    driverName,
    date,
    hasFmSchedule: false,
    hasRollCall: false,
    hasReport: false,
    isNotRequired: false,
    primaryStatus: "schedule_missing",
    issues: ["schedule_missing"],
    reportStatus: "not_submitted",
    hasTimecardDeviation: false,
    record: createMissingPlaceholderRecord(driverName, date),
    isMissing: true,
    missingMessage: SCHEDULE_MISSING_MESSAGE,
  };
}

function recordHasRollCall(r: DailyRecord): boolean {
  return Boolean(r.clockIn?.trim() || r.rollCallPreRecorded || r.rollCallPostRecorded);
}

function recordHasFmSchedule(r: DailyRecord): boolean {
  if (r.dayStatus === "公休" || r.dayStatus === "有給") return true;
  if (r.timecardIn?.trim() || r.timecardOut?.trim()) return true;
  if ((r.fusionDispatchOptions?.length ?? 0) > 0) return true;
  if (r.trips.some((t) => Boolean(t.linkedDispatchName?.trim()))) return true;
  return false;
}

function recordHasReport(r: DailyRecord): boolean {
  return r.reportStatus === "submitted" || recordHasDrivingReportData(r);
}

/** timecardIn/Out と clockIn/Out の差が 30 分以上あるか */
function hasTimecardDeviationInRecords(records: DailyRecord[]): boolean {
  function toMin(t?: string): number | null {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }
  for (const r of records) {
    const tcIn = toMin(r.timecardIn);
    const tcOut = toMin(r.timecardOut);
    const clIn = toMin(r.clockIn);
    const clOut = toMin(r.clockOut);
    if (tcIn !== null && clIn !== null && Math.abs(tcIn - clIn) >= 30) return true;
    if (tcOut !== null && clOut !== null && Math.abs(tcOut - clOut) >= 30) return true;
  }
  return false;
}

/** 同一ドライバー×日の複数レコードを集約してチェック結果を生成 */
function assessDriverRecords(records: DailyRecord[]): DriverDayCheck {
  const primary = records[0]!;

  const hasDayStatus = records.some(
    (r) => r.dayStatus === "公休" || r.dayStatus === "有給",
  );
  const dayStatus = records.find((r) => r.dayStatus)?.dayStatus;

  const isNotRequired =
    hasDayStatus ||
    records.every((r) => isPartnerRecord(r)) ||
    records.every((r) => r.reportStatus === "not_required");

  const hasFmSchedule = records.some(recordHasFmSchedule);
  const hasRollCall = records.some(recordHasRollCall);
  const hasReport = records.some(recordHasReport);

  // 代表値として最初にデータを持つレコードを採用
  const fmRec = records.find(recordHasFmSchedule);
  const rcRec = records.find(recordHasRollCall);

  const issues: DriverDayCheckStatus[] = [];
  if (!isNotRequired) {
    if (hasFmSchedule && !hasRollCall) issues.push("rollcall_missing");
    if (hasRollCall && !hasReport) issues.push("report_missing");
    if ((hasRollCall || hasReport) && !hasFmSchedule) issues.push("fm_missing");
  }

  let primaryStatus: DriverDayCheckStatus;
  if (isNotRequired) {
    primaryStatus = "not_required";
  } else if (issues.includes("rollcall_missing")) {
    primaryStatus = "rollcall_missing";
  } else if (issues.includes("report_missing")) {
    primaryStatus = "report_missing";
  } else if (issues.includes("fm_missing")) {
    primaryStatus = "fm_missing";
  } else if (hasFmSchedule || hasRollCall || hasReport) {
    primaryStatus = "ok";
  } else {
    primaryStatus = "no_data";
  }

  return {
    driverName: primary.driverName,
    date: normalizeIsoDate(primary.date) || primary.date,
    hasFmSchedule,
    hasRollCall,
    hasReport,
    isNotRequired,
    primaryStatus,
    issues,
    timecardIn: fmRec?.timecardIn,
    timecardOut: fmRec?.timecardOut,
    clockIn: rcRec?.clockIn ?? primary.clockIn,
    clockOut: rcRec?.clockOut ?? primary.clockOut,
    reportStatus: primary.reportStatus,
    hasTimecardDeviation: hasTimecardDeviationInRecords(records),
    record: primary,
    dayStatus,
  };
}

/** 社員IDが一致する別名グループを統合（FMと点呼で名前表記が異なる場合の救済） */
function mergeDriverGroupsByEmployeeId(
  groups: Map<string, DailyRecord[]>,
): DailyRecord[][] {
  const entries = [...groups.entries()];
  const parent = new Map<string, string>();

  function find(key: string): string {
    const p = parent.get(key) ?? key;
    if (p !== key) {
      const root = find(p);
      parent.set(key, root);
      return root;
    }
    return key;
  }

  function union(a: string, b: string): void {
    parent.set(find(a), find(b));
  }

  const idToKeys = new Map<string, string[]>();
  for (const [key, recs] of entries) {
    for (const r of recs) {
      const eid = normalizeEmployeeId(r.employeeId);
      if (!eid) continue;
      const list = idToKeys.get(eid) ?? [];
      list.push(key);
      idToKeys.set(eid, list);
    }
  }

  for (const keys of idToKeys.values()) {
    if (keys.length <= 1) continue;
    const head = keys[0]!;
    for (let i = 1; i < keys.length; i++) union(head, keys[i]!);
  }

  const merged = new Map<string, DailyRecord[]>();
  for (const [key, recs] of entries) {
    const root = find(key);
    const bucket = merged.get(root) ?? [];
    bucket.push(...recs);
    merged.set(root, bucket);
  }

  return Array.from(merged.values()).map((recs) => {
    const seen = new Set<string>();
    return recs.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  });
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * 指定日の全ドライバーのチェック結果を生成する。
 * - ドライバー名で重複集約
 * - 重大度順にソート（rollcall_missing が最上位）
 * - no_data は除外
 */
export function buildDriverDayChecks(
  allRecords: DailyRecord[],
  date: string,
): DriverDayCheck[] {
  const forDate = allRecords.filter((r) => datesMatch(r.date, date));

  const driverMap = new Map<string, DailyRecord[]>();
  for (const record of forDate) {
    const key = normalizeDriverName(record.driverName);
    if (!driverMap.has(key)) driverMap.set(key, []);
    driverMap.get(key)!.push(record);
  }

  // 社員IDが一致するが名前表記が異なるレコードを同一グループに統合
  const mergedGroups = mergeDriverGroupsByEmployeeId(driverMap);

  const checks = mergedGroups
    .map(assessDriverRecords)
    .filter((c) => c.primaryStatus !== "no_data");

  const presentDrivers = new Set(
    checks.map((c) => normalizeDriverName(c.driverName)),
  );
  const yearMonth = date.slice(0, 7);

  for (const driverName of driversWithScheduleDataInMonth(allRecords, yearMonth)) {
    if (presentDrivers.has(normalizeDriverName(driverName))) continue;
    if (!isMissingScheduleDateForDriver(allRecords, date, driverName)) continue;
    checks.push(buildMissingDriverDayCheck(driverName, date));
  }

  return checks.sort(
    (a, b) =>
      (STATUS_ORDER[a.primaryStatus] ?? 99) -
      (STATUS_ORDER[b.primaryStatus] ?? 99),
  );
}

/** フィルター適用 */
export function filterChecks(
  checks: DriverDayCheck[],
  filter: CheckFilterType,
): DriverDayCheck[] {
  if (filter === "all") return checks;
  if (filter === "issues") return checks.filter((c) => c.issues.length > 0);
  return checks.filter((c) =>
    c.issues.includes(filter as DriverDayCheckStatus),
  );
}

/** ステータスの日本語ラベル */
export function statusLabel(status: DriverDayCheckStatus): string {
  switch (status) {
    case "schedule_missing":
      return "未入力警告";
    case "ok":
      return "正常";
    case "rollcall_missing":
      return "点呼漏れ";
    case "report_missing":
      return "日報漏れ";
    case "fm_missing":
      return "FM未登録";
    case "not_required":
      return "提出不要";
    case "no_data":
      return "データなし";
  }
}

/** レコード全体からデータが存在する日付を新しい順で返す */
export function availableDates(records: DailyRecord[]): string[] {
  const dates = new Set(
    records
      .map((r) => normalizeIsoDate(r.date))
      .filter(Boolean),
  );
  return Array.from(dates).sort().reverse();
}

/** 指定日に問題があるドライバー数のサマリ */
export type DayCheckSummary = {
  total: number;
  issues: number;
  scheduleMissing: number;
  rollcallMissing: number;
  reportMissing: number;
  fmMissing: number;
  deviations: number;
};

export function summarizeChecks(checks: DriverDayCheck[]): DayCheckSummary {
  return {
    total: checks.length,
    issues: checks.filter((c) => c.issues.length > 0).length,
    scheduleMissing: checks.filter((c) =>
      c.issues.includes("schedule_missing"),
    ).length,
    rollcallMissing: checks.filter((c) =>
      c.issues.includes("rollcall_missing"),
    ).length,
    reportMissing: checks.filter((c) =>
      c.issues.includes("report_missing"),
    ).length,
    fmMissing: checks.filter((c) => c.issues.includes("fm_missing")).length,
    deviations: checks.filter((c) => c.hasTimecardDeviation).length,
  };
}
