import { sumAllocationExpenses } from "./allocation-expense-utils";
import { buildMonthlySummary } from "./monthly-aggregate";
import {
  aggregateFuelByVehicle,
  totalFuelForMonth,
  totalMaintenanceForMonth,
  totalTollExpenseForMonth,
} from "./vehicle-maintenance-cost";
import type { DailyRecord, MasterData, VehicleExpenseRecord } from "./types";

export type MonthlyFinancialSnapshot = {
  yearMonth: string;
  totalRevenue: number;
  totalLabor: number;
  totalToll: number;
  totalFuel: number;
  totalMaintenance: number;
  allocationExpense: number;
  totalPartnerFee: number;
  /** 売上 − 高速 − 傭車 − 燃料 − 修繕（人件費・按分前） */
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  totalVehicleDays: number;
  avgRevenuePerVehicleDay: number;
  /** 総人件費 ÷ 粗利益。粗利益が0以下のときは null */
  laborDistributionRate: number | null;
};

function sumShipperField(
  shippers: { totalLabor: number; totalToll: number; totalPartnerFee: number }[],
  field: "totalLabor" | "totalToll" | "totalPartnerFee",
): number {
  return shippers.reduce((sum, row) => sum + row[field], 0);
}

export function buildMonthlyFinancialSnapshot(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
  vehicleExpenses: VehicleExpenseRecord[],
): MonthlyFinancialSnapshot {
  const summary = buildMonthlySummary(records, yearMonth, masters);
  const vehicleKeys = summary.vehicles.map((v) => v.vehicleNumber);

  const totalMaintenance = totalMaintenanceForMonth(vehicleExpenses, yearMonth);
  const totalFuel = totalFuelForMonth(vehicleExpenses, yearMonth);
  const importedToll = totalTollExpenseForMonth(vehicleExpenses, yearMonth);

  const totalLabor = sumShipperField(summary.shippers, "totalLabor");
  const tripToll = sumShipperField(summary.shippers, "totalToll");
  const totalToll = importedToll > 0 ? importedToll : tripToll;
  const totalPartnerFee = sumShipperField(summary.shippers, "totalPartnerFee");
  const allocationExpense = sumAllocationExpenses(masters);

  const totalVehicleDays = summary.vehicles.reduce(
    (sum, vehicle) => sum + vehicle.operatingDays,
    0,
  );

  const grossProfit =
    summary.totalRevenue -
    totalToll -
    totalPartnerFee -
    totalFuel -
    totalMaintenance;

  const totalExpenses =
    totalLabor +
    totalToll +
    totalFuel +
    totalMaintenance +
    totalPartnerFee +
    allocationExpense;

  const netProfit = summary.totalRevenue - totalExpenses;

  const avgRevenuePerVehicleDay =
    totalVehicleDays > 0
      ? Math.round(summary.totalRevenue / totalVehicleDays)
      : 0;

  const laborDistributionRate =
    grossProfit > 0 ? totalLabor / grossProfit : null;

  return {
    yearMonth,
    totalRevenue: summary.totalRevenue,
    totalLabor,
    totalToll,
    totalFuel,
    totalMaintenance,
    allocationExpense,
    totalPartnerFee,
    grossProfit,
    totalExpenses,
    netProfit,
    totalVehicleDays,
    avgRevenuePerVehicleDay,
    laborDistributionRate,
  };
}

/** 対象月を終端に、実績のある月を最大 maxMonths 件で返す */
export function listYearMonthsForTrend(
  records: DailyRecord[],
  endYearMonth: string,
  maxMonths = 6,
): string[] {
  const available = new Set<string>();
  for (const record of records) {
    if (record.date.length >= 7) available.add(record.date.slice(0, 7));
  }
  if (available.size === 0) return [endYearMonth];

  const sorted = [...available].sort();
  const endIndex = sorted.findLastIndex((ym) => ym <= endYearMonth);
  const sliceEnd = endIndex >= 0 ? endIndex + 1 : sorted.length;
  const sliceStart = Math.max(0, sliceEnd - maxMonths);
  const months = sorted.slice(sliceStart, sliceEnd);
  if (!months.includes(endYearMonth) && endYearMonth.match(/^\d{4}-\d{2}$/)) {
    months.push(endYearMonth);
    months.sort();
    if (months.length > maxMonths) {
      return months.slice(months.length - maxMonths);
    }
  }
  return months;
}

export function buildMonthlyTrendSnapshots(
  records: DailyRecord[],
  endYearMonth: string,
  masters: MasterData,
  vehicleExpenses: VehicleExpenseRecord[],
  maxMonths = 6,
): MonthlyFinancialSnapshot[] {
  const months = listYearMonthsForTrend(records, endYearMonth, maxMonths);
  return months.map((yearMonth) =>
    buildMonthlyFinancialSnapshot(
      records,
      yearMonth,
      masters,
      vehicleExpenses,
    ),
  );
}

/** 車両別燃料按分（インポート燃料が無い場合のマスタ按分費配分） */
export function fuelByVehicleFromAllocation(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
  vehicleExpenses: VehicleExpenseRecord[],
): Map<string, number> {
  const summary = buildMonthlySummary(records, yearMonth, masters);
  const vehicleKeys = summary.vehicles.map((v) => v.vehicleNumber);
  const imported = aggregateFuelByVehicle(
    vehicleExpenses,
    yearMonth,
    vehicleKeys,
  );
  const hasImported = [...imported.values()].some((v) => v > 0);
  if (hasImported) return imported;

  const totalAllocation = sumAllocationExpenses(masters);
  const map = new Map<string, number>();
  if (totalAllocation <= 0 || summary.vehicles.length === 0) return map;

  const totalDays = summary.vehicles.reduce((s, v) => s + v.operatingDays, 0);
  if (totalDays <= 0) return map;

  let allocated = 0;
  summary.vehicles.forEach((vehicle, index) => {
    const isLast = index === summary.vehicles.length - 1;
    const share = isLast
      ? totalAllocation - allocated
      : Math.floor(totalAllocation * (vehicle.operatingDays / totalDays));
    allocated += share;
    if (share > 0) map.set(vehicle.vehicleNumber, share);
  });
  return map;
}
