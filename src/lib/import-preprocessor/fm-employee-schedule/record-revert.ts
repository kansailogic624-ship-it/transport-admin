import type { PreprocessResult } from "../types";
import { refreshLastManualEditFromHistory } from "./last-edit-meta";
import { applyManualVehicleFillToRecord, buildAliasStoreForFmSchedule } from "./manual-vehicle-fill";
import { formatJointPartnerDisplay } from "./partner-display";
import {
  applyFmRecordDecisionSnapshot,
  popSaveSnapshot,
  type FmRecordDecisionSnapshot,
} from "./record-snapshot";
import { rebuildFmSchedulePreprocessResult } from "./review-decision";
import type {
  FmEmployeeScheduleStagingRecord,
  FmManualEditHistoryEntry,
} from "./types";
import { collectFmScheduleWarnings } from "./warnings";
import { mergeWarningFlagsAfterRecollect } from "./warning-tracking";

function applyImportSnapshot(
  record: FmEmployeeScheduleStagingRecord,
): FmEmployeeScheduleStagingRecord {
  if (!record.originalState) return record;
  const { capturedAt: _capturedAt, ...snapshot } = record.originalState;
  const restored = applyFmRecordDecisionSnapshot(record, snapshot);
  return refreshLastManualEditFromHistory({
    ...restored,
    saveSnapshots: [],
    manualEditHistory: [],
    lastManualEditBy: null,
    lastManualEditAt: null,
    lastManualEditSummary: null,
  });
}

function revertVehicleField(
  record: FmEmployeeScheduleStagingRecord,
  entry: FmManualEditHistoryEntry,
  aliasStore: ReturnType<typeof buildAliasStoreForFmSchedule>,
): FmEmployeeScheduleStagingRecord {
  const before = entry.beforeLabel;
  if (before === "空白" || !before.trim()) {
    return {
      ...record,
      vehicleNumberFilled: null,
      vehicleNumberFilledSource: null,
      vehicleNumberFilledReason: null,
      vehicleNumberFilledFromRowNumber: null,
      manualVehicleFill: null,
      infoFlags: record.infoFlags.filter((f) => f !== "VEHICLE_FILLED_MANUAL"),
    };
  }
  return applyManualVehicleFillToRecord(
    {
      ...record,
      infoFlags: record.infoFlags.filter((f) => f !== "VEHICLE_FILLED_MANUAL"),
    },
    { vehicle: before, sourceRowNumber: record.sourceRowNumber },
    aliasStore,
  );
}

function revertHistoryEntry(
  record: FmEmployeeScheduleStagingRecord,
  entryId: string,
  aliasStore: ReturnType<typeof buildAliasStoreForFmSchedule>,
): FmEmployeeScheduleStagingRecord {
  const entry = (record.manualEditHistory ?? []).find((e) => e.id === entryId);
  if (!entry || entry.revertedAt) return record;

  let next = { ...record };

  if (entry.field === "vehicle") {
    next = revertVehicleField(next, entry, aliasStore);
  } else if (entry.field === "joint_operation" || entry.field === "joint_partner") {
    const prior = (record.manualEditHistory ?? []).find(
      (e) =>
        e.id !== entryId &&
        !e.revertedAt &&
        (e.field === "joint_operation" || e.field === "joint_partner") &&
        new Date(e.editedAt).getTime() < new Date(entry.editedAt).getTime(),
    );
    if (prior?.field === "joint_operation") {
      next = {
        ...next,
        isJointOperation: prior.beforeLabel !== "単独",
        jointOperationMemberCount: prior.beforeLabel === "単独" ? 1 : 2,
      };
    } else if (entry.field === "joint_operation" && entry.beforeLabel === "単独") {
      next = {
        ...next,
        isJointOperation: false,
        jointOperationMemberCount: 1,
        jointOperationMembers: [
          {
            employeeCanonicalId: record.employeeCanonicalId,
            employeeNameCanonical: record.employeeNameCanonical,
            employeeNameOriginal: record.employeeNameOriginal,
            revenueAmount: record.revenueAmount ?? 0,
            vehicleNumberOriginal: record.vehicleNumberOriginal,
            vehicleNumberFilled: record.vehicleNumberFilled,
            vehicleNumberCanonical: record.vehicleNumberCanonical,
            memberKind: "employee",
          },
        ],
        requiresHumanReview: false,
        jointOperationReviewDecision: null,
      };
    }
  }

  const history = (record.manualEditHistory ?? []).map((e) =>
    e.id === entryId ? { ...e, revertedAt: new Date().toISOString() } : e,
  );

  return refreshLastManualEditFromHistory({
    ...next,
    manualEditHistory: history,
    updatedAt: new Date().toISOString(),
  });
}

function rebuildAfterRevert(
  result: PreprocessResult,
  records: FmEmployeeScheduleStagingRecord[],
): PreprocessResult {
  const recollected = collectFmScheduleWarnings(records);
  const merged = records.map((r) => {
    const refreshed = recollected.find((x) => x.id === r.id) ?? r;
    return mergeWarningFlagsAfterRecollect(r, refreshed);
  });
  return rebuildFmSchedulePreprocessResult(
    result,
    merged,
    result.fmReviewDecisionRules ?? [],
    result.fmReviewDecisionHistory,
  );
}

export function revertFmRecordToImport(input: {
  result: PreprocessResult;
  recordId: string;
}): PreprocessResult {
  const records = (input.result.fmScheduleRecords ?? []).map((r) =>
    r.id === input.recordId ? applyImportSnapshot(r) : r,
  );
  return rebuildAfterRevert(input.result, records);
}

export function revertFmRecordToPreviousSave(input: {
  result: PreprocessResult;
  recordId: string;
  masters?: import("@/lib/types").MasterData | null;
  ledger?: import("@/lib/alias-engine").AliasLedgerSources | null;
}): PreprocessResult {
  const target = input.result.fmScheduleRecords?.find((r) => r.id === input.recordId);
  if (!target) return input.result;

  const { record: popped, snapshot } = popSaveSnapshot(target);
  if (!snapshot) return input.result;

  const { snapshotId: _id, savedAt: _at, ...decisionSnapshot } = snapshot;
  let restored = applyFmRecordDecisionSnapshot(popped, decisionSnapshot as FmRecordDecisionSnapshot);
  restored = refreshLastManualEditFromHistory(restored);

  const records = (input.result.fmScheduleRecords ?? []).map((r) =>
    r.id === input.recordId ? restored : r,
  );
  return rebuildAfterRevert(input.result, records);
}

export function revertFmRecordHistoryEntry(input: {
  result: PreprocessResult;
  recordId: string;
  historyEntryId: string;
  masters?: import("@/lib/types").MasterData | null;
  ledger?: import("@/lib/alias-engine").AliasLedgerSources | null;
}): PreprocessResult {
  const aliasStore = buildAliasStoreForFmSchedule(input.masters, input.ledger);
  const records = (input.result.fmScheduleRecords ?? []).map((r) =>
    r.id === input.recordId
      ? revertHistoryEntry(r, input.historyEntryId, aliasStore)
      : r,
  );
  return rebuildAfterRevert(input.result, records);
}

export function canRevertToImport(record: FmEmployeeScheduleStagingRecord): boolean {
  return record.originalState != null;
}

export function canRevertToPreviousSave(
  record: FmEmployeeScheduleStagingRecord,
): boolean {
  return (record.saveSnapshots?.length ?? 0) > 0;
}

export function formatRevertPreview(
  record: FmEmployeeScheduleStagingRecord,
): string {
  return formatJointPartnerDisplay(record);
}
