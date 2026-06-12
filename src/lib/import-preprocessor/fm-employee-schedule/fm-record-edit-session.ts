import type { AliasLedgerSources } from "@/lib/alias-engine";
import type { MasterData } from "@/lib/types";
import type { PreprocessResult } from "../types";
import { applyLastManualEditMeta } from "./last-edit-meta";
import {
  applyManualEditToRecord,
  type FmManualRecordEditInput,
} from "./manual-record-edit";
import { buildAliasStoreForFmSchedule } from "./manual-vehicle-fill";
import { pushSaveSnapshot } from "./record-snapshot";
import {
  applyReviewDecisionToRecord,
  rebuildFmSchedulePreprocessResult,
} from "./review-decision";
import type { FmReviewDecisionType } from "./types";
import { collectFmScheduleWarnings } from "./warnings";
import {
  approveVehicleFill,
  mergeWarningFlagsAfterRecollect,
} from "./warning-tracking";

function inferReviewDecisionFromEdit(
  edit: FmManualRecordEditInput,
): FmReviewDecisionType | null {
  if (edit.jointMode === "solo") return "separate_operations";
  if (edit.jointMode === "two_man") return "joint_operation";
  return null;
}

function collectEditedFieldLabels(edit: FmManualRecordEditInput): string[] {
  const labels: string[] = [];
  if (edit.vehicle != null) labels.push("車番");
  if (edit.jointMode) labels.push("共同作業");
  return labels;
}

/**
 * 修正画面からの保存を一本化する。
 * 手動編集・共同作業判断・警告再計算をまとめて適用する。
 */
export function applyFmRecordEditSession(input: {
  result: PreprocessResult;
  recordId: string;
  edit: FmManualRecordEditInput;
  reviewDecision?: FmReviewDecisionType;
  masters?: MasterData | null;
  ledger?: AliasLedgerSources | null;
}): PreprocessResult {
  const records = input.result.fmScheduleRecords ?? [];
  const target = records.find((r) => r.id === input.recordId);
  if (!target) return input.result;

  const editedBy = input.edit.editedBy ?? "管理者";
  const aliasStore = buildAliasStoreForFmSchedule(input.masters, input.ledger);

  const withSnapshot = pushSaveSnapshot(target);
  let edited = applyManualEditToRecord(
    withSnapshot,
    records,
    { ...input.edit, editedBy },
    aliasStore,
  );

  const decisionType =
    input.reviewDecision ?? inferReviewDecisionFromEdit(input.edit);
  if (decisionType) {
    edited = applyReviewDecisionToRecord(edited, decisionType, editedBy);
  }

  edited = applyLastManualEditMeta(edited, {
    editedBy,
    fieldLabels: collectEditedFieldLabels(input.edit),
  });

  let updatedRecords = records.map((r) => (r.id === input.recordId ? edited : r));
  const recollected = collectFmScheduleWarnings(updatedRecords);
  updatedRecords = updatedRecords.map((r) => {
    const refreshed = recollected.find((x) => x.id === r.id) ?? r;
    const before = updatedRecords.find((x) => x.id === r.id)!;
    return mergeWarningFlagsAfterRecollect(before, refreshed);
  });
  updatedRecords = updatedRecords.map((r) =>
    r.id === input.recordId ? approveVehicleFill(r, editedBy) : r,
  );

  return rebuildFmSchedulePreprocessResult(
    input.result,
    updatedRecords,
    input.result.fmReviewDecisionRules ?? [],
    input.result.fmReviewDecisionHistory,
  );
}

/** @deprecated applyFmRecordEditSession を使用 */
export const applyFmManualRecordEdit = applyFmRecordEditSession;
