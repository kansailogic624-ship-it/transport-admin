import type { PreprocessResult } from "../types";
import {
  applyMonthlyMismatchWarnings,
  buildShigaDeliveryAmountTotals,
} from "./reconciliation";
import type { ShigaDeliveryStagingRecord } from "./types";

export type ShigaDeliveryManualEditInput = {
  unitCount?: number;
  freightAmount?: number;
  overtimeHours?: number;
  overtimePayAmount?: number;
  freightPlusOvertimeAmount?: number;
  tollAmount?: number;
  coursePayTotal?: number;
  note?: string;
};

function recomputeShigaDeliveryResult(
  result: PreprocessResult,
  records: ShigaDeliveryStagingRecord[],
): PreprocessResult {
  const daySummaries = result.shigaDeliveryDaySummaries ?? [];
  const totals = buildShigaDeliveryAmountTotals({
    records,
    daySummaries,
    skippedRowCount: result.shigaDeliveryTotals?.skippedRowCount ?? 0,
    missingDateCount: result.shigaDeliveryTotals?.missingDateCount ?? 0,
    excludedNonIsoDateRowCount:
      result.shigaDeliveryTotals?.excludedNonIsoDateRowCount ?? 0,
    totalRow: result.shigaDeliveryTotals?.excelMonthlyTotals ?? {
      vehicleAmount: null,
      toll: null,
      unitCount: null,
      payTotal: null,
      sourceRowNumber: null,
      found: false,
    },
  });

  const withMonthly = applyMonthlyMismatchWarnings(records, totals);
  const warningRows = withMonthly.filter(
    (r) => r.warningFlags.length > 0 || r.status === "warning",
  ).length;

  return {
    ...result,
    shigaDeliveryRecords: withMonthly,
    shigaDeliveryTotals: totals,
    totalRows: withMonthly.length,
    warningRows,
    successRows: Math.max(0, withMonthly.length - warningRows),
    warnings: result.warnings,
  };
}

export function applyShigaDeliveryManualEdit(input: {
  result: PreprocessResult;
  recordId: string;
  edit: ShigaDeliveryManualEditInput;
}): PreprocessResult {
  const records = (input.result.shigaDeliveryRecords ?? []).map((record) => {
    if (record.id !== input.recordId) return record;
    const updated: ShigaDeliveryStagingRecord = {
      ...record,
      unitCount: input.edit.unitCount ?? record.unitCount,
      freightAmount: input.edit.freightAmount ?? record.freightAmount,
      overtimeHours: input.edit.overtimeHours ?? record.overtimeHours,
      overtimePayAmount:
        input.edit.overtimePayAmount ?? record.overtimePayAmount,
      freightPlusOvertimeAmount:
        input.edit.freightPlusOvertimeAmount ??
        record.freightPlusOvertimeAmount,
      tollAmount: input.edit.tollAmount ?? record.tollAmount,
      coursePayTotal: input.edit.coursePayTotal ?? record.coursePayTotal,
      isManuallyEdited: true,
      warningFlags: record.warningFlags.includes("MANUAL_EDITED")
        ? record.warningFlags
        : [...record.warningFlags, "MANUAL_EDITED"],
    };
    return updated;
  });

  return recomputeShigaDeliveryResult(input.result, records);
}

export function revertShigaDeliveryRecordToImport(input: {
  result: PreprocessResult;
  recordId: string;
}): PreprocessResult {
  const records = (input.result.shigaDeliveryRecords ?? []).map((record) => {
    if (record.id !== input.recordId || !record.originalSnapshot) return record;
    return {
      ...structuredClone(record.originalSnapshot),
      originalSnapshot: record.originalSnapshot,
    };
  });
  return recomputeShigaDeliveryResult(input.result, records);
}
