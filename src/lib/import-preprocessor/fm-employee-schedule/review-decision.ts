import { normalizeDriverName } from "@/lib/driving-report-parser";
import type { PreprocessResult } from "../types";
import {
  buildFmEmployeeDaySummaries,
  buildFmOperationSummaries,
  buildFmScheduleAmountTotals,
} from "./build-result";
import {
  applyFmRecordDecisionSnapshot,
  captureFmRecordDecisionSnapshot,
  createReviewDecisionHistoryEntry,
  type FmReviewDecisionHistoryEntry,
} from "./record-snapshot";
import {
  applyJointDecisionToWarnings,
  countWarningRows,
  getCurrentWarnings,
} from "./warning-tracking";
import type {
  FmEmployeeScheduleStagingRecord,
  FmJointOperationMember,
  FmOperationHumanReviewCategory,
  FmReviewDecisionRule,
  FmReviewDecisionScope,
  FmReviewDecisionType,
  FmScheduleInfoCode,
  FmScheduleWarningCode,
} from "./types";

export type {
  FmReviewDecisionRule,
  FmReviewDecisionScope,
  FmReviewDecisionType,
} from "./types";

export const FM_REVIEW_DECISION_LABELS: Record<FmReviewDecisionType, string> = {
  joint_operation: "共同作業として扱う",
  separate_operations: "別作業として扱う",
  ride_along_training: "同乗教育として扱う",
  needs_review: "要確認のまま",
};

export const FM_REVIEW_DECISION_SCOPE_LABELS: Record<FmReviewDecisionScope, string> =
  {
    this_row_only: "この行のみ",
    this_date_only: "この日付のみ",
    same_shipper_job: "同じ荷主・業務（全日付）",
    same_shipper_job_vehicle_pattern: "荷主・業務＋複数車両パターン",
  };

const STORAGE_KEY = "fm-schedule-review-decision-rules";

const JOINT_WARNING_CODES = new Set<FmScheduleWarningCode>([
  "JOINT_OPERATION_MISSING_VEHICLE",
  "POSSIBLE_RIDE_ALONG_TRAINING",
  "REQUIRES_HUMAN_REVIEW",
]);

const JOINT_INFO_CODES = new Set<FmScheduleInfoCode>(["JOINT_OPERATION_DETECTED"]);

export function buildReviewDecisionKey(input: {
  sourceType: "filemaker_employee_schedule";
  shipperCanonical: string | null;
  jobCanonical: string | null;
}): string {
  return [
    input.sourceType,
    input.shipperCanonical?.trim() || "—",
    input.jobCanonical?.trim() || "—",
  ].join(":");
}

function effectiveVehicle(record: FmEmployeeScheduleStagingRecord): string {
  return (
    record.vehicleNumberCanonical?.trim() ||
    record.vehicleNumberFilled?.trim() ||
    record.vehicleNumberOriginal.trim()
  );
}

function singleMember(
  record: FmEmployeeScheduleStagingRecord,
): FmJointOperationMember {
  return {
    employeeCanonicalId: record.employeeCanonicalId,
    employeeNameCanonical: record.employeeNameCanonical,
    employeeNameOriginal: record.employeeNameOriginal,
    revenueAmount: record.revenueAmount ?? 0,
    vehicleNumberOriginal: record.vehicleNumberOriginal,
    vehicleNumberFilled: record.vehicleNumberFilled,
    vehicleNumberCanonical: record.vehicleNumberCanonical,
  };
}

function stripJointFlags(record: FmEmployeeScheduleStagingRecord): {
  warningFlags: FmScheduleWarningCode[];
  currentWarningFlags: FmScheduleWarningCode[];
  infoFlags: FmScheduleInfoCode[];
} {
  const current = getCurrentWarnings(record).filter(
    (f) => !JOINT_WARNING_CODES.has(f),
  );
  return {
    warningFlags: current,
    currentWarningFlags: current,
    infoFlags: record.infoFlags.filter((f) => !JOINT_INFO_CODES.has(f)),
  };
}

function decisionToHumanCategory(
  decision: FmReviewDecisionType,
): FmOperationHumanReviewCategory {
  switch (decision) {
    case "joint_operation":
      return "joint_two_man";
    case "ride_along_training":
      return "ride_along_training";
    case "needs_review":
      return null;
    case "separate_operations":
      return null;
    default:
      return null;
  }
}

function applyDecisionToRecord(
  record: FmEmployeeScheduleStagingRecord,
  decision: FmReviewDecisionType,
  decidedBy?: string,
): FmEmployeeScheduleStagingRecord {
  const stripped = stripJointFlags(record);
  const amount = record.revenueAmount ?? 0;
  const employeeShare = record.isPartnerLikeRow ? 0 : amount;

  let next: FmEmployeeScheduleStagingRecord;

  if (decision === "separate_operations") {
    next = {
      ...record,
      ...stripped,
      isJointOperation: false,
      jointOperationMemberCount: 1,
      jointOperationMembers: [singleMember(record)],
      operationRevenueAmount: amount,
      employeeRevenueShareAmount: employeeShare,
      operationGroupKey: record.employeeJobKey,
      requiresHumanReview: false,
      humanReviewCategory: null,
      jointOperationReviewDecision: decision,
      updatedAt: new Date().toISOString(),
    };
  } else if (decision === "joint_operation") {
    next = {
      ...record,
      ...stripped,
      operationGroupKey: record.jointJobKey,
      requiresHumanReview: false,
      humanReviewCategory: "joint_two_man",
      jointOperationReviewDecision: decision,
      infoFlags: record.isJointOperation
        ? [...stripped.infoFlags, "JOINT_OPERATION_DETECTED"]
        : stripped.infoFlags,
      updatedAt: new Date().toISOString(),
    };
  } else if (decision === "ride_along_training") {
    const current = getCurrentWarnings(record).filter(
      (f) => !JOINT_WARNING_CODES.has(f) || f === "POSSIBLE_RIDE_ALONG_TRAINING",
    );
    next = {
      ...record,
      warningFlags: [
        ...current.filter((f) => f !== "POSSIBLE_RIDE_ALONG_TRAINING"),
        "REQUIRES_HUMAN_REVIEW",
      ],
      currentWarningFlags: [
        ...current.filter((f) => f !== "POSSIBLE_RIDE_ALONG_TRAINING"),
        "REQUIRES_HUMAN_REVIEW",
      ],
      infoFlags: stripped.infoFlags,
      operationGroupKey: record.jointJobKey,
      requiresHumanReview: true,
      humanReviewCategory: "ride_along_training",
      jointOperationReviewDecision: decision,
      updatedAt: new Date().toISOString(),
    };
  } else {
    next = {
      ...record,
      warningFlags: [...stripped.warningFlags, "REQUIRES_HUMAN_REVIEW"],
      currentWarningFlags: [...stripped.warningFlags, "REQUIRES_HUMAN_REVIEW"],
      infoFlags: stripped.infoFlags,
      operationGroupKey: record.jointJobKey,
      requiresHumanReview: true,
      humanReviewCategory: null,
      jointOperationReviewDecision: decision,
      updatedAt: new Date().toISOString(),
    };
  }

  return applyJointDecisionToWarnings(next, decision, decidedBy);
}

/** 単一行へ共同作業判断を適用（修正画面保存用） */
export function applyReviewDecisionToRecord(
  record: FmEmployeeScheduleStagingRecord,
  decision: FmReviewDecisionType,
  decidedBy?: string,
): FmEmployeeScheduleStagingRecord {
  return applyDecisionToRecord(record, decision, decidedBy);
}

function ruleMatchesRecord(
  rule: FmReviewDecisionRule,
  record: FmEmployeeScheduleStagingRecord,
): boolean {
  if (record.isAttendanceOnlyRow) return false;

  const shipper = record.shipperNameCanonical?.trim() || "—";
  const job = record.jobNameCanonical?.trim() || "—";
  if (shipper !== rule.shipperCanonical || job !== rule.jobCanonical) {
    return false;
  }

  switch (rule.scope) {
    case "this_row_only":
      return rule.recordIds?.includes(record.id) ?? false;
    case "this_date_only":
      return record.businessDate === rule.businessDate;
    case "same_shipper_job":
      return true;
    case "same_shipper_job_vehicle_pattern": {
      return true;
    }
    default:
      return false;
  }
}

function ruleSpecificity(rule: FmReviewDecisionRule): number {
  switch (rule.scope) {
    case "this_row_only":
      return 4;
    case "this_date_only":
      return 3;
    case "same_shipper_job_vehicle_pattern":
      return 2;
    case "same_shipper_job":
      return 1;
    default:
      return 0;
  }
}

function vehiclePatternApplies(
  records: FmEmployeeScheduleStagingRecord[],
  rule: FmReviewDecisionRule,
): boolean {
  const candidates = records.filter(
    (r) =>
      !r.isAttendanceOnlyRow &&
      r.shipperNameCanonical?.trim() === rule.shipperCanonical &&
      r.jobNameCanonical?.trim() === rule.jobCanonical,
  );
  const vehicles = new Set(
    candidates.map((r) => effectiveVehicle(r)).filter(Boolean),
  );
  return vehicles.size >= 2;
}

export function applyFmReviewDecisionRules(
  records: FmEmployeeScheduleStagingRecord[],
  rules: FmReviewDecisionRule[],
): FmEmployeeScheduleStagingRecord[] {
  if (rules.length === 0) return records;

  const sorted = [...rules].sort(
    (a, b) => ruleSpecificity(b) - ruleSpecificity(a),
  );

  const decisionByRecordId = new Map<string, FmReviewDecisionType>();

  for (const record of records) {
    if (record.isAttendanceOnlyRow) continue;

    for (const rule of sorted) {
      if (!ruleMatchesRecord(rule, record)) continue;
      if (
        rule.scope === "same_shipper_job_vehicle_pattern" &&
        !vehiclePatternApplies(records, rule)
      ) {
        continue;
      }
      decisionByRecordId.set(record.id, rule.decisionType);
      break;
    }
  }

  return records.map((record) => {
    const decision = decisionByRecordId.get(record.id);
    if (!decision) return record;
    return applyDecisionToRecord(record, decision);
  });
}

export function createReviewDecisionRule(input: {
  jointJobKey: string;
  decisionType: FmReviewDecisionType;
  scope: FmReviewDecisionScope;
  shipperCanonical: string | null;
  jobCanonical: string | null;
  businessDate?: string;
  recordIds?: string[];
  note?: string;
}): FmReviewDecisionRule {
  const shipper = input.shipperCanonical?.trim() || "—";
  const job = input.jobCanonical?.trim() || "—";
  const scopePart =
    input.scope === "this_date_only" ? `:${input.businessDate ?? ""}` : "";
  const rowPart =
    input.scope === "this_row_only"
      ? `:${(input.recordIds ?? []).join(",")}`
      : "";

  return {
    id: `fmsrd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceType: "filemaker_employee_schedule",
    decisionKey: buildReviewDecisionKey({
      sourceType: "filemaker_employee_schedule",
      shipperCanonical: shipper,
      jobCanonical: job,
    }),
    decisionType: input.decisionType,
    scope: input.scope,
    shipperCanonical: shipper,
    jobCanonical: job,
    businessDate: input.businessDate,
    recordIds: input.recordIds,
    createdAt: new Date().toISOString(),
    note: input.note,
    // unique id suffix for same key different scopes
    ...(scopePart || rowPart ? {} : {}),
  };
}

export function loadFmReviewDecisionRules(): FmReviewDecisionRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FmReviewDecisionRule[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFmReviewDecisionRules(rules: FmReviewDecisionRule[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function upsertFmReviewDecisionRule(
  rules: FmReviewDecisionRule[],
  rule: FmReviewDecisionRule,
): FmReviewDecisionRule[] {
  const key = `${rule.decisionKey}:${rule.scope}:${rule.businessDate ?? ""}:${(rule.recordIds ?? []).join(",")}`;
  const filtered = rules.filter((existing) => {
    const existingKey = `${existing.decisionKey}:${existing.scope}:${existing.businessDate ?? ""}:${(existing.recordIds ?? []).join(",")}`;
    return existingKey !== key;
  });
  return [rule, ...filtered];
}

function appendReviewHistory(
  result: PreprocessResult,
  entry: FmReviewDecisionHistoryEntry,
): FmReviewDecisionHistoryEntry[] {
  return [entry, ...(result.fmReviewDecisionHistory ?? [])];
}

export function rebuildFmSchedulePreprocessResult(
  result: PreprocessResult,
  records: FmEmployeeScheduleStagingRecord[],
  reviewDecisionRules: FmReviewDecisionRule[],
  history?: FmReviewDecisionHistoryEntry[],
): PreprocessResult {
  const daySummaries = buildFmEmployeeDaySummaries(records);
  const operationSummaries = buildFmOperationSummaries(records);
  const fmScheduleTotals = buildFmScheduleAmountTotals(
    records,
    daySummaries,
    operationSummaries,
  );

  const warningRows = countWarningRows(records);
  const reconciliation = fmScheduleTotals.revenueReconciliation;
  const parseWarnings = result.warnings
    .filter((w) => w.code !== "REVENUE_RECONCILIATION_MISMATCH")
    .map((w) => w.message);

  if (!reconciliation.isBalanced) {
    parseWarnings.push(
      `REVENUE_RECONCILIATION_MISMATCH: ${reconciliation.mismatchReasons.join(" / ")}`,
    );
  }

  return {
    ...result,
    successRows: Math.max(0, records.length - warningRows),
    warningRows,
    fmScheduleRecords: records,
    fmEmployeeDaySummaries: daySummaries,
    fmOperationSummaries: operationSummaries,
    fmScheduleTotals,
    fmReviewDecisionRules: reviewDecisionRules,
    fmReviewDecisionHistory: history ?? result.fmReviewDecisionHistory ?? [],
    warnings: parseWarnings.map((message) => ({
      code: message.startsWith("REVENUE_RECONCILIATION_MISMATCH")
        ? "REVENUE_RECONCILIATION_MISMATCH"
        : "PARSE_WARNING",
      message,
    })),
  };
}

export function applyFmScheduleReviewDecision(input: {
  result: PreprocessResult;
  jointJobKey: string;
  decisionType: FmReviewDecisionType;
  scope: FmReviewDecisionScope;
  saveRule?: boolean;
  existingRules?: FmReviewDecisionRule[];
}): PreprocessResult {
  const records = input.result.fmScheduleRecords ?? [];
  const groupRows = records.filter(
    (r) => r.jointJobKey === input.jointJobKey && !r.isAttendanceOnlyRow,
  );
  if (groupRows.length === 0) return input.result;

  const sample = groupRows[0]!;
  const recordIds =
    input.scope === "this_row_only"
      ? groupRows.map((r) => r.id)
      : undefined;

  const rule = createReviewDecisionRule({
    jointJobKey: input.jointJobKey,
    decisionType: input.decisionType,
    scope: input.scope,
    shipperCanonical: sample.shipperNameCanonical,
    jobCanonical: sample.jobNameCanonical,
    businessDate:
      input.scope === "this_date_only" ? sample.businessDate : undefined,
    recordIds,
  });

  let rules = input.existingRules ?? input.result.fmReviewDecisionRules ?? [];
  if (input.saveRule !== false) {
    rules = upsertFmReviewDecisionRule(rules, rule);
    saveFmReviewDecisionRules(rules);
  }

  const allRules = input.saveRule === false ? [rule, ...rules] : rules;

  const beforeSnapshots = snapshotMapForGroup(groupRows);
  const updatedRecords = applyFmReviewDecisionRules(records, allRules);
  const afterGroupRows = updatedRecords.filter((r) =>
    groupRows.some((g) => g.id === r.id),
  );
  const afterSnapshots = snapshotMapForGroup(afterGroupRows);

  const historyEntry = createReviewDecisionHistoryEntry({
    targetKey: input.jointJobKey,
    recordIds: groupRows.map((r) => r.id),
    decisionType: input.decisionType,
    decisionScope: input.scope,
    originalState: beforeSnapshots,
    currentState: afterSnapshots,
  });

  const history = appendReviewHistory(input.result, historyEntry);

  return rebuildFmSchedulePreprocessResult(
    input.result,
    updatedRecords,
    rules,
    history,
  );
}

function snapshotMapForGroup(
  rows: FmEmployeeScheduleStagingRecord[],
): Record<string, ReturnType<typeof captureFmRecordDecisionSnapshot>> {
  const map: Record<string, ReturnType<typeof captureFmRecordDecisionSnapshot>> =
    {};
  for (const row of rows) {
    map[row.id] = captureFmRecordDecisionSnapshot(row);
  }
  return map;
}

/** 共同作業判断を取込直後の originalState に戻す */
export function revertFmScheduleReviewDecision(input: {
  result: PreprocessResult;
  jointJobKey: string;
}): PreprocessResult {
  const records = input.result.fmScheduleRecords ?? [];
  const groupRows = records.filter(
    (r) => r.jointJobKey === input.jointJobKey && !r.isAttendanceOnlyRow,
  );
  if (groupRows.length === 0) return input.result;

  const beforeSnapshots = snapshotMapForGroup(groupRows);

  const updatedRecords = records.map((record) => {
    const inGroup = groupRows.some((g) => g.id === record.id);
    if (!inGroup || !record.originalState) return record;
    const { capturedAt: _capturedAt, ...snapshot } = record.originalState;
    return applyFmRecordDecisionSnapshot(record, snapshot);
  });

  const afterGroupRows = updatedRecords.filter((r) =>
    groupRows.some((g) => g.id === r.id),
  );

  let rules = (input.result.fmReviewDecisionRules ?? []).filter((rule) => {
    const sample = groupRows[0]!;
    const shipper = sample.shipperNameCanonical?.trim() || "—";
    const job = sample.jobNameCanonical?.trim() || "—";
    return !(rule.shipperCanonical === shipper && rule.jobCanonical === job);
  });
  saveFmReviewDecisionRules(rules);

  const historyEntry = createReviewDecisionHistoryEntry({
    targetKey: input.jointJobKey,
    recordIds: groupRows.map((r) => r.id),
    decisionType: "revert",
    decisionScope: null,
    originalState: beforeSnapshots,
    currentState: snapshotMapForGroup(afterGroupRows),
    decisionNote: "取込直後の状態に戻しました",
  });

  const history = appendReviewHistory(input.result, historyEntry);

  return rebuildFmSchedulePreprocessResult(
    input.result,
    updatedRecords,
    rules,
    history,
  );
}

/** 自動判定のみで共同作業になったグループ（ユーザー未確定） */
export function isAutoDetectedJointGroup(
  rows: FmEmployeeScheduleStagingRecord[],
): boolean {
  if (rows.length < 2) return false;
  if (!rows.some((r) => r.isJointOperation)) return false;
  return rows.every((r) => !r.jointOperationReviewDecision);
}

export function memberLabel(record: FmEmployeeScheduleStagingRecord): string {
  return (
    record.employeeNameCanonical ??
    normalizeDriverName(record.employeeNameOriginal) ??
    record.employeeNameOriginal
  );
}
