import { resolveVehicleMasterLabel } from "./import-match-keys";
import {
  aggregateDriverMonthKm,
  aggregateVehicleDayKmForMonth,
  normalizeKey,
  parsePartnerFee,
  parseRevenue,
  parseTollFee,
  recordInMonth,
} from "./trip-utils";
import { calculateTripLaborCost } from "./labor-cost";
import { isPartnerTrip } from "./run-type";
import type { DailyRecord, MasterData } from "./types";

export type DriverMonthlyRow = {
  driverName: string;
  totalRevenue: number;
  totalKm: number;
  operatingDays: number;
};

export type VehicleMonthlyRow = {
  vehicleNumber: string;
  totalRevenue: number;
  totalKm: number;
  operatingDays: number;
};

export type ShipperMonthlyRow = {
  shipperName: string;
  totalRevenue: number;
  totalToll: number;
  totalLabor: number;
  totalPartnerFee: number;
  tripCount: number;
};

export type PartnerMonthlyRow = {
  partnerName: string;
  totalRevenue: number;
  totalPartnerFee: number;
  grossProfit: number;
  tripCount: number;
};

export type ShipperProfitRow = ShipperMonthlyRow & {
  revenueRatio: number;
  allocatedExpense: number;
  /** 総売上 − 総高速代 − 人件費 − 按分経費 */
  netGrossProfit: number;
};

export type VehicleAllocationRow = VehicleMonthlyRow & {
  allocationRatio: number;
  allocatedExpense: number;
  grossProfit: number;
};

/** 車両別収益分析（修繕コスト・按分経費込み） */
export type VehicleProfitRow = VehicleMonthlyRow & {
  /** 整備費・部品代・諸費用の合計（修繕コスト） */
  maintenanceCost: number;
  /** ガソリン代等の月次按分経費 */
  allocatedExpense: number;
  /** 修繕 + 按分（車両直接経費） */
  directCosts: number;
  /** 総売上 − 車両直接経費 */
  netProfit: number;
};

export type MonthlySummary = {
  yearMonth: string;
  recordCount: number;
  drivers: DriverMonthlyRow[];
  vehicles: VehicleMonthlyRow[];
  shippers: ShipperMonthlyRow[];
  partners: PartnerMonthlyRow[];
  totalRevenue: number;
  totalKm: number;
};

function recordsForMonth(
  records: DailyRecord[],
  yearMonth: string,
): DailyRecord[] {
  return records.filter((r) => recordInMonth(r.date, yearMonth));
}

export function buildMonthlySummary(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
): MonthlySummary {
  const monthRecords = recordsForMonth(records, yearMonth);

  const { vehicleMonthKm, vehicleDays, totalKm } = aggregateVehicleDayKmForMonth(
    records,
    yearMonth,
    masters.vehicles,
  );

  const driverRevenue = new Map<string, number>();
  const driverDays = new Map<string, Set<string>>();
  const vehicleRevenue = new Map<string, number>();
  const shipperRevenue = new Map<string, number>();
  const shipperToll = new Map<string, number>();
  const shipperLabor = new Map<string, number>();
  const shipperPartnerFee = new Map<string, number>();
  const shipperTrips = new Map<string, number>();
  const partnerRevenue = new Map<string, number>();
  const partnerFee = new Map<string, number>();
  const partnerTrips = new Map<string, number>();

  let totalRevenue = 0;

  for (const record of monthRecords) {
    const isPartnerDay = record.operationType === "partner";
    const driver = isPartnerDay
      ? "（傭車）"
      : record.driverName.trim() || "（ドライバー未設定）";

    if (!isPartnerDay) {
      if (!driverDays.has(driver)) driverDays.set(driver, new Set());
      driverDays.get(driver)!.add(record.date);
    }

    for (const trip of record.trips) {
      const revenue = parseRevenue(trip.revenue);
      totalRevenue += revenue;

      const vehicle = resolveVehicleMasterLabel(
        trip.vehicleNumber,
        masters.vehicles,
      );
      const shipper = normalizeKey(trip.shipperName, "（荷主未入力）");

      if (!isPartnerTrip(trip)) {
        driverRevenue.set(driver, (driverRevenue.get(driver) ?? 0) + revenue);
      }

      vehicleRevenue.set(
        vehicle,
        (vehicleRevenue.get(vehicle) ?? 0) + revenue,
      );

      const toll = parseTollFee(trip.tollFee);
      const pFee = parsePartnerFee(trip.partnerFee);

      shipperRevenue.set(
        shipper,
        (shipperRevenue.get(shipper) ?? 0) + revenue,
      );
      shipperToll.set(shipper, (shipperToll.get(shipper) ?? 0) + toll);
      shipperTrips.set(shipper, (shipperTrips.get(shipper) ?? 0) + 1);
      shipperPartnerFee.set(
        shipper,
        (shipperPartnerFee.get(shipper) ?? 0) + pFee,
      );

      const labor = isPartnerTrip(trip)
        ? 0
        : calculateTripLaborCost(trip, records, yearMonth, masters).total;
      shipperLabor.set(shipper, (shipperLabor.get(shipper) ?? 0) + labor);

      if (isPartnerTrip(trip)) {
        const partner = normalizeKey(trip.partnerName, "（協力会社未入力）");
        partnerRevenue.set(
          partner,
          (partnerRevenue.get(partner) ?? 0) + revenue,
        );
        partnerFee.set(partner, (partnerFee.get(partner) ?? 0) + pFee);
        partnerTrips.set(partner, (partnerTrips.get(partner) ?? 0) + 1);
      }
    }
  }

  const driverMonthKm = aggregateDriverMonthKm(records, yearMonth);

  const drivers: DriverMonthlyRow[] = [...driverRevenue.entries()]
    .map(([driverName, rev]) => ({
      driverName,
      totalRevenue: rev,
      totalKm: driverMonthKm.get(driverName) ?? 0,
      operatingDays: driverDays.get(driverName)?.size ?? 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const vehicles: VehicleMonthlyRow[] = [...vehicleRevenue.entries()]
    .map(([vehicleNumber, rev]) => ({
      vehicleNumber,
      totalRevenue: rev,
      totalKm: vehicleMonthKm.get(vehicleNumber) ?? 0,
      operatingDays: vehicleDays.get(vehicleNumber)?.size ?? 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const shippers: ShipperMonthlyRow[] = [...shipperRevenue.entries()]
    .map(([shipperName, rev]) => ({
      shipperName,
      totalRevenue: rev,
      totalToll: shipperToll.get(shipperName) ?? 0,
      totalLabor: shipperLabor.get(shipperName) ?? 0,
      totalPartnerFee: shipperPartnerFee.get(shipperName) ?? 0,
      tripCount: shipperTrips.get(shipperName) ?? 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const partners: PartnerMonthlyRow[] = [...partnerRevenue.entries()]
    .map(([partnerName, rev]) => {
      const fee = partnerFee.get(partnerName) ?? 0;
      return {
        partnerName,
        totalRevenue: rev,
        totalPartnerFee: fee,
        grossProfit: rev - fee,
        tripCount: partnerTrips.get(partnerName) ?? 0,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  return {
    yearMonth,
    recordCount: monthRecords.length,
    drivers,
    vehicles,
    shippers,
    partners,
    totalRevenue,
    totalKm,
  };
}

/** 重み（稼働台数など）に応じて月次共通経費を按分 */
export function allocateExpenseByWeights(
  weights: number[],
  totalExpense: number,
): { ratios: number[]; allocated: number[] } {
  const count = weights.length;
  if (count === 0) return { ratios: [], allocated: [] };

  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const ratios =
    totalWeight === 0
      ? weights.map(() => 1 / count)
      : weights.map((w) => w / totalWeight);

  const allocated = ratios.map((r) => Math.floor(totalExpense * r));
  let remainder = totalExpense - allocated.reduce((a, b) => a + b, 0);

  const fractionOrder = ratios
    .map((r, i) => ({ i, frac: totalExpense * r - allocated[i] }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < remainder; k++) {
    allocated[fractionOrder[k % fractionOrder.length].i] += 1;
  }

  return { ratios, allocated };
}

/**
 * 車両別の純利益を算出。
 * netProfit = 総売上 − 修繕コスト − 按分経費（燃料代等）
 */
export function buildVehicleProfitRows(
  vehicles: VehicleMonthlyRow[],
  maintenanceByVehicle: Map<string, number>,
  allocation: VehicleAllocationRow[] | null,
): VehicleProfitRow[] {
  const allocMap = new Map(
    allocation?.map((a) => [a.vehicleNumber, a.allocatedExpense]) ?? [],
  );

  return vehicles.map((v) => {
    const maintenanceCost = maintenanceByVehicle.get(v.vehicleNumber) ?? 0;
    const allocatedExpense = allocMap.get(v.vehicleNumber) ?? 0;
    const directCosts = maintenanceCost + allocatedExpense;
    const netProfit = v.totalRevenue - directCosts;
    return {
      ...v,
      maintenanceCost,
      allocatedExpense,
      directCosts,
      netProfit,
    };
  });
}

export function allocateExpenseByVehicleDays(
  vehicles: VehicleMonthlyRow[],
  totalExpense: number,
): VehicleAllocationRow[] {
  if (vehicles.length === 0 || totalExpense <= 0) {
    return vehicles.map((v) => ({
      ...v,
      allocationRatio: 0,
      allocatedExpense: 0,
      grossProfit: v.totalRevenue,
    }));
  }

  const { ratios, allocated } = allocateExpenseByWeights(
    vehicles.map((v) => v.operatingDays),
    totalExpense,
  );

  return vehicles.map((v, i) => ({
    ...v,
    allocationRatio: ratios[i],
    allocatedExpense: allocated[i],
    grossProfit: v.totalRevenue - allocated[i],
  }));
}

/** 按分結果に修繕コストを反映した純利益版 */
export function enrichAllocationWithMaintenance(
  allocation: VehicleAllocationRow[],
  maintenanceByVehicle: Map<string, number>,
): VehicleAllocationRow[] {
  return allocation.map((row) => {
    const maintenance = maintenanceByVehicle.get(row.vehicleNumber) ?? 0;
    return {
      ...row,
      grossProfit: row.totalRevenue - row.allocatedExpense - maintenance,
    };
  });
}

export function allocateShipperNetProfit(
  shippers: ShipperMonthlyRow[],
  totalExpense: number,
): ShipperProfitRow[] {
  if (shippers.length === 0) {
    return [];
  }

  if (totalExpense <= 0) {
    return shippers.map((s) => ({
      ...s,
      revenueRatio: 0,
      allocatedExpense: 0,
      netGrossProfit:
        s.totalRevenue - s.totalToll - s.totalLabor - s.totalPartnerFee,
    }));
  }

  const { ratios, allocated } = allocateExpenseByWeights(
    shippers.map((s) => s.totalRevenue),
    totalExpense,
  );

  return shippers.map((s, i) => ({
    ...s,
    revenueRatio: ratios[i],
    allocatedExpense: allocated[i],
    netGrossProfit:
      s.totalRevenue -
      s.totalToll -
      s.totalLabor -
      s.totalPartnerFee -
      allocated[i],
  }));
}
