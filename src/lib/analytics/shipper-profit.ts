/**
 * 荷主別利益ランキング・要改善荷主の判定。
 */

import { buildShipperJobAnalysis } from "@/lib/dashboard-analytics";
import { enrichShipperJobMarginalProfit } from "@/lib/shipper-marginal-profit";
import { sumAllocationExpenses } from "@/lib/allocation-expense-utils";
import { buildMonthlySummary } from "@/lib/monthly-aggregate";
import { buildMonthlyFinancialSnapshot } from "@/lib/monthly-overview-metrics";
import { totalMaintenanceForMonth } from "@/lib/vehicle-maintenance-cost";
import type { DailyRecord, MasterData, VehicleExpenseRecord } from "@/lib/types";

/** 利益率がこの値未満なら要改善候補 */
export const NEEDS_IMPROVEMENT_MARGIN = 0.1;

/** 平均拘束時間（時間）がこの値超なら要改善候補 */
export const NEEDS_IMPROVEMENT_RESTRAINT_HOURS = 12;

export type ShipperProfitRankingRow = {
  rank: number;
  shipperName: string;
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
  profitMargin: number;
  tripCount: number;
  averageRestraintHours: number;
};

export type NeedsImprovementShipper = ShipperProfitRankingRow & {
  reasons: ("lowMargin" | "longRestraint")[];
};

export type ShipperProfitSortMode = "best" | "worst";

function allocateByRevenue(
  shippers: { shipperName: string; totalRevenue: number }[],
  totalAmount: number,
): Map<string, number> {
  const map = new Map<string, number>();
  const totalRev = shippers.reduce((s, r) => s + r.totalRevenue, 0);
  if (totalRev <= 0 || totalAmount <= 0) return map;

  let allocated = 0;
  shippers.forEach((shipper, index) => {
    const isLast = index === shippers.length - 1;
    const share = isLast
      ? totalAmount - allocated
      : Math.round(totalAmount * (shipper.totalRevenue / totalRev));
    allocated += share;
    if (share > 0) map.set(shipper.shipperName, share);
  });
  return map;
}

function toRankingRow(
  shipper: ReturnType<typeof enrichShipperJobMarginalProfit>[number],
  maintenanceShare: number,
): Omit<ShipperProfitRankingRow, "rank"> {
  const totalExpense =
    shipper.totalLabor +
    shipper.totalToll +
    shipper.totalPartnerFee +
    shipper.allocatedFuel +
    (shipper.allocatedCommonExpense ?? 0) +
    maintenanceShare;

  const netProfit = shipper.totalRevenue - totalExpense;
  const profitMargin =
    shipper.totalRevenue > 0 ? netProfit / shipper.totalRevenue : 0;
  const averageRestraintHours =
    shipper.tripCount > 0
      ? shipper.restraintMinutes / shipper.tripCount / 60
      : 0;

  return {
    shipperName: shipper.shipperName,
    totalRevenue: shipper.totalRevenue,
    totalExpense,
    netProfit,
    profitMargin,
    tripCount: shipper.tripCount,
    averageRestraintHours,
  };
}

export function buildShipperProfitRankings(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
  vehicleExpenses: VehicleExpenseRecord[],
  sortMode: ShipperProfitSortMode = "best",
): ShipperProfitRankingRow[] {
  const summary = buildMonthlySummary(records, yearMonth, masters);
  const financial = buildMonthlyFinancialSnapshot(
    records,
    yearMonth,
    masters,
    vehicleExpenses,
  );

  const maintenanceByShipper = allocateByRevenue(
    summary.shippers,
    totalMaintenanceForMonth(vehicleExpenses, yearMonth),
  );
  const fuelByShipper = allocateByRevenue(
    summary.shippers,
    financial.totalFuel,
  );

  const analysisRows = buildShipperJobAnalysis(
    records,
    yearMonth,
    masters,
    fuelByShipper,
  );
  const enriched = enrichShipperJobMarginalProfit(
    analysisRows,
    sumAllocationExpenses(masters),
  );

  const unsorted = enriched.map((shipper) =>
    toRankingRow(
      shipper,
      maintenanceByShipper.get(shipper.shipperName) ?? 0,
    ),
  );

  const sorted = [...unsorted].sort((a, b) =>
    sortMode === "best"
      ? b.profitMargin - a.profitMargin
      : a.profitMargin - b.profitMargin,
  );

  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

export function detectNeedsImprovementShippers(
  rows: Omit<ShipperProfitRankingRow, "rank">[],
): NeedsImprovementShipper[] {
  return rows
    .map((row) => {
      const reasons: NeedsImprovementShipper["reasons"] = [];
      if (row.profitMargin < NEEDS_IMPROVEMENT_MARGIN) {
        reasons.push("lowMargin");
      }
      if (row.averageRestraintHours > NEEDS_IMPROVEMENT_RESTRAINT_HOURS) {
        reasons.push("longRestraint");
      }
      if (reasons.length === 0) return null;
      return { ...row, rank: 0, reasons };
    })
    .filter((row): row is NeedsImprovementShipper => row !== null)
    .sort((a, b) => a.profitMargin - b.profitMargin)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
