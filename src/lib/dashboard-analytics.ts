/**
 * ダッシュボード3大分析軸の集計ロジック
 * ① 車両別コスト内訳  ② 荷主→業務ドリルダウン  ③ ドライバー生産性・労務
 */

import {
  buildDriverMonthSummaries,
  formatRestraintDuration,
} from "./driver-monthly-detail";
import { driverOnTripCrew } from "./driver-revenue-share";
import { calculateTripLaborCost } from "./labor-cost";
import { isPartnerRecord, isPartnerTrip } from "./run-type";
import { resolveVehicleMasterLabel } from "./import-match-keys";
import { isExcludedFromVehicleCostAggregation } from "./vehicle-cost-exclude";
import {
  normalizeJobNameForAggregation,
  tripJobLabelForAggregation,
} from "./task-name-normalize";
import {
  aggregateVehicleDayKmForMonth,
  normalizeKey,
  parsePartnerFee,
  parseRevenue,
  parseTollFee,
  recordInMonth,
} from "./trip-utils";
import type { DailyRecord, MasterData, TripEntry } from "./types";

// ---------------------------------------------------------------------------
// 改善基準告示（月間拘束時間の目安）
// ---------------------------------------------------------------------------

/** 月間拘束時間の改善基準告示上限（時間） */
export const MONTHLY_RESTRAINT_LIMIT_HOURS = 284;
export const MONTHLY_RESTRAINT_WARNING_HOURS = Math.floor(
  MONTHLY_RESTRAINT_LIMIT_HOURS * 0.8,
);

export type ComplianceStatus = "ok" | "warning" | "violation";

export function restraintCompliance(
  totalMinutes: number,
): { status: ComplianceStatus; label: string } {
  const hours = totalMinutes / 60;
  if (hours >= MONTHLY_RESTRAINT_LIMIT_HOURS) {
    return {
      status: "violation",
      label: `超過（${formatRestraintDuration(totalMinutes)} / 上限${MONTHLY_RESTRAINT_LIMIT_HOURS}h）`,
    };
  }
  if (hours >= MONTHLY_RESTRAINT_WARNING_HOURS) {
    return {
      status: "warning",
      label: `注意（${formatRestraintDuration(totalMinutes)} / 上限${MONTHLY_RESTRAINT_LIMIT_HOURS}h）`,
    };
  }
  return {
    status: "ok",
    label: `適合（${formatRestraintDuration(totalMinutes)}）`,
  };
}

function parseClockMinutes(time: string): number | null {
  if (!time?.trim()) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function restraintMinutesForRecord(record: DailyRecord): number {
  const start = parseClockMinutes(record.clockIn);
  const end = parseClockMinutes(record.clockOut);
  if (start === null || end === null) return 0;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff > 0 ? diff : 0;
}

function tripRestraintMinutes(record: DailyRecord): number {
  if (isPartnerRecord(record)) return 0;
  const ownCount = record.trips.filter((t) => !isPartnerTrip(t)).length;
  if (ownCount === 0) return 0;
  return restraintMinutesForRecord(record) / ownCount;
}

function laborShareRatio(labor: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return labor / revenue;
}

function revenuePerHour(revenue: number, restraintMinutes: number): number {
  if (restraintMinutes <= 0) return 0;
  return revenue / (restraintMinutes / 60);
}

// ---------------------------------------------------------------------------
// ① 車両別コスト内訳
// ---------------------------------------------------------------------------

export type VehicleCostBreakdownRow = {
  vehicleNumber: string;
  totalRevenue: number;
  totalKm: number;
  operatingDays: number;
  laborCost: number;
  tollCost: number;
  fuelCost: number;
  maintenanceCost: number;
  totalCosts: number;
  netProfit: number;
};

export function buildVehicleCostBreakdown(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
  maintenanceByVehicle: Map<string, number>,
  fuelByVehicle: Map<string, number>,
  importedTollByVehicle?: Map<string, number>,
): VehicleCostBreakdownRow[] {
  const { vehicleMonthKm, vehicleDays } = aggregateVehicleDayKmForMonth(
    records,
    yearMonth,
    masters.vehicles,
    { excludeNonVehicleOfficeWarehouse: true },
  );

  const revenue = new Map<string, number>();
  const labor = new Map<string, number>();
  const toll = new Map<string, number>();

  const monthRecords = records.filter((r) => recordInMonth(r.date, yearMonth));

  for (const record of monthRecords) {
    for (const trip of record.trips) {
      if (isPartnerTrip(trip)) continue;
      if (isExcludedFromVehicleCostAggregation(trip)) continue;
      const vehicle = resolveVehicleMasterLabel(
        trip.vehicleNumber,
        masters.vehicles,
      );
      const rev = parseRevenue(trip.revenue);
      revenue.set(vehicle, (revenue.get(vehicle) ?? 0) + rev);
      toll.set(vehicle, (toll.get(vehicle) ?? 0) + parseTollFee(trip.tollFee));
      const lab = calculateTripLaborCost(trip, records, yearMonth, masters).total;
      labor.set(vehicle, (labor.get(vehicle) ?? 0) + lab);
    }
  }

  const allKeys = new Set([
    ...revenue.keys(),
    ...maintenanceByVehicle.keys(),
    ...fuelByVehicle.keys(),
    ...(importedTollByVehicle?.keys() ?? []),
  ]);

  const rows: VehicleCostBreakdownRow[] = [...allKeys].map((vehicleNumber) => {
    const totalRevenue = revenue.get(vehicleNumber) ?? 0;
    const laborCost = labor.get(vehicleNumber) ?? 0;
    const importedToll = importedTollByVehicle?.get(vehicleNumber) ?? 0;
    const tripToll = toll.get(vehicleNumber) ?? 0;
    const tollCost = importedToll > 0 ? importedToll : tripToll;
    const fuelCost = fuelByVehicle.get(vehicleNumber) ?? 0;
    const maintenanceCost = maintenanceByVehicle.get(vehicleNumber) ?? 0;
    const totalCosts = laborCost + tollCost + fuelCost + maintenanceCost;
    return {
      vehicleNumber,
      totalRevenue,
      totalKm: vehicleMonthKm.get(vehicleNumber) ?? 0,
      operatingDays: vehicleDays.get(vehicleNumber)?.size ?? 0,
      laborCost,
      tollCost,
      fuelCost,
      maintenanceCost,
      totalCosts,
      netProfit: totalRevenue - totalCosts,
    };
  });

  return rows.sort((a, b) => b.netProfit - a.netProfit);
}

export type StackedCostChartRow = {
  name: string;
  fullName: string;
  人件費: number;
  燃料代: number;
  高速代: number;
  修繕費: number;
  純利益: number;
};

export function toStackedCostChartData(
  rows: VehicleCostBreakdownRow[],
  limit = 8,
): StackedCostChartRow[] {
  return rows.slice(0, limit).map((r) => ({
    name: r.vehicleNumber.length > 10
      ? `${r.vehicleNumber.slice(0, 9)}…`
      : r.vehicleNumber,
    fullName: r.vehicleNumber,
    人件費: r.laborCost,
    燃料代: r.fuelCost,
    高速代: r.tollCost,
    修繕費: r.maintenanceCost,
    純利益: Math.max(0, r.netProfit),
  }));
}

// ---------------------------------------------------------------------------
// ② 荷主 → 業務 階層分析
// ---------------------------------------------------------------------------

export type JobAnalysisRow = {
  jobName: string;
  totalRevenue: number;
  totalToll: number;
  totalLabor: number;
  /** 荷主への按分燃料代（業務売上比率） */
  allocatedFuel: number;
  /** 傭車費（協力会社への支払運賃） */
  totalPartnerFee: number;
  tripCount: number;
  restraintMinutes: number;
  grossProfit: number;
  laborShareRatio: number;
  revenuePerHour: number;
  /** 月次共通経費（稼働台数按分）。enrichShipperJobMarginalProfit で付与 */
  allocatedCommonExpense?: number;
  /** 純利益（高速・人件費・共通経費控除後） */
  netProfit?: number;
  profitMargin?: number;
  /** 1台あたり純利益（限界利益） */
  netProfitPerTrip?: number;
};

export type ShipperAnalysisRow = {
  shipperName: string;
  totalRevenue: number;
  totalToll: number;
  totalLabor: number;
  totalPartnerFee: number;
  tripCount: number;
  restraintMinutes: number;
  allocatedFuel: number;
  grossProfit: number;
  laborShareRatio: number;
  revenuePerHour: number;
  jobs: JobAnalysisRow[];
  allocatedCommonExpense?: number;
  netProfit?: number;
  profitMargin?: number;
  netProfitPerTrip?: number;
};

type JobAccumulator = {
  totalRevenue: number;
  totalToll: number;
  totalLabor: number;
  totalPartnerFee: number;
  /** 稼働台数: 日付×業務名（傭車は日付×協力会社）のユニーク数 */
  operationDayKeys: Set<string>;
  restraintMinutes: number;
};

function emptyAcc(): JobAccumulator {
  return {
    totalRevenue: 0,
    totalToll: 0,
    totalLabor: 0,
    totalPartnerFee: 0,
    operationDayKeys: new Set(),
    restraintMinutes: 0,
  };
}

function tripOperationDayKey(date: string, job: string, trip: TripEntry): string {
  if (isPartnerTrip(trip)) {
    return `${date}|partner:${normalizeKey(trip.partnerName, trip.id)}`;
  }
  return `${date}|${job}`;
}

function accToJobRow(
  jobName: string,
  a: JobAccumulator,
  allocatedFuel = 0,
): JobAnalysisRow {
  const grossProfit =
    a.totalRevenue -
    a.totalToll -
    a.totalLabor -
    allocatedFuel -
    a.totalPartnerFee;
  return {
    jobName,
    totalRevenue: a.totalRevenue,
    totalToll: a.totalToll,
    totalLabor: a.totalLabor,
    allocatedFuel,
    totalPartnerFee: a.totalPartnerFee,
    tripCount: a.operationDayKeys.size,
    restraintMinutes: a.restraintMinutes,
    grossProfit,
    laborShareRatio: laborShareRatio(a.totalLabor, a.totalRevenue),
    revenuePerHour: revenuePerHour(a.totalRevenue, a.restraintMinutes),
  };
}

export function buildShipperJobAnalysis(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
  fuelByShipper?: Map<string, number>,
): ShipperAnalysisRow[] {
  const shipperJobs = new Map<string, Map<string, JobAccumulator>>();
  const shipperTotals = new Map<string, JobAccumulator>();

  const monthRecords = records.filter((r) => recordInMonth(r.date, yearMonth));

  for (const record of monthRecords) {
    const restraintPerTrip = tripRestraintMinutes(record);

    for (const trip of record.trips) {
      const shipper = normalizeKey(trip.shipperName, "（荷主未入力）");
      const job = normalizeKey(
        normalizeJobNameForAggregation(tripJobLabelForAggregation(trip)),
        "（業務未設定）",
      );
      const partnerFee = parsePartnerFee(trip.partnerFee);

      if (!shipperJobs.has(shipper)) shipperJobs.set(shipper, new Map());
      const jobMap = shipperJobs.get(shipper)!;
      if (!jobMap.has(job)) jobMap.set(job, emptyAcc());
      const ja = jobMap.get(job)!;
      ja.totalPartnerFee += partnerFee;

      if (!shipperTotals.has(shipper)) shipperTotals.set(shipper, emptyAcc());
      const st = shipperTotals.get(shipper)!;
      st.totalPartnerFee += partnerFee;

      const operationDayKey = tripOperationDayKey(record.date, job, trip);

      if (isPartnerTrip(trip)) {
        ja.operationDayKeys.add(operationDayKey);
        st.operationDayKeys.add(operationDayKey);
        continue;
      }

      const rev = parseRevenue(trip.revenue);
      const toll = parseTollFee(trip.tollFee);
      const lab = calculateTripLaborCost(trip, records, yearMonth, masters).total;

      ja.totalRevenue += rev;
      ja.totalToll += toll;
      ja.totalLabor += lab;
      ja.operationDayKeys.add(operationDayKey);
      ja.restraintMinutes += restraintPerTrip;

      st.totalRevenue += rev;
      st.totalToll += toll;
      st.totalLabor += lab;
      st.operationDayKeys.add(operationDayKey);
      st.restraintMinutes += restraintPerTrip;
    }
  }

  const rows: ShipperAnalysisRow[] = [];

  for (const [shipperName, jobMap] of shipperJobs) {
    const st = shipperTotals.get(shipperName)!;
    const allocatedFuel = fuelByShipper?.get(shipperName) ?? 0;
    const grossProfit =
      st.totalRevenue -
      st.totalToll -
      st.totalLabor -
      allocatedFuel -
      st.totalPartnerFee;

    const jobs = [...jobMap.entries()]
      .map(([jobName, acc]) => {
        const jobFuel =
          st.totalRevenue > 0
            ? Math.round(
                allocatedFuel * (acc.totalRevenue / st.totalRevenue),
              )
            : 0;
        return accToJobRow(jobName, acc, jobFuel);
      })
      .sort((a, b) => b.grossProfit - a.grossProfit);

    rows.push({
      shipperName,
      totalRevenue: st.totalRevenue,
      totalToll: st.totalToll,
      totalLabor: st.totalLabor,
      totalPartnerFee: st.totalPartnerFee,
      tripCount: st.operationDayKeys.size,
      restraintMinutes: st.restraintMinutes,
      allocatedFuel,
      grossProfit,
      laborShareRatio: laborShareRatio(st.totalLabor, st.totalRevenue),
      revenuePerHour: revenuePerHour(st.totalRevenue, st.restraintMinutes),
      jobs,
    });
  }

  return rows.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

// ---------------------------------------------------------------------------
// ③ ドライバー別生産性・労務
// ---------------------------------------------------------------------------

export type DriverAnalysisRow = {
  driverName: string;
  totalRevenue: number;
  totalKm: number;
  operatingDays: number;
  totalRestraintMinutes: number;
  totalLaborCost: number;
  laborShareRatio: number;
  /** 実車率: 走行km ÷ (拘束時間[h] × 基準速度35km/h)、最大1.0 */
  loadedRate: number;
  revenuePerHour: number;
  complianceStatus: ComplianceStatus;
  complianceLabel: string;
};

function driverOnTrip(trip: TripEntry, driverName: string): boolean {
  return driverOnTripCrew(trip, driverName);
}

function tripsForDriver(record: DailyRecord, driverName: string) {
  if (isPartnerRecord(record)) return [];
  const isPrimary = record.driverName.trim() === driverName;
  return record.trips.filter(
    (t) => !isPartnerTrip(t) && (isPrimary || driverOnTrip(t, driverName)),
  );
}

export function buildDriverAnalysis(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
): DriverAnalysisRow[] {
  const monthRecords = records.filter((r) => recordInMonth(r.date, yearMonth));
  const summaries = buildDriverMonthSummaries(records, yearMonth);
  const BENCHMARK_KMH = 35;

  return summaries.map((summary) => {
    let totalLaborCost = 0;

    for (const record of monthRecords) {
      const trips = tripsForDriver(record, summary.driverName);
      if (trips.length === 0) continue;
      for (const trip of trips) {
        totalLaborCost += calculateTripLaborCost(
          trip,
          records,
          yearMonth,
          masters,
        ).total;
      }
    }

    const compliance = restraintCompliance(summary.totalRestraintMinutes);
    const restraintHours = summary.totalRestraintMinutes / 60;
    const potentialKm = restraintHours * BENCHMARK_KMH;
    const loadedRate =
      potentialKm > 0 ? Math.min(1, summary.totalKm / potentialKm) : 0;

    return {
      driverName: summary.driverName,
      totalRevenue: summary.totalRevenue,
      totalKm: summary.totalKm,
      operatingDays: summary.operatingDays,
      totalRestraintMinutes: summary.totalRestraintMinutes,
      totalLaborCost,
      laborShareRatio: laborShareRatio(
        totalLaborCost,
        summary.totalRevenue,
      ),
      loadedRate,
      revenuePerHour: revenuePerHour(
        summary.totalRevenue,
        summary.totalRestraintMinutes,
      ),
      complianceStatus: compliance.status,
      complianceLabel: compliance.label,
    };
  });
}
