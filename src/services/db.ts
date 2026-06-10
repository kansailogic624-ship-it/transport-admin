/**
 * IndexedDB スキーマ定義 (Dexie.js)
 *
 * - records: DailyRecord を 1 ドキュメント 1 行として格納
 * - settings: マスタデータ等のシングルトンを key/json ペアで格納
 */
import Dexie, { type Table } from "dexie";
import type { DailyRecord, VehicleExpenseRecord, VehicleMaintenanceBill } from "@/lib/types";

export type SettingsDoc = { key: string; json: string };

export class TransportAdminDb extends Dexie {
  records!: Table<DailyRecord, string>;
  settings!: Table<SettingsDoc, string>;
  maintenanceBills!: Table<VehicleMaintenanceBill, string>;
  vehicleExpenses!: Table<VehicleExpenseRecord, string>;

  constructor() {
    super("transport-admin-db");
    this.version(1).stores({
      records: "id, date, driverName",
      settings: "key",
    });
    // version 2 — 車両整備請求書テーブルを追加
    this.version(2).stores({
      records: "id, date, driverName",
      settings: "key",
      maintenanceBills: "id, vendorName, billingMonth, issueDate",
    });
    // version 3 — 車両別経費明細テーブルを追加（vehicleExpenses）
    //            maintenanceBills に billType インデックスを追加
    this.version(3).stores({
      records: "id, date, driverName",
      settings: "key",
      maintenanceBills: "id, vendorName, billingMonth, billType, issueDate",
      vehicleExpenses:
        "id, billingMonth, vendorName, billType, vehicleNumber, parentBillId",
    });
  }
}

export const db = new TransportAdminDb();
