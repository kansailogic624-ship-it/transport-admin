import type { PreprocessedRecord } from "./types";

export function computeAmazonCalculatedGrossProfit(
  record: Pick<
    PreprocessedRecord,
    | "operationType"
    | "salesAmount"
    | "amount"
    | "paymentAmount"
    | "cost"
    | "laborCostAmount"
  >,
): number {
  const sales = record.salesAmount ?? record.amount ?? 0;
  const payment = record.paymentAmount ?? record.cost ?? 0;
  const labor = record.laborCostAmount ?? 0;

  if (record.operationType === "own") return sales - labor;
  if (record.operationType === "partner") return sales - payment;
  return sales - payment;
}

/** Amazon レコードの金額派生フィールドを同期 */
export function enrichAmazonAmountFields(
  record: PreprocessedRecord,
): PreprocessedRecord {
  if (record.sourceType !== "amazon") return record;

  const salesAmount = record.salesAmount ?? record.amount ?? 0;
  const paymentAmount = record.paymentAmount ?? record.cost ?? 0;
  const laborCostAmount = record.laborCostAmount ?? 0;
  const excelDifferenceAmount =
    record.excelDifferenceAmount ?? record.differenceAmount ?? 0;

  return {
    ...record,
    amount: salesAmount,
    cost: paymentAmount,
    salesAmount,
    paymentAmount,
    laborCostAmount,
    excelDifferenceAmount,
    differenceAmount: excelDifferenceAmount,
    calculatedGrossProfitAmount: computeAmazonCalculatedGrossProfit({
      operationType: record.operationType,
      salesAmount,
      amount: salesAmount,
      paymentAmount,
      cost: paymentAmount,
      laborCostAmount,
    }),
  };
}
