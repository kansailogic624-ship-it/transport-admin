/**
 * 経営ダッシュボードの集計オーケストレーター。
 * 画面は本モジュールの buildExecutiveDashboard のみを呼び出す。
 */

import { buildMonthlySummary } from "@/lib/monthly-aggregate";
import { buildMonthlyProfitSummary } from "./profit-engine";
import {
  buildShipperProfitRankings,
  detectNeedsImprovementShippers,
  type ShipperProfitSortMode,
} from "./shipper-profit";
import {
  buildVehicleProfitRankings,
  type VehicleProfitSortMode,
} from "./vehicle-profit";
import { buildDriverProductivityRankings } from "./driver-productivity";
import type { DailyRecord, MasterData, VehicleExpenseRecord } from "@/lib/types";
import type { MonthlyProfitSummary } from "./profit-engine";
import type {
  NeedsImprovementShipper,
  ShipperProfitRankingRow,
} from "./shipper-profit";
import type { VehicleProfitRankingRow } from "./vehicle-profit";
import type { DriverProductivityRankingRow } from "./driver-productivity";

/** 将来の EBITDA・傭車比率等を差し込むための拡張スロット */
export type DashboardExtensionSlots = {
  ebitda: number | null;
  partnerVehicleRatio: number | null;
  priceIncreaseCandidates: string[];
  vehicleReplacementCandidates: string[];
  cashFlow: number | null;
};

export type DashboardKpis = {
  monthlyRevenue: number;
  monthlyCoreExpenses: number;
  monthlyNetProfit: number;
  grossMargin: number | null;
  activeDriverCount: number;
  activeVehicleCount: number;
  expenseBreakdown: MonthlyProfitSummary["expenses"];
};

export type ExecutiveDashboardData = {
  yearMonth: string;
  kpis: DashboardKpis;
  shipperRankings: ShipperProfitRankingRow[];
  vehicleRankings: VehicleProfitRankingRow[];
  driverRankings: DriverProductivityRankingRow[];
  needsImprovementShippers: NeedsImprovementShipper[];
  extensions: DashboardExtensionSlots;
};

export type ExecutiveDashboardInput = {
  records: DailyRecord[];
  yearMonth: string;
  masters: MasterData;
  vehicleExpenses: VehicleExpenseRecord[];
  shipperSort?: ShipperProfitSortMode;
  vehicleSort?: VehicleProfitSortMode;
};

function emptyExtensions(): DashboardExtensionSlots {
  return {
    ebitda: null,
    partnerVehicleRatio: null,
    priceIncreaseCandidates: [],
    vehicleReplacementCandidates: [],
    cashFlow: null,
  };
}

export function buildExecutiveDashboard(
  input: ExecutiveDashboardInput,
): ExecutiveDashboardData {
  const {
    records,
    yearMonth,
    masters,
    vehicleExpenses,
    shipperSort = "best",
    vehicleSort = "best",
  } = input;

  const profit = buildMonthlyProfitSummary(
    records,
    yearMonth,
    masters,
    vehicleExpenses,
  );
  const summary = buildMonthlySummary(records, yearMonth, masters);

  const shipperRankings = buildShipperProfitRankings(
    records,
    yearMonth,
    masters,
    vehicleExpenses,
    shipperSort,
  );
  const vehicleRankings = buildVehicleProfitRankings(
    records,
    yearMonth,
    masters,
    vehicleExpenses,
    vehicleSort,
  );
  const driverRankings = buildDriverProductivityRankings(
    records,
    yearMonth,
    masters,
  );

  const needsImprovementShippers = detectNeedsImprovementShippers(
    shipperRankings.map(({ rank: _rank, ...rest }) => rest),
  );

  return {
    yearMonth,
    kpis: {
      monthlyRevenue: profit.totalRevenue,
      monthlyCoreExpenses: profit.totalCoreExpenses,
      monthlyNetProfit: profit.netProfit,
      grossMargin: profit.grossMargin,
      activeDriverCount: summary.drivers.filter((d) => d.operatingDays > 0)
        .length,
      activeVehicleCount: summary.vehicles.filter((v) => v.operatingDays > 0)
        .length,
      expenseBreakdown: profit.expenses,
    },
    shipperRankings,
    vehicleRankings,
    driverRankings,
    needsImprovementShippers,
    extensions: emptyExtensions(),
  };
}
