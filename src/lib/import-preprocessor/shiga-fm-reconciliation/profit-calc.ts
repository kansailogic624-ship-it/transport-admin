import type { ShigaFmReconciliationRow } from "./types";

export function calcGrossProfit(sales: number, payment: number): number {
  return sales - payment;
}

export function calcGrossProfitRate(
  sales: number,
  grossProfit: number,
): number | null {
  if (sales <= 0) return null;
  return Math.round((grossProfit / sales) * 10_000) / 100;
}

export function buildProfitFields(sales: number, payment: number): {
  grossProfitAmount: number;
  grossProfitRate: number | null;
} {
  const grossProfitAmount = calcGrossProfit(sales, payment);
  return {
    grossProfitAmount,
    grossProfitRate: calcGrossProfitRate(sales, grossProfitAmount),
  };
}

const AMOUNT_TOLERANCE = 1;

export function amountsNearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

export function sumFmRevenue(
  rows: ShigaFmReconciliationRow["fmRecords"],
): number {
  return rows.reduce((s, r) => s + r.revenueAmount, 0);
}
