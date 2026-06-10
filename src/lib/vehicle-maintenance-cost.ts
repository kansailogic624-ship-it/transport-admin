import { safeNumber } from "./currency-format";
import { normalizeVehicleNumber, vehiclesMatch } from "./import-match-keys";
import type { BillType, VehicleExpenseRecord } from "./types";

const MAINTENANCE_BILL_TYPES: BillType[] = [
  "整備費",
  "部品代",
  "一括",
  "その他",
];

/** 車番比較用キー（import-match-keys と同一ロジック） */
export function vehiclePlateKey(plate: string): string {
  return normalizeVehicleNumber(plate);
}

/**
 * 整備明細の車番を、運行実績側の車両キーに紐づける。
 * 完全一致 → 部分一致（末尾一致）の順で照合。
 */
export function matchExpensePlateToVehicle(
  expensePlate: string,
  vehicleKeys: string[],
): string | null {
  const expKey = vehiclePlateKey(expensePlate);
  if (!expKey) return null;

  for (const v of vehicleKeys) {
    if (vehiclesMatch(v, expensePlate)) return v;
  }

  for (const v of vehicleKeys) {
    const vk = vehiclePlateKey(v);
    if (vk.length >= 3 && (expKey.endsWith(vk) || expKey.includes(vk))) {
      return v;
    }
    if (expKey.length >= 3 && (vk.endsWith(expKey) || vk.includes(expKey))) {
      return v;
    }
  }

  return null;
}

/** 1件の整備明細から修繕コスト（円）を算出 */
export function maintenanceLineCost(exp: VehicleExpenseRecord): number {
  const total = safeNumber(exp.totalAmount);
  if (total > 0) return total;
  return (
    safeNumber(exp.laborFee) +
    safeNumber(exp.partsFee) +
    safeNumber(exp.commonExpense)
  );
}

/**
 * 指定月の車両別修繕コスト（整備費・部品代・諸費用）を集計。
 * キーは運行実績の vehicleNumber。マッチしない明細はその車番をキーに加算。
 */
export function aggregateMaintenanceByVehicle(
  expenses: VehicleExpenseRecord[],
  yearMonth: string,
  vehicleKeys: string[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const v of vehicleKeys) result.set(v, 0);

  const monthRows = expenses.filter(
    (e) =>
      e.billingMonth === yearMonth &&
      MAINTENANCE_BILL_TYPES.includes(e.billType),
  );

  for (const exp of monthRows) {
    const cost = maintenanceLineCost(exp);
    if (cost <= 0) continue;

    const matched = matchExpensePlateToVehicle(exp.vehicleNumber, vehicleKeys);
    const key = matched ?? exp.vehicleNumber.trim();
    if (!key) continue;

    result.set(key, (result.get(key) ?? 0) + cost);
  }

  return result;
}

/** 指定月の修繕コスト合計 */
export function totalMaintenanceForMonth(
  expenses: VehicleExpenseRecord[],
  yearMonth: string,
): number {
  return expenses
    .filter(
      (e) =>
        e.billingMonth === yearMonth &&
        MAINTENANCE_BILL_TYPES.includes(e.billType),
    )
    .reduce((s, e) => s + maintenanceLineCost(e), 0);
}

function aggregateExpenseByBillType(
  expenses: VehicleExpenseRecord[],
  yearMonth: string,
  vehicleKeys: string[],
  billType: BillType,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const v of vehicleKeys) result.set(v, 0);

  const monthRows = expenses.filter(
    (e) => e.billingMonth === yearMonth && e.billType === billType,
  );

  for (const exp of monthRows) {
    const cost = maintenanceLineCost(exp);
    if (cost <= 0) continue;
    const matched = matchExpensePlateToVehicle(exp.vehicleNumber, vehicleKeys);
    const key = matched ?? exp.vehicleNumber.trim();
    if (!key) continue;
    result.set(key, (result.get(key) ?? 0) + cost);
  }

  return result;
}

/** 指定月の車両別燃料代（加島様等） */
export function aggregateFuelByVehicle(
  expenses: VehicleExpenseRecord[],
  yearMonth: string,
  vehicleKeys: string[],
): Map<string, number> {
  return aggregateExpenseByBillType(
    expenses,
    yearMonth,
    vehicleKeys,
    "燃料代",
  );
}

/** 指定月の車両別高速代（KJS / コーポ明細） */
export function aggregateTollByVehicle(
  expenses: VehicleExpenseRecord[],
  yearMonth: string,
  vehicleKeys: string[],
): Map<string, number> {
  return aggregateExpenseByBillType(
    expenses,
    yearMonth,
    vehicleKeys,
    "高速代",
  );
}

export function totalFuelForMonth(
  expenses: VehicleExpenseRecord[],
  yearMonth: string,
): number {
  return expenses
    .filter((e) => e.billingMonth === yearMonth && e.billType === "燃料代")
    .reduce((s, e) => s + maintenanceLineCost(e), 0);
}

export function totalTollExpenseForMonth(
  expenses: VehicleExpenseRecord[],
  yearMonth: string,
): number {
  return expenses
    .filter((e) => e.billingMonth === yearMonth && e.billType === "高速代")
    .reduce((s, e) => s + maintenanceLineCost(e), 0);
}
