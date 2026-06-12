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
  PreprocessSourceType,
} from "../types";

/** Amazon 以外のレコード用デフォルト金額 */
export function defaultAmountFields(): Pick<
  PreprocessedRecord,
  | "amount"
  | "cost"
  | "salesAmount"
  | "paymentAmount"
  | "differenceAmount"
  | "excelDifferenceAmount"
  | "calculatedGrossProfitAmount"
  | "laborCostAmount"
> {
  return {
    amount: 0,
    cost: 0,
    salesAmount: 0,
    paymentAmount: 0,
    differenceAmount: 0,
    excelDifferenceAmount: 0,
    calculatedGrossProfitAmount: 0,
    laborCostAmount: 0,
  };
}

export function finalizePreprocessResult(
  base: Omit<
    PreprocessResult,
    "successRows" | "warningRows" | "errorRows" | "duplicateRows"
  >,
): PreprocessResult {
  const dup = detectDuplicateRecords(base.records);
  let records = applyDuplicateWarnings(base.records, dup);

  const partial: PreprocessResult = {
    ...base,
    successRows: 0,
    warningRows: 0,
    errorRows: 0,
    duplicateRows: dup.duplicateRowIds.size,
    records,
  };

  const recomputed = recomputePreprocessResult(partial);
  const global = collectGlobalIssues(recomputed.records);

  return {
    ...recomputed,
    warnings: [...base.warnings, ...global.warnings],
    errors: [...base.errors, ...global.errors],
  };
}

export function parseMoneyText(value: string): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}
