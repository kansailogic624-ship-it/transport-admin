/**
 * データ前処理エントリポイント
 * ※ Firestore には一切アクセスしない
 */

import type { AliasLedgerSources } from "@/lib/alias-engine";
import type { MasterData } from "@/lib/types";
import { parseAmazonPreprocessorFile } from "./parsers/amazon-parser";
import {
  parseFuelPreprocessorFile,
  parseOtherPreprocessorFile,
  parseTollPreprocessorFile,
  parseVehicleExpensePreprocessorFile,
} from "./parsers/vehicle-expense-parser";
import { parseFilemakerDispatchPreprocessorFile } from "./parsers/filemaker-dispatch-parser";
import { parseFilemakerEmployeeSchedulePreprocessorFile } from "./parsers/filemaker-employee-schedule-parser";
import { parseRollCallPreprocessorFile } from "./parsers/roll-call-parser";
import { parseDrivingReportPreprocessorFile } from "./parsers/driving-report-parser";
import type {
  PreprocessNormalizeContext,
  PreprocessResult,
  PreprocessSourceType,
} from "./types";

export type {
  PreprocessResult,
  PreprocessSourceType,
  PreprocessedRecord,
  PreprocessWarningDetailRow,
  AmazonTotalsComparison,
} from "./types";
export { PREPROCESS_SOURCE_LABELS, PREPROCESS_SCHEMA_VERSION } from "./types";
export {
  buildPreprocessExportJson,
  canExportPreprocessResult,
  downloadPreprocessJson,
} from "./export-json";
export { downloadPreprocessCsv } from "./export-csv";
export { buildPreprocessUniqueKey } from "./duplicate-check";
export {
  recomputePreprocessResult,
  updatePreprocessRecord,
  setRecordsWarningStatus,
  bulkUpdateByCompanyOriginal,
  groupRecordsByCompanyOriginal,
  type CompanyBulkGroup,
} from "./record-state";
export {
  WARNING_STATUS_LABELS,
  isExportableRecord,
  getExportableRecords,
} from "./warning-status";
export type { PreprocessWarningStatus } from "./types";
export { OPERATION_TYPE_LABELS } from "./types";
export type { PreprocessOperationType } from "./types";
export type { AliasLedgerSources as PreprocessLedgerContext } from "@/lib/alias-engine";
export {
  FM_SCHEDULE_FILTER_LABELS,
  filterFmScheduleRecords,
  getFmFilterDisplayLabel,
  matchesFmScheduleFilter,
} from "./fm-employee-schedule/filters";
export {
  applyFmWarningDismiss,
  applyFmWarningDismissAllOnRecord,
  applyFmWarningHold,
  applyFmWarningReopen,
} from "./fm-employee-schedule/warning-actions";
export { buildJointDetectionReasons } from "./fm-employee-schedule/joint-detection-reasons";
export {
  revertFmRecordToImport,
  revertFmRecordToPreviousSave,
  revertFmRecordHistoryEntry,
} from "./fm-employee-schedule/record-revert";
export {
  buildFmWarningEditQueue,
  findWarningEditIndex,
} from "./fm-employee-schedule/warning-edit-queue";
export {
  FM_SCHEDULE_SUMMARY_CARDS,
  FM_SCHEDULE_QUICK_FILTERS,
} from "./fm-employee-schedule/summary-filter-registry";
export { computeWarningResolutionRate } from "./fm-employee-schedule/resolution-rate";
export { applyFmBulkWarningAction } from "./fm-employee-schedule/bulk-warning-actions";
export { applyFmManualVehicleFill } from "./fm-employee-schedule/manual-vehicle-actions";
export {
  applyFmManualRecordEdit,
  applyFmRecordEditSession,
} from "./fm-employee-schedule/fm-record-edit-session";
export { findJointPartnerCandidates } from "./fm-employee-schedule/joint-partner-candidates";
export {
  findManualVehicleFillCandidates,
  needsManualVehicleFill,
} from "./fm-employee-schedule/manual-vehicle-fill";
export {
  formatJointPartnerDisplay,
  formatJointOperationMemberLabel,
} from "./fm-employee-schedule/partner-display";
export { parseNotePartner } from "./fm-employee-schedule/note-partner-detection";
export {
  dismissFmWarning,
  getActionableWarnings,
  getAllWarningDispositions,
  getCurrentWarnings,
  getDismissedWarnings,
  getOnHoldWarnings,
  getOriginalWarnings,
  getWarningDisposition,
  holdFmWarning,
  reopenFmWarning,
} from "./fm-employee-schedule/warning-tracking";
export type { FmScheduleViewFilter } from "./fm-employee-schedule/filters";
export {
  applyFmScheduleReviewDecision,
  applyFmReviewDecisionRules,
  createReviewDecisionRule,
  isAutoDetectedJointGroup,
  loadFmReviewDecisionRules,
  revertFmScheduleReviewDecision,
  saveFmReviewDecisionRules,
  FM_REVIEW_DECISION_LABELS,
  FM_REVIEW_DECISION_SCOPE_LABELS,
} from "./fm-employee-schedule/review-decision";
export type {
  FmReviewDecisionType,
  FmReviewDecisionScope,
  FmReviewDecisionRule,
  FmScheduleWarningCode,
} from "./fm-employee-schedule/types";

export function buildNormalizeContextFromMasters(
  masters?: MasterData | null,
): PreprocessNormalizeContext | undefined {
  if (!masters) return undefined;
  return {
    driverMasterNames: masters.drivers,
    vehicleMasterNumbers: masters.vehicles,
    shipperMasterNames: masters.shippers,
  };
}

export async function preprocessImportFile(
  sourceType: PreprocessSourceType,
  file: File,
  masters?: MasterData | null,
  ledger?: AliasLedgerSources | null,
): Promise<PreprocessResult> {
  const buffer = await file.arrayBuffer();
  const ctx = buildNormalizeContextFromMasters(masters);

  switch (sourceType) {
    case "amazon":
      return parseAmazonPreprocessorFile(buffer, file.name, ctx);
    case "driving_report":
      return parseDrivingReportPreprocessorFile(buffer, file.name, ctx);
    case "roll_call":
      return parseRollCallPreprocessorFile(buffer, file.name, ctx);
    case "filemaker_dispatch":
      return parseFilemakerDispatchPreprocessorFile(
        buffer,
        file.name,
        ctx,
        masters,
      );
    case "filemaker_employee_schedule":
      return parseFilemakerEmployeeSchedulePreprocessorFile(
        buffer,
        file.name,
        ctx,
        masters,
        ledger,
      );
    case "vehicle_expense":
      return parseVehicleExpensePreprocessorFile(buffer, file.name, ctx);
    case "fuel":
      return parseFuelPreprocessorFile(buffer, file.name, ctx);
    case "toll":
      return parseTollPreprocessorFile(buffer, file.name, ctx);
    case "other":
      return parseOtherPreprocessorFile(buffer, file.name, ctx);
    default:
      return parseOtherPreprocessorFile(buffer, file.name, ctx);
  }
}
