import { saveMasters, saveRecords } from "@/lib/db";
import { normalizeRecord } from "./trip-normalize";
import type { DailyRecord, MasterData, SystemBackup } from "./types";
import { DEFAULT_MASTERS } from "./types";

function isMasterData(value: unknown): value is MasterData {
  if (!value || typeof value !== "object") return false;
  const m = value as MasterData;
  return (
    Array.isArray(m.drivers) &&
    Array.isArray(m.vehicles) &&
    Array.isArray(m.shippers) &&
    typeof m.shipperJobs === "object"
  );
}

function isDailyRecord(value: unknown): value is DailyRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as DailyRecord;
  return (
    typeof r.id === "string" &&
    typeof r.date === "string" &&
    Array.isArray(r.trips)
  );
}

export function createBackupPayload(
  records: DailyRecord[],
  masters: MasterData,
): SystemBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
    masters,
  };
}

export function downloadBackupJson(records: DailyRecord[], masters: MasterData): void {
  const payload = createBackupPayload(records, masters);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const hhmm = now.toTimeString().slice(0, 5).replace(":", "");
  const a = document.createElement("a");
  a.href = url;
  a.download = `transport-admin-backup_${date}_${hhmm}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackupFile(raw: string): SystemBackup {
  const parsed: unknown = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("JSONの形式が正しくありません。");
  }

  const data = parsed as Partial<SystemBackup>;

  if (!Array.isArray(data.records) || !data.records.every(isDailyRecord)) {
    throw new Error("records（日次データ）が見つからないか、形式が不正です。");
  }

  if (!isMasterData(data.masters)) {
    throw new Error("masters（マスタデータ）が見つからないか、形式が不正です。");
  }

  const records = data.records.map((record) => normalizeRecord(record));

  const masters: MasterData = {
    drivers:
      data.masters.drivers.length > 0
        ? data.masters.drivers
        : DEFAULT_MASTERS.drivers,
    partners: data.masters.partners ?? DEFAULT_MASTERS.partners,
    vehicles: data.masters.vehicles ?? [],
    shippers: data.masters.shippers ?? [],
    shipperJobs: data.masters.shipperJobs ?? {},
    employeeSalaries:
      data.masters.employeeSalaries ?? DEFAULT_MASTERS.employeeSalaries,
    defaultPartTimeDaily:
      data.masters.defaultPartTimeDaily ??
      DEFAULT_MASTERS.defaultPartTimeDaily,
    defaultDispatchDaily:
      data.masters.defaultDispatchDaily ??
      DEFAULT_MASTERS.defaultDispatchDaily,
    mappingRules: data.masters.mappingRules ?? DEFAULT_MASTERS.mappingRules,
    allocationExpenses:
      data.masters.allocationExpenses ?? DEFAULT_MASTERS.allocationExpenses,
  };

  return {
    version: 1,
    exportedAt: data.exportedAt ?? new Date().toISOString(),
    records,
    masters,
  };
}

/**
 * バックアップデータを Firestore に書き込む（非同期）。
 * AppShell の onRestore コールバックと組み合わせて使う。
 */
export async function applyBackupToStorageAsync(backup: SystemBackup): Promise<void> {
  await Promise.all([
    saveRecords(backup.records),
    saveMasters(backup.masters),
  ]);
}

/** @deprecated applyBackupToStorageAsync を使用してください */
export function applyBackupToStorage(backup: SystemBackup): void {
  applyBackupToStorageAsync(backup).catch(console.error);
}
