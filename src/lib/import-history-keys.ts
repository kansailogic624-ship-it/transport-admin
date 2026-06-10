import { driverDayKey, recordDayKey } from "./record-consolidate";
import type { DailyRecord } from "./types";

/** 取込で触れたドライバー×日のキーから、統合後レコードIDを収集 */
export function recordIdsForTouchedDayKeys(
  records: DailyRecord[],
  touchedDayKeys: Set<string>,
): string[] {
  if (touchedDayKeys.size === 0) return [];
  return records
    .filter((r) => touchedDayKeys.has(recordDayKey(r)))
    .map((r) => r.id);
}

export function touchRecordDay(
  touchedDayKeys: Set<string>,
  date: string,
  driverName: string,
): void {
  if (!date.trim() || !driverName.trim()) return;
  touchedDayKeys.add(driverDayKey(date, driverName));
}
