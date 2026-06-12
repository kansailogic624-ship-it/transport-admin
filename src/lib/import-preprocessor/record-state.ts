/**
 * 前処理レコードの再計算（手修正・一括修正後）
 */

import {
  applyDuplicateWarnings,
  detectDuplicateRecords,
} from "./duplicate-check";
import { enrichAmazonAmountFields } from "./amazon-amounts";
import { buildFmDispatchAmountTotals } from "./fm-dispatch-preprocess";
import { amazonShipperName } from "./normalize";
import { buildAmazonTotalsComparison } from "./amazon-totals";
import { countActiveDuplicateRecords } from "./duplicate-groups";
import { buildWarningDetails } from "./warning-details";
import {
  getAggregatableRecords,
  summarizeWarningStatus,
} from "./warning-status";
import { collectGlobalIssues, recomputeRecordIssues } from "./validators";
import type {
  PreprocessedRecord,
  PreprocessOperationType,
  PreprocessResult,
  PreprocessWarningStatus,
} from "./types";

export type RecordEditPatch = {
  businessDate?: string;
  driverNameNormalized?: string;
  vehicleNoNormalized?: string;
  shipperNameNormalized?: string;
  jobNameNormalized?: string;
  routeNameNormalized?: string;
  amount?: number;
  salesAmount?: number;
  paymentAmount?: number;
  differenceAmount?: number;
  laborCostAmount?: number;
  operationType?: PreprocessOperationType;
  companyNormalized?: string;
};

export function applyRecordEditPatch(
  record: PreprocessedRecord,
  patch: RecordEditPatch,
): PreprocessedRecord {
  const operationType = patch.operationType ?? record.operationType;
  const companyNormalized =
    patch.companyNormalized ?? record.companyNormalized;
  const shipperNameNormalized =
    record.sourceType === "amazon"
      ? amazonShipperName()
      : (patch.shipperNameNormalized ?? record.shipperNameNormalized);

  const salesAmount =
    patch.salesAmount ?? patch.amount ?? record.salesAmount ?? record.amount;
  const paymentAmount =
    patch.paymentAmount ?? record.paymentAmount ?? record.cost;
  const differenceAmount =
    patch.differenceAmount ?? record.differenceAmount ?? 0;
  const laborCostAmount =
    patch.laborCostAmount ?? record.laborCostAmount ?? 0;

  const updated: PreprocessedRecord = {
    ...record,
    ...patch,
    operationType,
    companyNormalized,
    shipperNameOriginal:
      record.sourceType === "amazon"
        ? amazonShipperName()
        : record.shipperNameOriginal,
    shipperNameNormalized,
    amount: salesAmount,
    cost: paymentAmount,
    salesAmount,
    paymentAmount,
    differenceAmount,
    laborCostAmount,
    routeNameNormalized:
      patch.routeNameNormalized ?? record.routeNameNormalized,
    jobNameNormalized:
      patch.jobNameNormalized ??
      patch.routeNameNormalized ??
      record.jobNameNormalized,
    isManuallyEdited: true,
  };

  return record.sourceType === "amazon"
    ? enrichAmazonAmountFields(updated)
    : updated;
}

export function summarizePreprocessRecords(
  records: PreprocessedRecord[],
  duplicateCount: number,
): Pick<
  PreprocessResult,
  "successRows" | "warningRows" | "errorRows" | "duplicateRows"
> {
  let successRows = 0;
  let warningRows = 0;
  let errorRows = 0;

  for (const r of records) {
    if (r.errors.length > 0) {
      errorRows++;
      continue;
    }

    const status = r.warningStatus ?? "pending";
    if (status === "confirmed_duplicate") continue;
    if (status === "confirmed_valid") {
      successRows++;
      continue;
    }
    if (r.warnings.length > 0) warningRows++;
    else successRows++;
  }

  return {
    successRows,
    warningRows,
    errorRows,
    duplicateRows: duplicateCount,
  };
}

/** 全レコードの warning/error を再計算し、集計を更新 */
export function recomputePreprocessResult(
  result: PreprocessResult,
): PreprocessResult {
  const dup = detectDuplicateRecords(result.records);
  let records = result.records.map((record) => {
    const enriched =
      record.sourceType === "amazon"
        ? enrichAmazonAmountFields(record)
        : record;
    return recomputeRecordIssues(
      enriched,
      dup.duplicateRowIds.has(record.id),
    );
  });
  records = applyDuplicateWarnings(records, dup);

  const global = collectGlobalIssues(records);
  const activeDuplicateCount = countActiveDuplicateRecords(records);
  const summary = summarizePreprocessRecords(records, activeDuplicateCount);

  const warningDetails = buildWarningDetails(records);
  const warningStatusSummary = summarizeWarningStatus(records);
  const aggregatableRecords = getAggregatableRecords(records);
  const amazonTotals =
    result.sourceType === "amazon" && result.amazonExcelHeaderTotals
      ? buildAmazonTotalsComparison(
          aggregatableRecords,
          result.amazonExcelHeaderTotals,
        )
      : result.amazonTotals;

  const fmTotals =
    result.sourceType === "filemaker_dispatch"
      ? buildFmDispatchAmountTotals(aggregatableRecords)
      : result.fmTotals;

  return {
    ...result,
    ...summary,
    records,
    warnings: global.warnings,
    errors: global.errors,
    warningDetails,
    warningStatusSummary,
    amazonTotals,
    fmTotals,
  };
}

export function setRecordsWarningStatus(
  result: PreprocessResult,
  recordIds: string[],
  warningStatus: PreprocessWarningStatus,
): PreprocessResult {
  const idSet = new Set(recordIds);
  const records = result.records.map((record) => {
    if (!idSet.has(record.id)) return record;
    const nextWarnings =
      warningStatus === "confirmed_valid"
        ? record.warnings.filter((w) => w !== "重複候補")
        : record.warnings;
    return { ...record, warningStatus, warnings: nextWarnings };
  });
  const updated = recomputePreprocessResult({ ...result, records });
  console.log("Updated warning status", {
    recordIds,
    warningStatus,
    records: updated.records
      .filter((r) => idSet.has(r.id))
      .map((r) => ({
        id: r.id,
        sourceRowNumber: r.sourceRowNumber,
        warningStatus: r.warningStatus,
        warnings: r.warnings,
      })),
    warningStatusSummary: updated.warningStatusSummary,
    duplicateRows: updated.duplicateRows,
  });
  return updated;
}

export function updatePreprocessRecord(
  result: PreprocessResult,
  recordId: string,
  patch: RecordEditPatch,
): PreprocessResult {
  const records = result.records.map((r) =>
    r.id === recordId ? applyRecordEditPatch(r, patch) : r,
  );
  return recomputePreprocessResult({ ...result, records });
}

export function bulkUpdateByCompanyOriginal(
  result: PreprocessResult,
  companyOriginal: string,
  operationType: PreprocessOperationType,
  companyNormalized: string,
): PreprocessResult {
  const records = result.records.map((r) => {
    const match =
      companyOriginal === ""
        ? !r.companyOriginal?.trim()
        : r.companyOriginal === companyOriginal;
    if (!match) return r;
    return applyRecordEditPatch(r, {
      operationType,
      companyNormalized,
    });
  });
  return recomputePreprocessResult({ ...result, records });
}

export type CompanyBulkGroup = {
  companyOriginal: string;
  count: number;
  operationType: PreprocessedRecord["operationType"];
  companyNormalized: string;
  dominantOperationType: PreprocessedRecord["operationType"];
};

export function groupRecordsByCompanyOriginal(
  records: PreprocessedRecord[],
): CompanyBulkGroup[] {
  const map = new Map<
    string,
    {
      count: number;
      operationTypes: Map<PreprocessedRecord["operationType"], number>;
      companyNormalized: string;
    }
  >();

  for (const r of records) {
    const key = r.companyOriginal || "（空欄）";
    const entry = map.get(key) ?? {
      count: 0,
      operationTypes: new Map(),
      companyNormalized: r.companyNormalized,
    };
    entry.count++;
    entry.operationTypes.set(
      r.operationType,
      (entry.operationTypes.get(r.operationType) ?? 0) + 1,
    );
    map.set(key, entry);
  }

  return [...map.entries()]
    .map(([companyOriginal, data]) => {
      let dominantOperationType: PreprocessedRecord["operationType"] = "unknown";
      let max = 0;
      for (const [type, n] of data.operationTypes) {
        if (n > max) {
          max = n;
          dominantOperationType = type;
        }
      }
      return {
        companyOriginal: companyOriginal === "（空欄）" ? "" : companyOriginal,
        count: data.count,
        operationType: dominantOperationType,
        companyNormalized: data.companyNormalized,
        dominantOperationType,
      };
    })
    .sort((a, b) => b.count - a.count);
}
