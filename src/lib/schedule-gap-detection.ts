import { normalizeDriverName } from "./driving-report-parser";
import { recordInMonth } from "./trip-utils";
import { isPartnerRecord } from "./run-type";
import type { DailyRecord } from "./types";

export const SCHEDULE_MISSING_MESSAGE =
  "⚠️ スケジュール未入力（元データを確認してください）";

export const SCHEDULE_MISSING_STATUS = "未入力警告" as const;

/** startDate〜endDate（両端含む）の ISO 日付配列 */
export function enumerateIsoDates(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];

  const dates: string[] = [];
  const cur = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);

  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return dates;
}

/** 月内でドライバーにレコードが存在する日付一覧（昇順・重複なし） */
export function driverRecordDatesInMonth(
  records: DailyRecord[],
  yearMonth: string,
  driverName: string,
): string[] {
  const norm = normalizeDriverName(driverName);
  const dates = new Set<string>();

  for (const record of records) {
    if (!recordInMonth(record.date, yearMonth)) continue;
    if (isPartnerRecord(record)) continue;
    if (normalizeDriverName(record.driverName) !== norm) continue;
    dates.add(record.date);
  }

  return [...dates].sort();
}

/** 月内でスケジュールデータがあるドライバー名一覧 */
export function driversWithScheduleDataInMonth(
  records: DailyRecord[],
  yearMonth: string,
): string[] {
  const names = new Set<string>();

  for (const record of records) {
    if (!recordInMonth(record.date, yearMonth)) continue;
    if (isPartnerRecord(record)) continue;
    const name = record.driverName.trim();
    if (name) names.add(name);
  }

  return [...names].sort((a, b) => a.localeCompare(b, "ja"));
}

/**
 * ドライバーの月内 min〜max 期間で、元データにレコードが無い欠落日を返す。
 * レコードが1日のみの場合は欠落日なし。
 */
export function missingScheduleDatesForDriver(
  records: DailyRecord[],
  yearMonth: string,
  driverName: string,
): string[] {
  const existing = driverRecordDatesInMonth(records, yearMonth, driverName);
  if (existing.length < 2) return [];

  const min = existing[0]!;
  const max = existing[existing.length - 1]!;
  const existingSet = new Set(existing);

  return enumerateIsoDates(min, max).filter((date) => !existingSet.has(date));
}

/** 指定日がドライバーの欠落日か */
export function isMissingScheduleDateForDriver(
  records: DailyRecord[],
  date: string,
  driverName: string,
): boolean {
  const yearMonth = date.slice(0, 7);
  return missingScheduleDatesForDriver(records, yearMonth, driverName).includes(
    date,
  );
}
