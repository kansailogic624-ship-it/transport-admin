import {
  displayVehicleNumber,
  isSameVehicle,
  vehiclesMatch,
} from "./import-match-keys";
import type { DailyRecord, VehicleExpenseRecord } from "./types";
import { findMatchingVehicleInList, vehicleExistsInList } from "./vehicle-master-utils";

export type VehicleMasterEditPlan = {
  mode: "rename" | "merge";
  vehicles: string[];
  /** 履歴を引き継ぐ元の表記 */
  mergeFrom: string;
  /** 統合先の正規表記 */
  mergeTo: string;
};

export function sanitizeVehicleInput(raw: string): string {
  return displayVehicleNumber(raw) || raw.trim();
}

/** 保存前の車両マスタ更新計画（マージ or リネーム） */
export function planVehicleMasterEdit(
  vehicles: string[],
  oldVehicle: string,
  rawNewVehicle: string,
): VehicleMasterEditPlan | null {
  const cleaned = sanitizeVehicleInput(rawNewVehicle);
  if (!cleaned) return null;
  if (oldVehicle === cleaned) return null;

  const canonical = findMatchingVehicleInList(vehicles, cleaned, oldVehicle);
  if (canonical) {
    return {
      mode: "merge",
      vehicles: vehicles.filter((v) => v !== oldVehicle),
      mergeFrom: oldVehicle,
      mergeTo: canonical,
    };
  }

  const others = vehicles.filter((v) => v !== oldVehicle);
  if (vehicleExistsInList(others, cleaned)) return null;

  return {
    mode: "rename",
    vehicles: vehicles.map((v) => (v === oldVehicle ? cleaned : v)),
    mergeFrom: oldVehicle,
    mergeTo: cleaned,
  };
}

export function vehiclePlateMatches(stored: string, pattern: string): boolean {
  const s = stored.trim();
  const p = pattern.trim();
  if (!s || !p) return false;
  if (s === p) return true;
  return isSameVehicle(s, p) || vehiclesMatch(s, p);
}

/** 日次実績の trip.vehicleNumber を一括置換 */
export function rewriteVehicleNumberInRecords(
  records: DailyRecord[],
  fromVehicle: string,
  toVehicle: string,
): { records: DailyRecord[]; updatedTripCount: number; updatedRecordCount: number } {
  let updatedTripCount = 0;
  let updatedRecordCount = 0;

  const next = records.map((record) => {
    let recordChanged = false;
    const trips = record.trips.map((trip) => {
      if (!vehiclePlateMatches(trip.vehicleNumber, fromVehicle)) return trip;
      recordChanged = true;
      updatedTripCount += 1;
      return { ...trip, vehicleNumber: toVehicle };
    });
    if (!recordChanged) return record;
    updatedRecordCount += 1;
    return { ...record, trips };
  });

  return { records: next, updatedTripCount, updatedRecordCount };
}

/** 車両経費明細の vehicleNumber を一括置換 */
export function rewriteVehicleNumberInExpenses(
  expenses: VehicleExpenseRecord[],
  fromVehicle: string,
  toVehicle: string,
): { expenses: VehicleExpenseRecord[]; updatedCount: number } {
  let updatedCount = 0;
  const next = expenses.map((exp) => {
    if (!vehiclePlateMatches(exp.vehicleNumber, fromVehicle)) return exp;
    updatedCount += 1;
    return { ...exp, vehicleNumber: toVehicle };
  });
  return { expenses: next, updatedCount };
}
