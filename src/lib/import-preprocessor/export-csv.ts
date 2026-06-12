import type { PreprocessResult } from "./types";
import { getExportableRecords } from "./warning-status";

function escapeCsvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const CSV_HEADERS = [
  "id",
  "sourceRowNumber",
  "businessDate",
  "driverNameOriginal",
  "driverNameNormalized",
  "vehicleNoOriginal",
  "vehicleNoNormalized",
  "shipperNameOriginal",
  "shipperNameNormalized",
  "companyOriginal",
  "companyNormalized",
  "operationType",
  "jobNameOriginal",
  "jobNameNormalized",
  "routeNameOriginal",
  "routeNameNormalized",
  "amount",
  "cost",
  "salesAmount",
  "paymentAmount",
  "differenceAmount",
  "excelDifferenceAmount",
  "calculatedGrossProfitAmount",
  "laborCostAmount",
  "workStartTime",
  "workEndTime",
  "sourceDispatchKey",
  "tollFeeAmount",
  "mainDriverName",
  "assistantDriverNames",
  "partnerName",
  "timecardIn",
  "timecardOut",
  "dayStatus",
  "isManuallyEdited",
  "warningStatus",
  "warnings",
  "errors",
] as const;

export function buildPreprocessCsv(result: PreprocessResult): string {
  const lines = [CSV_HEADERS.join(",")];

  for (const record of getExportableRecords(result.records)) {
    const row = [
      record.id,
      record.sourceRowNumber,
      record.businessDate,
      record.driverNameOriginal,
      record.driverNameNormalized,
      record.vehicleNoOriginal,
      record.vehicleNoNormalized,
      record.shipperNameOriginal,
      record.shipperNameNormalized,
      record.companyOriginal,
      record.companyNormalized,
      record.operationType,
      record.jobNameOriginal,
      record.jobNameNormalized,
      record.routeNameOriginal,
      record.routeNameNormalized,
      record.amount,
      record.cost,
      record.salesAmount ?? record.amount,
      record.paymentAmount ?? record.cost,
      record.differenceAmount ?? 0,
      record.excelDifferenceAmount ?? record.differenceAmount ?? 0,
      record.calculatedGrossProfitAmount ?? 0,
      record.laborCostAmount ?? 0,
      record.workStartTime,
      record.workEndTime,
      record.sourceDispatchKey ?? "",
      record.tollFeeAmount ?? 0,
      record.mainDriverName ?? "",
      (record.assistantDriverNames ?? []).join("; "),
      record.partnerName ?? "",
      record.timecardIn ?? "",
      record.timecardOut ?? "",
      record.dayStatus ?? "",
      record.isManuallyEdited ? "true" : "false",
      record.warningStatus ?? "pending",
      record.warnings.join("; "),
      record.errors.join("; "),
    ].map(escapeCsvCell);
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

export function downloadPreprocessCsv(
  result: PreprocessResult,
  fileName?: string,
): void {
  const csv = buildPreprocessCsv(result);
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const base =
    fileName?.replace(/\.[^.]+$/, "") ??
    result.sourceFileName.replace(/\.[^.]+$/, "") ??
    "preprocessed";
  anchor.href = url;
  anchor.download = `${base}-preprocessed.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
