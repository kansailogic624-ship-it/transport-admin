/**
 * 車両別利益ランキング。
 * 利益 ＝ 売上 − 燃料費 − 高速代 − 修繕費（人件費は車両ランキング対象外）。
 */

import { buildVehicleCostBreakdown } from "@/lib/dashboard-analytics";
import { buildMonthlySummary } from "@/lib/monthly-aggregate";
import { fuelByVehicleFromAllocation } from "@/lib/monthly-overview-metrics";
import {
  aggregateMaintenanceByVehicle,
  aggregateTollByVehicle,
} from "@/lib/vehicle-maintenance-cost";
import type { DailyRecord, MasterData, VehicleExpenseRecord } from "@/lib/types";

export type VehicleProfitRankingRow = {
  rank: number;
  vehicleNumber: string;
  totalRevenue: number;
  fuelCost: number;
  tollCost: number;
  maintenanceCost: number;
  profit: number;
  operatingDays: number;
};

export type VehicleProfitSortMode = "best" | "worst";

export function buildVehicleProfitRankings(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
  vehicleExpenses: VehicleExpenseRecord[],
  sortMode: VehicleProfitSortMode = "best",
): VehicleProfitRankingRow[] {
  const summary = buildMonthlySummary(records, yearMonth, masters);
  const vehicleKeys = summary.vehicles.map((v) => v.vehicleNumber);

  const maintenanceByVehicle = aggregateMaintenanceByVehicle(
    vehicleExpenses,
    yearMonth,
    vehicleKeys,
  );
  const fuelByVehicle = fuelByVehicleFromAllocation(
    records,
    yearMonth,
    masters,
    vehicleExpenses,
  );
  const importedTollByVehicle = aggregateTollByVehicle(
    vehicleExpenses,
    yearMonth,
    vehicleKeys,
  );

  const breakdown = buildVehicleCostBreakdown(
    records,
    yearMonth,
    masters,
    maintenanceByVehicle,
    fuelByVehicle,
    importedTollByVehicle,
  );

  const unsorted = breakdown.map((row) => ({
    vehicleNumber: row.vehicleNumber,
    totalRevenue: row.totalRevenue,
    fuelCost: row.fuelCost,
    tollCost: row.tollCost,
    maintenanceCost: row.maintenanceCost,
    profit: row.totalRevenue - row.fuelCost - row.tollCost - row.maintenanceCost,
    operatingDays: row.operatingDays,
  }));

  const sorted = [...unsorted].sort((a, b) =>
    sortMode === "best" ? b.profit - a.profit : a.profit - b.profit,
  );

  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}
