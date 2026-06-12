import { consolidateDailyRecordsByDriverDay } from "@/lib/record-consolidate";
import { normalizeRecord } from "@/lib/trip-normalize";
import {
  CUSTOM_MAPPING_RULES_KEY,
  DEFAULT_MASTERS,
  DRIVERS_KEY,
  IMPORT_HISTORY_KEY,
  MASTERS_KEY,
  STORAGE_KEY,
  type DailyRecord,
  type ImportHistory,
  type MappingRule,
  type MasterData,
} from "@/lib/types";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface StorageService {
  loadRecords(): DailyRecord[];
  saveRecords(records: DailyRecord[]): void;

  loadMasters(): MasterData;
  saveMasters(masters: MasterData): void;

  loadMappings(): MappingRule[];
  saveMappings(rules: MappingRule[]): void;

  loadImportHistory(): ImportHistory[];
  saveImportHistory(history: ImportHistory[]): void;
}

class LocalStorageStorageService implements StorageService {
  private getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(key);
  }

  private setItem(key: string, value: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, value);
  }

  loadRecords(): DailyRecord[] {
    if (typeof window === "undefined") return [];
    const records = safeParse<DailyRecord[]>(
      this.getItem(STORAGE_KEY),
      [],
    );
    const normalized = records.map((record) => normalizeRecord(record));
    return consolidateDailyRecordsByDriverDay(normalized);
  }

  saveRecords(records: DailyRecord[]): void {
    const consolidated = consolidateDailyRecordsByDriverDay(records);
    this.setItem(STORAGE_KEY, JSON.stringify(consolidated));
  }

  private migrateFromLegacyDrivers(): MasterData | null {
    const legacy = safeParse<string[] | null>(
      this.getItem(DRIVERS_KEY),
      null,
    );
    if (!legacy || legacy.length === 0) return null;
    return {
      ...DEFAULT_MASTERS,
      drivers: legacy,
    };
  }

  loadMasters(): MasterData {
    if (typeof window === "undefined") return DEFAULT_MASTERS;

    const stored = safeParse<MasterData | null>(
      this.getItem(MASTERS_KEY),
      null,
    );

    if (stored) {
      return {
        drivers:
          stored.drivers?.length > 0 ? stored.drivers : DEFAULT_MASTERS.drivers,
        partners: stored.partners ?? DEFAULT_MASTERS.partners,
        vehicles: stored.vehicles ?? [],
        shippers: stored.shippers ?? [],
        shipperJobs: stored.shipperJobs ?? {},
        employeeSalaries:
          stored.employeeSalaries ?? DEFAULT_MASTERS.employeeSalaries,
        defaultPartTimeDaily:
          stored.defaultPartTimeDaily ?? DEFAULT_MASTERS.defaultPartTimeDaily,
        defaultDispatchDaily:
          stored.defaultDispatchDaily ?? DEFAULT_MASTERS.defaultDispatchDaily,
        mappingRules: stored.mappingRules ?? DEFAULT_MASTERS.mappingRules,
        allocationExpenses:
          stored.allocationExpenses ?? DEFAULT_MASTERS.allocationExpenses,
      };
    }

    const migrated = this.migrateFromLegacyDrivers();
    return migrated ?? DEFAULT_MASTERS;
  }

  saveMasters(masters: MasterData): void {
    this.setItem(MASTERS_KEY, JSON.stringify(masters));
  }

  loadMappings(): MappingRule[] {
    if (typeof window === "undefined") return [];
    const data = safeParse<unknown>(this.getItem(CUSTOM_MAPPING_RULES_KEY), []);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (r): r is MappingRule =>
        !!r &&
        typeof r === "object" &&
        typeof (r as MappingRule).reportKeyword === "string" &&
        typeof (r as MappingRule).dispatchName === "string",
    );
  }

  saveMappings(rules: MappingRule[]): void {
    this.setItem(CUSTOM_MAPPING_RULES_KEY, JSON.stringify(rules));
  }

  loadImportHistory(): ImportHistory[] {
    if (typeof window === "undefined") return [];
    return safeParse<ImportHistory[]>(this.getItem(IMPORT_HISTORY_KEY), []);
  }

  saveImportHistory(history: ImportHistory[]): void {
    this.setItem(IMPORT_HISTORY_KEY, JSON.stringify(history));
  }
}

/** デフォルト実装（localStorage）。将来 SQLite / Supabase 等に差し替え可能 */
export const storageService: StorageService = new LocalStorageStorageService();
