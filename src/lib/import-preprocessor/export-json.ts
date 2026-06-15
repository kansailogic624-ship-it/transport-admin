import type {
  ShigaDeliveryExportRecord,
  ShigaDeliveryStagingRecord,
} from "./shiga-delivery/types";
import type { PreprocessExportJson, PreprocessResult } from "./types";
import { PREPROCESS_SCHEMA_VERSION } from "./types";
import { getExportableRecords } from "./warning-status";

export function mapShigaDeliveryExportRecord(
  record: ShigaDeliveryStagingRecord,
): ShigaDeliveryExportRecord {
  return {
    id: record.id,
    sourceRowNumber: record.sourceRowNumber,
    monthPeriod: record.monthPeriod,
    closingMonth: record.closingMonth,
    businessDate: record.businessDate,
    weekday: record.weekday,
    vendorCode: record.vendorCode,
    vendorName: record.vendorName,
    vehicleType: record.vehicleType,
    courseId: record.courseId,
    courseName: record.courseName,
    routeName: record.routeName,
    joinKey: record.joinKey,
    joinKeyParts: record.joinKeyParts,
    unitCount: record.unitCount,
    freightAmount: record.freightAmount,
    overtimeHours: record.overtimeHours,
    overtimePayAmount: record.overtimePayAmount,
    freightPlusOvertimeAmount: record.freightPlusOvertimeAmount,
    tollAmount: record.tollAmount,
    coursePayTotal: record.coursePayTotal,
    status: record.status,
    warningFlags: record.warningFlags,
    warningMessages: record.warningMessages,
    isManuallyEdited: record.isManuallyEdited,
  };
}

export function buildPreprocessExportJson(
  result: PreprocessResult,
): PreprocessExportJson {
  const isFmSchedule = result.sourceType === "filemaker_employee_schedule";
  const isShigaDelivery = result.sourceType === "shiga_store_delivery";

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
      shigaDeliveryTotals: result.shigaDeliveryTotals,
    },
    records:
      isFmSchedule || isShigaDelivery
        ? []
        : getExportableRecords(result.records),
    fmScheduleRecords: result.fmScheduleRecords,
    fmEmployeeDaySummaries: result.fmEmployeeDaySummaries,
    fmOperationSummaries: result.fmOperationSummaries,
    shigaDeliveryRecords: isShigaDelivery
      ? (result.shigaDeliveryRecords ?? []).map(mapShigaDeliveryExportRecord)
      : undefined,
    shigaDeliveryDaySummaries: result.shigaDeliveryDaySummaries,
    warnings: result.warnings,
    errors: result.errors,
  };
}

export function canExportPreprocessResult(result: PreprocessResult | null): boolean {
  if (!result) return false;
  if (result.sourceType === "filemaker_employee_schedule") {
    return (result.fmScheduleRecords?.length ?? 0) > 0;
  }
  if (result.sourceType === "shiga_store_delivery") {
    return (result.shigaDeliveryRecords?.length ?? 0) > 0;
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
