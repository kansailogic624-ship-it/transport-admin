/**
 * FileMaker API レコード → DailyRecord（Amazon実績プレビュー照合用）
 */

import type { ParsedFileMakerDispatch } from "./filemaker-dispatch-parser";
import type { FileMakerApiRecord } from "./filemaker-schedule-api";
import { buildDailyRecordFromFmDispatches } from "./fusion-import";
import { normalizeDriverName } from "./driving-report-parser";
import {
  normalizeIsoDate,
  parseIsoDateFromCell,
  parseTimecardTimeCell,
} from "./import-match-keys";
import { isAttendanceScheduleRow } from "./schedule-day-status";
import type { DailyRecord, MasterData } from "./types";

function normalizeFieldKey(key: string): string {
  return key
    .replace(/[\s\u3000]/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .toLowerCase();
}

const FIELD_ALIASES: Record<string, string[]> = {
  date: ["日付", "配車日", "運行日", "稼働日"],
  driver: ["運転手", "運転手名", "ドライバー", "ドライバー名", "乗務員"],
  vehicle: ["車両", "車両番号", "登録番号", "車番"],
  dispatch: ["配車名", "配車", "コース名", "業務名", "便名"],
  shipper: ["荷主", "荷主名", "得意先"],
  revenue: ["実売上", "売上", "売上金額", "運賃"],
  toll: ["高速代", "高速料金", "通行料"],
  timecardIn: ["出勤時間1", "出勤時間", "出勤"],
  timecardOut: ["退勤時間1", "退勤時間", "退勤"],
};

function pickFieldValue(
  fieldData: Record<string, unknown>,
  kind: keyof typeof FIELD_ALIASES,
): unknown {
  const aliases = FIELD_ALIASES[kind] ?? [];
  for (const [rawKey, value] of Object.entries(fieldData)) {
    const key = normalizeFieldKey(rawKey);
    for (const alias of aliases) {
      const normAlias = normalizeFieldKey(alias);
      if (key === normAlias || key.includes(normAlias)) {
        return value;
      }
    }
  }
  return undefined;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\u3000/g, " ").trim();
}

function parseDispatchFromApiRecord(
  record: FileMakerApiRecord,
): ParsedFileMakerDispatch | null {
  const fieldData = record.fieldData ?? {};
  const dateRaw = pickFieldValue(fieldData, "date");
  const date =
    parseIsoDateFromCell(dateRaw) ??
    (normalizeIsoDate(cellText(dateRaw)) || "");
  const driverName = normalizeDriverName(cellText(pickFieldValue(fieldData, "driver")));
  const dispatchName = cellText(pickFieldValue(fieldData, "dispatch"));
  const shipperName = cellText(pickFieldValue(fieldData, "shipper"));
  const vehicleNumber = cellText(pickFieldValue(fieldData, "vehicle"));
  const revenue = cellText(pickFieldValue(fieldData, "revenue"));
  const tollFee = cellText(pickFieldValue(fieldData, "toll"));
  const timecardIn = parseTimecardTimeCell(pickFieldValue(fieldData, "timecardIn"));
  const timecardOut = parseTimecardTimeCell(pickFieldValue(fieldData, "timecardOut"));

  if (!date || !driverName) return null;
  if (isAttendanceScheduleRow(shipperName, dispatchName)) {
    return null;
  }
  if (!dispatchName && !shipperName && !revenue) return null;

  return {
    sourceFileName: "FileMaker API",
    date,
    driverName,
    vehicleNumber,
    dispatchName,
    shipperName,
    revenue,
    tollFee,
    timecardIn: timecardIn || undefined,
    timecardOut: timecardOut || undefined,
    warnings: [],
  };
}

/** FM API レスポンスを DailyRecord 配列へ（GET データの照合用） */
export function dailyRecordsFromFileMakerApiRecords(
  apiRecords: FileMakerApiRecord[],
  masters: MasterData,
): DailyRecord[] {
  const dispatches: ParsedFileMakerDispatch[] = [];
  for (const record of apiRecords) {
    const parsed = parseDispatchFromApiRecord(record);
    if (parsed) dispatches.push(parsed);
  }

  const groups = new Map<string, ParsedFileMakerDispatch[]>();
  for (const d of dispatches) {
    const key = `${normalizeIsoDate(d.date)}|${normalizeDriverName(d.driverName)}`;
    const list = groups.get(key);
    if (list) list.push(d);
    else groups.set(key, [d]);
  }

  const records: DailyRecord[] = [];
  for (const group of groups.values()) {
    const daily = buildDailyRecordFromFmDispatches(group, [], masters);
    if (daily) records.push(daily);
  }
  return records;
}
