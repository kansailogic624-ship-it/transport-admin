/**
 * Amazon実績 Excel/CSV 前処理パーサー
 */

import { parseAmazonPerformanceWithMeta } from "@/lib/amazon-performance-parser";
import { enrichAmazonAmountFields } from "../amazon-amounts";
import {
  amazonShipperName,
  classifyAmazonOperationType,
  normalizeDriverForPreprocess,
  normalizeRouteForPreprocess,
} from "../normalize";
import {
  applyDuplicateWarnings,
  detectDuplicateRecords,
} from "../duplicate-check";
import { recomputePreprocessResult } from "../record-state";
import { collectGlobalIssues } from "../validators";
import type {
  PreprocessedRecord,
  PreprocessNormalizeContext,
  PreprocessResult,
} from "../types";

function rowToPreprocessedRecord(
  row: Awaited<
    ReturnType<typeof parseAmazonPerformanceWithMeta>
  >["rows"][number],
  sourceFileName: string,
  sourceRowNumber: number,
  ctx?: PreprocessNormalizeContext,
): PreprocessedRecord {
  const driver = normalizeDriverForPreprocess(row.driverName, ctx);
  const route = normalizeRouteForPreprocess(row.routeLabel);
  const companyOriginal = row.companyNameRaw || row.companyName || "";
  const company = classifyAmazonOperationType(companyOriginal);

  const id = crypto.randomUUID();

  const record: PreprocessedRecord = {
    id,
    sourceType: "amazon",
    sourceFileName,
    sourceRowNumber,
    businessDate: row.date,
    driverNameOriginal: row.driverName,
    driverNameNormalized: driver.normalized,
    vehicleNoOriginal: "",
    vehicleNoNormalized: "",
    shipperNameOriginal: amazonShipperName(),
    shipperNameNormalized: amazonShipperName(),
    jobNameOriginal: row.routeLabel,
    jobNameNormalized: route.normalized,
    routeNameOriginal: row.routeLabel,
    routeNameNormalized: route.normalized,
    companyOriginal,
    companyNormalized: company.companyNormalized,
    operationType: company.operationType,
    amount: row.revenue,
    cost: row.payment,
    salesAmount: row.revenue,
    paymentAmount: row.payment,
    differenceAmount: row.diff,
    excelDifferenceAmount: row.diff,
    calculatedGrossProfitAmount: 0,
    laborCostAmount: row.laborCost,
    workStartTime: "",
    workEndTime: "",
    warnings: [],
    errors: [],
    warningStatus: "pending",
    isManuallyEdited: false,
    raw: {
      date: row.date,
      driverName: row.driverName,
      companyName: row.companyName,
      companyNameRaw: companyOriginal,
      routeLabel: row.routeLabel,
      revenue: row.revenue,
      payment: row.payment,
      diff: row.diff,
      laborCost: row.laborCost,
      memo: row.memo,
      operationType: company.operationType,
      routeType: route.routeType,
    },
  };

  return enrichAmazonAmountFields(record);
}

export async function parseAmazonPreprocessorFile(
  buffer: ArrayBuffer,
  fileName: string,
  ctx?: PreprocessNormalizeContext,
): Promise<PreprocessResult> {
  const parsed = await parseAmazonPerformanceWithMeta(buffer, fileName);
  const createdAt = new Date().toISOString();

  let records = parsed.rows.map((row, index) =>
    rowToPreprocessedRecord(row, fileName, index + 1, ctx),
  );

  const dup = detectDuplicateRecords(records);
  records = applyDuplicateWarnings(records, dup);

  const base: PreprocessResult = {
    sourceType: "amazon",
    sourceFileName: fileName,
    totalRows: parsed.rows.length,
    successRows: 0,
    warningRows: 0,
    errorRows: 0,
    duplicateRows: dup.duplicateRowIds.size,
    records,
    warnings: [],
    errors: [],
    createdAt,
    amazonExcelHeaderTotals: parsed.headerTotals,
  };

  const recomputed = recomputePreprocessResult(base);
  const global = collectGlobalIssues(recomputed.records);

  return {
    ...recomputed,
    warnings: global.warnings,
    errors: global.errors,
  };
}
