import type { PreprocessResult } from "../types";
import type { FmBulkWarningActionRequest } from "./bulk-action-types";
import { applyLastManualEditMeta } from "./last-edit-meta";
import { rebuildFmSchedulePreprocessResult } from "./review-decision";
import {
  dismissFmWarning,
  holdFmWarning,
  reopenFmWarning,
} from "./warning-tracking";

/**
 * 将来の一括警告操作。現時点では API のみ（UI 未接続）。
 */
export function applyFmBulkWarningAction(input: {
  result: PreprocessResult;
  request: FmBulkWarningActionRequest;
}): PreprocessResult {
  const { request } = input;
  const decidedBy = request.decidedBy ?? "管理者";
  let records = input.result.fmScheduleRecords ?? [];

  for (const target of request.targets) {
    records = records.map((record) => {
      if (record.id !== target.recordId) return record;
      let next = record;
      if (request.action === "dismiss_ok") {
        next = dismissFmWarning(record, target.flag, request.note, decidedBy);
      } else if (request.action === "hold") {
        next = holdFmWarning(record, target.flag, request.note, decidedBy);
      } else {
        next = reopenFmWarning(record, target.flag);
      }
      return applyLastManualEditMeta(next, {
        editedBy: decidedBy,
        fieldLabels: ["警告対応"],
      });
    });
  }

  return rebuildFmSchedulePreprocessResult(
    input.result,
    records,
    input.result.fmReviewDecisionRules ?? [],
    input.result.fmReviewDecisionHistory,
  );
}
