import type {
  AmazonAmountTotals,
  AmazonExcelHeaderTotals,
  AmazonTotalsComparison,
  PreprocessedRecord,
} from "./types";

function emptyTotals(): AmazonAmountTotals {
  return {
    sales: 0,
    payment: 0,
    difference: 0,
    grossProfit: 0,
    laborCost: 0,
    count: 0,
    ownCount: 0,
    partnerCount: 0,
    unknownCount: 0,
  };
}

export function sumAmazonAmounts(
  records: PreprocessedRecord[],
): AmazonAmountTotals {
  const totals = emptyTotals();

  for (const record of records) {
    totals.sales += record.salesAmount ?? record.amount ?? 0;
    totals.payment += record.paymentAmount ?? record.cost ?? 0;
    totals.difference +=
      record.excelDifferenceAmount ?? record.differenceAmount ?? 0;
    totals.grossProfit += record.calculatedGrossProfitAmount ?? 0;
    totals.laborCost += record.laborCostAmount ?? 0;
    totals.count++;
    if (record.operationType === "own") totals.ownCount++;
    else if (record.operationType === "partner") totals.partnerCount++;
    else totals.unknownCount++;
  }

  return totals;
}

function compareTotal(
  excelValue: number | null,
  importedValue: number,
): boolean | null {
  if (excelValue == null) return null;
  return Math.round(excelValue) === Math.round(importedValue);
}

export function buildAmazonTotalsComparison(
  records: PreprocessedRecord[],
  excel: AmazonExcelHeaderTotals,
): AmazonTotalsComparison {
  const imported = sumAmazonAmounts(records);
  const byOperation = {
    all: imported,
    own: sumAmazonAmounts(records.filter((r) => r.operationType === "own")),
    partner: sumAmazonAmounts(
      records.filter((r) => r.operationType === "partner"),
    ),
  };

  const matches = {
    sales: compareTotal(excel.sales, imported.sales),
    payment: compareTotal(excel.payment, imported.payment),
    difference: compareTotal(excel.difference, imported.difference),
    laborCost: compareTotal(excel.laborCost, imported.laborCost),
    allMatch: null as boolean | null,
  };

  if (excel.found) {
    const checks = [
      matches.sales,
      matches.payment,
      matches.difference,
      matches.laborCost,
    ].filter((v) => v != null);
    matches.allMatch =
      checks.length > 0 ? checks.every((v) => v === true) : null;
  }

  return { excel, imported, byOperation, matches };
}
