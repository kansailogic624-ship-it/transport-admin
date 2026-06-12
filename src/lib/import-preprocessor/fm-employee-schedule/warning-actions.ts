import type { PreprocessResult } from "../types";
import { applyLastManualEditMeta } from "./last-edit-meta";
import { rebuildFmSchedulePreprocessResult } from "./review-decision";
import type { FmScheduleWarningCode } from "./types";
import {
  dismissFmWarning,
  holdFmWarning,
  reopenFmWarning,
} from "./warning-tracking";

function rebuildAfterWarningChange(
  result: PreprocessResult,
  records: PreprocessResult["fmScheduleRecords"],
): PreprocessResult {
  return rebuildFmSchedulePreprocessResult(
    result,
    records ?? [],
    result.fmReviewDecisionRules ?? [],
    result.fmReviewDecisionHistory,
  );
}

export function applyFmWarningDismiss(input: {
  result: PreprocessResult;
  recordId: string;
  flag: FmScheduleWarningCode;
  note?: string;
  decidedBy?: string;
}): PreprocessResult {
  const records = input.result.fmScheduleRecords ?? [];
  const updatedRecords = records.map((record) => {
    if (record.id !== input.recordId) return record;
    const next = dismissFmWarning(
      record,
      input.flag,
      input.note ?? "問題なし",
      input.decidedBy,
    );
    return applyLastManualEditMeta(next, {
      editedBy: input.decidedBy ?? "管理者",
      fieldLabels: ["警告対応"],
    });
  });

  return rebuildAfterWarningChange(input.result, updatedRecords);
}

export function applyFmWarningHold(input: {
  result: PreprocessResult;
  recordId: string;
  flag: FmScheduleWarningCode;
  note?: string;
  decidedBy?: string;
}): PreprocessResult {
  const records = input.result.fmScheduleRecords ?? [];
  const updatedRecords = records.map((record) => {
    if (record.id !== input.recordId) return record;
    const next = holdFmWarning(
      record,
      input.flag,
      input.note ?? "保留",
      input.decidedBy,
    );
    return applyLastManualEditMeta(next, {
      editedBy: input.decidedBy ?? "管理者",
      fieldLabels: ["警告対応"],
    });
  });

  return rebuildAfterWarningChange(input.result, updatedRecords);
}

export function applyFmWarningReopen(input: {
  result: PreprocessResult;
  recordId: string;
  flag: FmScheduleWarningCode;
}): PreprocessResult {
  const records = input.result.fmScheduleRecords ?? [];
  const updatedRecords = records.map((record) =>
    record.id === input.recordId ? reopenFmWarning(record, input.flag) : record,
  );

  return rebuildAfterWarningChange(input.result, updatedRecords);
}

export function applyFmWarningDismissAllOnRecord(input: {
  result: PreprocessResult;
  recordId: string;
  decidedBy?: string;
}): PreprocessResult {
  let records = input.result.fmScheduleRecords ?? [];
  const record = records.find((r) => r.id === input.recordId);
  if (!record) return input.result;

  for (const flag of [...(record.currentWarningFlags ?? record.warningFlags)]) {
    records = records.map((r) =>
      r.id === input.recordId
        ? dismissFmWarning(r, flag, "問題なし", input.decidedBy)
        : r,
    );
  }

  return rebuildAfterWarningChange(input.result, records);
}
