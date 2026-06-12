import type { FmWarningReviewDecision } from "./warning-tracking";
import type {
  FmEmployeeScheduleStagingRecord,
  FmJointOperationMember,
  FmManualEditHistoryEntry,
  FmManualVehicleFill,
  FmOperationHumanReviewCategory,
  FmReviewDecisionType,
  FmScheduleInfoCode,
  FmScheduleWarningCode,
} from "./types";

const MAX_SAVE_SNAPSHOTS = 10;

/** 判断・警告に関わるフィールドのスナップショット */
export type FmRecordDecisionSnapshot = {
  isJointOperation: boolean;
  jointOperationMemberCount: number;
  jointOperationMembers: FmJointOperationMember[];
  operationRevenueAmount: number | null;
  employeeRevenueShareAmount: number;
  operationGroupKey: string;
  jointOperationReviewDecision: FmReviewDecisionType | null;
  requiresHumanReview: boolean;
  humanReviewCategory: FmOperationHumanReviewCategory;
  warningFlags: FmScheduleWarningCode[];
  originalWarningFlags: FmScheduleWarningCode[];
  currentWarningFlags: FmScheduleWarningCode[];
  resolvedWarningFlags: FmScheduleWarningCode[];
  onHoldWarningFlags: FmScheduleWarningCode[];
  reviewDecisions: FmWarningReviewDecision[];
  infoFlags: FmScheduleInfoCode[];
  vehicleNumberFilled: string | null;
  vehicleNumberFilledSource: string | null;
  vehicleNumberFilledReason: string | null;
  vehicleNumberFilledFromRowNumber: number | null;
  manualVehicleFill: FmManualVehicleFill | null;
  manualEditHistory: FmManualEditHistoryEntry[];
};

export type FmRecordOriginalState = FmRecordDecisionSnapshot & {
  capturedAt: string;
};

export type FmRecordSaveSnapshot = FmRecordDecisionSnapshot & {
  snapshotId: string;
  savedAt: string;
};

export type FmReviewDecisionHistoryEntry = {
  id: string;
  targetKind: "joint_group";
  targetKey: string;
  recordIds: string[];
  decisionType: FmReviewDecisionType | "revert";
  decisionScope: import("./types").FmReviewDecisionScope | null;
  originalState: Record<string, FmRecordDecisionSnapshot>;
  currentState: Record<string, FmRecordDecisionSnapshot>;
  decidedAt: string;
  decidedBy: string;
  decisionNote?: string;
};

export function captureFmRecordDecisionSnapshot(
  record: FmEmployeeScheduleStagingRecord,
): FmRecordDecisionSnapshot {
  return {
    isJointOperation: record.isJointOperation,
    jointOperationMemberCount: record.jointOperationMemberCount,
    jointOperationMembers: record.jointOperationMembers.map((m) => ({ ...m })),
    operationRevenueAmount: record.operationRevenueAmount,
    employeeRevenueShareAmount: record.employeeRevenueShareAmount,
    operationGroupKey: record.operationGroupKey,
    jointOperationReviewDecision: record.jointOperationReviewDecision,
    requiresHumanReview: record.requiresHumanReview,
    humanReviewCategory: record.humanReviewCategory,
    warningFlags: [...record.warningFlags],
    originalWarningFlags: [...(record.originalWarningFlags ?? record.warningFlags)],
    currentWarningFlags: [...(record.currentWarningFlags ?? record.warningFlags)],
    resolvedWarningFlags: [...(record.resolvedWarningFlags ?? [])],
    onHoldWarningFlags: [...(record.onHoldWarningFlags ?? [])],
    reviewDecisions: [...(record.reviewDecisions ?? [])],
    infoFlags: [...record.infoFlags],
    vehicleNumberFilled: record.vehicleNumberFilled,
    vehicleNumberFilledSource: record.vehicleNumberFilledSource,
    vehicleNumberFilledReason: record.vehicleNumberFilledReason,
    vehicleNumberFilledFromRowNumber: record.vehicleNumberFilledFromRowNumber,
    manualVehicleFill: record.manualVehicleFill
      ? { ...record.manualVehicleFill }
      : null,
    manualEditHistory: (record.manualEditHistory ?? []).map((e) => ({ ...e })),
  };
}

export function attachFmRecordOriginalStates(
  records: FmEmployeeScheduleStagingRecord[],
): FmEmployeeScheduleStagingRecord[] {
  const capturedAt = new Date().toISOString();
  return records.map((record) => {
    if (record.originalState) return record;
    const snapshot = captureFmRecordDecisionSnapshot(record);
    return {
      ...record,
      originalState: { ...snapshot, capturedAt },
      saveSnapshots: record.saveSnapshots ?? [],
      lastManualEditBy: record.lastManualEditBy ?? null,
      lastManualEditAt: record.lastManualEditAt ?? null,
      lastManualEditSummary: record.lastManualEditSummary ?? null,
    };
  });
}

export function applyFmRecordDecisionSnapshot(
  record: FmEmployeeScheduleStagingRecord,
  snapshot: FmRecordDecisionSnapshot,
): FmEmployeeScheduleStagingRecord {
  return {
    ...record,
    ...snapshot,
    jointOperationMembers: snapshot.jointOperationMembers.map((m) => ({ ...m })),
    warningFlags: [...snapshot.warningFlags],
    originalWarningFlags: [...snapshot.originalWarningFlags],
    currentWarningFlags: [...snapshot.currentWarningFlags],
    resolvedWarningFlags: [...snapshot.resolvedWarningFlags],
    onHoldWarningFlags: [...snapshot.onHoldWarningFlags],
    reviewDecisions: [...snapshot.reviewDecisions],
    infoFlags: [...snapshot.infoFlags],
    manualEditHistory: snapshot.manualEditHistory.map((e) => ({ ...e })),
    manualVehicleFill: snapshot.manualVehicleFill
      ? { ...snapshot.manualVehicleFill }
      : null,
    updatedAt: new Date().toISOString(),
  };
}

export function pushSaveSnapshot(
  record: FmEmployeeScheduleStagingRecord,
): FmEmployeeScheduleStagingRecord {
  const snapshot = captureFmRecordDecisionSnapshot(record);
  const entry: FmRecordSaveSnapshot = {
    ...snapshot,
    snapshotId: `fmss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  };
  const stack = [entry, ...(record.saveSnapshots ?? [])].slice(0, MAX_SAVE_SNAPSHOTS);
  return { ...record, saveSnapshots: stack };
}

export function popSaveSnapshot(
  record: FmEmployeeScheduleStagingRecord,
): {
  record: FmEmployeeScheduleStagingRecord;
  snapshot: FmRecordSaveSnapshot | null;
} {
  const stack = [...(record.saveSnapshots ?? [])];
  const snapshot = stack.shift() ?? null;
  return {
    record: { ...record, saveSnapshots: stack },
    snapshot,
  };
}

export function snapshotMapForRecords(
  records: FmEmployeeScheduleStagingRecord[],
): Record<string, FmRecordDecisionSnapshot> {
  const map: Record<string, FmRecordDecisionSnapshot> = {};
  for (const record of records) {
    map[record.id] = captureFmRecordDecisionSnapshot(record);
  }
  return map;
}

export function createReviewDecisionHistoryEntry(input: {
  targetKey: string;
  recordIds: string[];
  decisionType: FmReviewDecisionType | "revert";
  decisionScope: import("./types").FmReviewDecisionScope | null;
  originalState: Record<string, FmRecordDecisionSnapshot>;
  currentState: Record<string, FmRecordDecisionSnapshot>;
  decidedBy?: string;
  decisionNote?: string;
}): FmReviewDecisionHistoryEntry {
  return {
    id: `fmhist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    targetKind: "joint_group",
    targetKey: input.targetKey,
    recordIds: input.recordIds,
    decisionType: input.decisionType,
    decisionScope: input.decisionScope,
    originalState: input.originalState,
    currentState: input.currentState,
    decidedAt: new Date().toISOString(),
    decidedBy: input.decidedBy ?? "user",
    decisionNote: input.decisionNote,
  };
}
