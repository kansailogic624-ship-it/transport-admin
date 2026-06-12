/**
 * 月次損益の中核計算。
 * 画面は本モジュール経由でのみ KPI 用損益を参照する。
 */

import { buildMonthlyFinancialSnapshot } from "@/lib/monthly-overview-metrics";
import type { DailyRecord, MasterData, VehicleExpenseRecord } from "@/lib/types";

/** KPI 用の4大経費カテゴリ */
export type CoreExpenseBreakdown = {
  labor: number;
  fuel: number;
  toll: number;
  maintenance: number;
};

export type MonthlyProfitSummary = {
  yearMonth: string;
  totalRevenue: number;
  expenses: CoreExpenseBreakdown;
  /** 4大経費の合計（人件費・燃料・高速・修繕） */
  totalCoreExpenses: number;
  netProfit: number;
  /** 純利益 ÷ 売上。売上0のとき null */
  grossMargin: number | null;
};

export function sumCoreExpenses(expenses: CoreExpenseBreakdown): number {
  return expenses.labor + expenses.fuel + expenses.toll + expenses.maintenance;
}

export function computeGrossMargin(
  netProfit: number,
  revenue: number,
): number | null {
  if (revenue <= 0) return null;
  return netProfit / revenue;
}

/**
 * 月次の売上・4大経費・純利益・粗利率を算出。
 * 総経費は人件費・燃料費・高速代・修繕費のみ（按分費・傭車費は将来 EBITDA 等で拡張）。
 */
export function buildMonthlyProfitSummary(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
  vehicleExpenses: VehicleExpenseRecord[],
): MonthlyProfitSummary {
  const snapshot = buildMonthlyFinancialSnapshot(
    records,
    yearMonth,
    masters,
    vehicleExpenses,
  );

  const expenses: CoreExpenseBreakdown = {
    labor: snapshot.totalLabor,
    fuel: snapshot.totalFuel,
    toll: snapshot.totalToll,
    maintenance: snapshot.totalMaintenance,
  };

  const totalCoreExpenses = sumCoreExpenses(expenses);
  const netProfit = snapshot.totalRevenue - totalCoreExpenses;

  return {
    yearMonth,
    totalRevenue: snapshot.totalRevenue,
    expenses,
    totalCoreExpenses,
    netProfit,
    grossMargin: computeGrossMargin(netProfit, snapshot.totalRevenue),
  };
}
