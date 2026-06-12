import type { PreprocessExportJson, PreprocessResult } from "./types";
import { PREPROCESS_SCHEMA_VERSION } from "./types";
import { getExportableRecords } from "./warning-status";

export function buildPreprocessExportJson(
  result: PreprocessResult,
): PreprocessExportJson {
  const isFmSchedule = result.sourceType === "filemaker_employee_schedule";

  return {
    schemaVersion: PREPROCESS_SCHEMA_VERSION,
    sourceType: result.sourceType,
    sourceFileName: result.sourceFileName,
    createdAt: result.createdAt,
    summary: {
      totalRows: result.totalRows,
      successRows: result.successRows,
      warningRows: result.warningRows,
      errorRows: result.errorRows,
      duplicateRows: result.duplicateRows,
      warningStatusSummary: result.warningStatusSummary,
      fmScheduleTotals: result.fmScheduleTotals,
    },
    records: isFmSchedule ? [] : getExportableRecords(result.records),
    fmScheduleRecords: result.fmScheduleRecords,
    fmEmployeeDaySummaries: result.fmEmployeeDaySummaries,
    fmOperationSummaries: result.fmOperationSummaries,
    warnings: result.warnings,
    errors: result.errors,
  };
}

export function canExportPreprocessResult(result: PreprocessResult | null): boolean {
  if (!result) return false;
  if (result.sourceType === "filemaker_employee_schedule") {
    return (result.fmScheduleRecords?.length ?? 0) > 0;
  }
  return getExportableRecords(result.records).length > 0;
}

export function downloadPreprocessJson(
  result: PreprocessResult,
  fileName?: string,
): void {
  const payload = buildPreprocessExportJson(result);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const base =
    fileName?.replace(/\.[^.]+$/, "") ??
    result.sourceFileName.replace(/\.[^.]+$/, "") ??
    "preprocessed";
  anchor.href = url;
  anchor.download = `${base}-preprocessed.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
