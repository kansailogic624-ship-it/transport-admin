/**
 * IndexedDB レガシー移行（localStorage → Dexie）
 *
 * Firestore 移行後も、旧 localStorage データの取り込みにのみ使用します。
 * データの読み書きは @/services/firestore-storage を使用してください。
 */
import { consolidateDailyRecordsByDriverDay } from "@/lib/record-consolidate";
import { normalizeRecord } from "@/lib/trip-normalize";
import {
  MASTERS_KEY,
  STORAGE_KEY,
  type DailyRecord,
} from "@/lib/types";
import { db } from "./db";

const LS_FLAG_RECORDS = "idb_migrated_records_v1";
const LS_FLAG_MASTERS = "idb_migrated_masters_v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** localStorage に旧データがあれば IndexedDB へコピー（Firestore 移行前の中間ステップ） */
export async function migrateFromLocalStorageIfNeeded(): Promise<void> {
  if (typeof window === "undefined") return;

  if (!localStorage.getItem(LS_FLAG_RECORDS)) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = safeParse<DailyRecord[]>(raw, []);
      const normalized = parsed.map(normalizeRecord);
      const consolidated = consolidateDailyRecordsByDriverDay(normalized);
      if (consolidated.length > 0) {
        await db.records.bulkPut(consolidated);
        console.info(
          `[IDB] ${consolidated.length} 件のレコードを localStorage から移行しました`,
        );
      }
    }
    localStorage.setItem(LS_FLAG_RECORDS, "1");
  }

  if (!localStorage.getItem(LS_FLAG_MASTERS)) {
    const raw = localStorage.getItem(MASTERS_KEY);
    if (raw) {
      await db.settings.put({ key: "masters", json: raw });
      console.info("[IDB] マスタデータを localStorage から移行しました");
    }
    localStorage.setItem(LS_FLAG_MASTERS, "1");
  }
}
