import type { AliasLedgerSources } from "@/lib/alias-engine";
import type { MasterData } from "@/lib/types";
import type { PreprocessResult } from "../types";
import {
  applyManualVehicleFillToRecord,
  buildAliasStoreForFmSchedule,
} from "./manual-vehicle-fill";
import { rebuildFmSchedulePreprocessResult } from "./review-decision";
import { collectFmScheduleWarnings } from "./warnings";
import {
  approveVehicleFill,
  getCurrentWarnings,
} from "./warning-tracking";

function mergeWarningsAfterRecollect(
  before: import("./types").FmEmployeeScheduleStagingRecord[],
  recollected: import("./types").FmEmployeeScheduleStagingRecord[],
): import("./types").FmEmployeeScheduleStagingRecord[] {
  return recollected.map((refreshed) => {
    const original = before.find((r) => r.id === refreshed.id);
    if (!original) return refreshed;
    const resolved = new Set(original.resolvedWarningFlags ?? []);
    const fresh = getCurrentWarnings(refreshed);
    const nextCurrent = fresh.filter((f) => !resolved.has(f));
    return {
      ...refreshed,
      currentWarningFlags: nextCurrent,
      warningFlags: nextCurrent,
      resolvedWarningFlags: original.resolvedWarningFlags ?? [],
      reviewDecisions: original.reviewDecisions ?? [],
      manualVehicleFill: original.manualVehicleFill ?? refreshed.manualVehicleFill,
    };
  });
}

export function applyFmManualVehicleFill(input: {
  result: PreprocessResult;
  recordId: string;
  vehicle: string;
  sourceRowNumber: number;
  masters?: MasterData | null;
  ledger?: AliasLedgerSources | null;
}): PreprocessResult {
  const records = input.result.fmScheduleRecords ?? [];
  const target = records.find((r) => r.id === input.recordId);
  if (!target) return input.result;

  const aliasStore = buildAliasStoreForFmSchedule(input.masters, input.ledger);
  const filled = applyManualVehicleFillToRecord(
    target,
    { vehicle: input.vehicle, sourceRowNumber: input.sourceRowNumber },
    aliasStore,
  );

  let updatedRecords = records.map((r) => (r.id === input.recordId ? filled : r));
  updatedRecords = mergeWarningsAfterRecollect(
    updatedRecords,
    collectFmScheduleWarnings(updatedRecords),
  );
  updatedRecords = updatedRecords.map((r) =>
    r.id === input.recordId ? approveVehicleFill(r) : r,
  );

  return rebuildFmSchedulePreprocessResult(
    input.result,
    updatedRecords,
    input.result.fmReviewDecisionRules ?? [],
    input.result.fmReviewDecisionHistory,
  );
}
