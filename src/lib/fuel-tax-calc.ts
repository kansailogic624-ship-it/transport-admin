/**
 * 加島燃料代 — 軽油税・消費税の逆算（税率は PDF / AI から可変）
 */

import { safeNumber } from "./currency-format";
import { detectFuelTaxRateFromText } from "./fuel-bill-parser";

/** PDF から税率が判別できない場合の標準値（円/L） */
export const DEFAULT_FUEL_TAX_RATE = 32.1;

export type FuelRowTaxBreakdown = {
  dieselTax: number;
  fuelExclTax: number;
  consumptionTax: number;
  taxInclusiveTotal: number;
};

export type FuelBillTaxTotals = {
  totalQuantity: number;
  totalShabanKei: number;
  totalDieselTax: number;
  totalConsumptionTax: number;
  totalTaxInclusive: number;
};

export function isValidFuelTaxRate(rate: unknown): rate is number {
  return (
    typeof rate === "number" &&
    Number.isFinite(rate) &&
    rate > 0 &&
    rate <= 200
  );
}

/** 1行分: 車番計・数量計から税内訳を逆算 */
export function computeFuelRowTax(
  quantity: number,
  shabanKeiAmount: number,
  fuelTaxRate: number,
): FuelRowTaxBreakdown {
  const rate = isValidFuelTaxRate(fuelTaxRate)
    ? fuelTaxRate
    : DEFAULT_FUEL_TAX_RATE;
  const dieselTax = Math.floor(Math.max(0, quantity) * rate);
  const fuelExclTax = Math.max(0, shabanKeiAmount - dieselTax);
  const consumptionTax = Math.floor(fuelExclTax * 0.1);
  const taxInclusiveTotal = fuelExclTax + consumptionTax + dieselTax;
  return { dieselTax, fuelExclTax, consumptionTax, taxInclusiveTotal };
}

export function computeFuelBillTaxTotals(
  rows: { totalQuantity: number; totalAmount: number }[],
  fuelTaxRate: number,
): FuelBillTaxTotals {
  let totalQuantity = 0;
  let totalShabanKei = 0;
  let totalDieselTax = 0;
  let totalConsumptionTax = 0;
  let totalTaxInclusive = 0;

  for (const r of rows) {
    const qty = safeNumber(r.totalQuantity);
    const amt = safeNumber(r.totalAmount);
    const b = computeFuelRowTax(qty, amt, fuelTaxRate);
    totalQuantity += qty;
    totalShabanKei += amt;
    totalDieselTax += b.dieselTax;
    totalConsumptionTax += b.consumptionTax;
    totalTaxInclusive += b.taxInclusiveTotal;
  }

  return {
    totalQuantity,
    totalShabanKei,
    totalDieselTax,
    totalConsumptionTax,
    totalTaxInclusive,
  };
}

/** AI JSON から fuel_tax_rate を読み取る */
export function parseFuelTaxRateFromAi(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as { fuel_tax_rate?: unknown; fuelTaxRate?: unknown };
  const raw = obj.fuel_tax_rate ?? obj.fuelTaxRate;
  if (typeof raw === "number" && isValidFuelTaxRate(raw)) return raw;
  const n = parseFloat(String(raw ?? "").replace(/,/g, "").trim());
  return isValidFuelTaxRate(n) ? n : null;
}

/**
 * 適用税率を決定: PDFテキスト判別 → AI → デフォルト 32.1
 */
export function resolveFuelTaxRate(
  text: string,
  aiData?: unknown,
): { rate: number; source: "pdf" | "ai" | "default" } {
  const fromPdf = detectFuelTaxRateFromText(text);
  if (fromPdf !== null) return { rate: fromPdf, source: "pdf" };

  const fromAi = parseFuelTaxRateFromAi(aiData);
  if (fromAi !== null) return { rate: fromAi, source: "ai" };

  return { rate: DEFAULT_FUEL_TAX_RATE, source: "default" };
}

export function formatFuelTaxRateLabel(rate: number): string {
  const s = Number.isInteger(rate) ? String(rate) : rate.toFixed(1);
  return `${s} 円/L`;
}
