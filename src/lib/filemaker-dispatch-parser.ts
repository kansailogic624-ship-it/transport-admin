import {
  fusionMatchKey,
  parseIsoDateFromCell,
  parseIsoDateFromFileName,
  parseTimecardTimeCell,
} from "./import-match-keys";
import { normalizeDriverName } from "./driving-report-parser";
import {
  detectDayStatusFromText,
  isAttendanceScheduleRow,
  type DayStatus,
} from "./schedule-day-status";
import type { SheetMatrix } from "./driving-report-parser";

export type ParsedFileMakerDispatch = {
  sourceFileName: string;
  date: string;
  driverName: string;
  vehicleNumber: string;
  /** 配車名 → アプリの jobName */
  dispatchName: string;
  shipperName: string;
  revenue: string;
  tollFee: string;
  /** タイムカードの出勤時刻（HH:MM）。スケジュール列から取得 */
  timecardIn?: string;
  /** タイムカードの退勤時刻（HH:MM）。スケジュール列から取得 */
  timecardOut?: string;
  /** 勤怠・休日行（売上ではなく dayStatus として融合取込） */
  isAttendanceRow?: boolean;
  dayStatus?: DayStatus;
  /** 日時売上【スケジュール】::備考【個人】 */
  personalRemarks?: string;
  /** 備考の (ﾊﾞ) 表記から抽出した助手の苗字 */
  assistantFromRemarks?: string;
  /** 車両なし行との合体で判明した助手（運転手名） */
  assistantDriverName?: string;
  warnings: string[];
};

/** FileMaker 配車表 CSV（20260530.csv 形式）の列 */
const SCHEDULE_COL_BASE = {
  revenue: 0,
  shipper: 1,
  dispatch: 2,
  vehicle: 3,
  driver: 4,
  date: 5,
} as const;

const SCHEDULE_COL = SCHEDULE_COL_BASE;

const HEADER_MAP: Record<string, string[]> = {
  date: [
    "日付",
    "配車日",
    "運行日",
    "稼働日",
    "date",
    "スケジュール】::日付",
    "::日付",
  ],
  driver: [
    "運転手",
    "運転手名",
    "ドライバー",
    "ドライバー名",
    "乗務員",
    "乗務員名",
    "社員名",
    "社員",
    "社員M::社員名",
  ],
  vehicle: [
    "車両",
    "車両番号",
    "登録番号",
    "車番",
    "ナンバー",
    "車両M::車両番号",
  ],
  dispatch: [
    "配車名",
    "配車",
    "コース名",
    "コース",
    "便名",
    "ルート名",
    "業務名",
    "配送名",
    "業務M::業務名",
  ],
  shipper: ["荷主", "荷主名", "得意先", "荷主様", "荷主M::荷主名"],
  revenue: ["実売上", "売上", "売上金額", "運賃", "金額", "請求額"],
  toll: ["高速代", "高速料金", "通行料"],
  timecardIn: [
    "出勤時間1",
    "出勤時間",
    "スケジュール】::出勤時間1",
    "スケジュール】::出勤",
    "::出勤時間",
    "::出勤",
    "出勤",
  ],
  timecardOut: [
    "退勤時間1",
    "退勤時間",
    "スケジュール】::退勤時間1",
    "スケジュール】::退勤",
    "::退勤時間",
    "::退勤",
    "退勤",
  ],
  remarks: [
    "備考【個人】",
    "備考（個人）",
    "スケジュール】::備考【個人】",
    "日時売上【スケジュール】::備考【個人】",
    "::備考【個人】",
    "備考",
  ],
};

type ScheduleColMap = typeof SCHEDULE_COL_BASE & { remarks: number };

function resolveScheduleColumns(headerRow: unknown[] | null): ScheduleColMap {
  const base = { ...SCHEDULE_COL_BASE, remarks: -1 };
  if (!headerRow) return base;
  const remarksIdx = columnIndex(headerRow, HEADER_MAP["remarks"] ?? []);
  if (remarksIdx != null && remarksIdx >= 0) {
    return { ...base, remarks: remarksIdx };
  }
  return base;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\u3000/g, " ").trim();
}

/** 半角カナを読みやすい表記に（①②などの丸数字はそのまま） */
export function normalizeDispatchName(raw: string): string {
  return raw
    .replace(/ﾛﾝｸﾞ/g, "ロング")
    .replace(/ｶﾞ/g, "ガ")
    .replace(/ｷﾞ/g, "ギ")
    .replace(/ﾌﾞ/g, "ブ")
    .replace(/ﾚｰﾄﾞ/g, "レート")
    .replace(/ﾈｸｽﾄ/g, "ネクスト")
    .trim();
}

function isHeaderLabelRow(row: unknown[]): boolean {
  const joined = row.map(cellText).join(",");
  return (
    (/日付|配車日/.test(joined) &&
      /荷主|業務名|社員|運転手|ドライバー/.test(joined)) ||
    /実売上.*業務名|業務名.*車両番号/.test(joined.replace(/\s/g, ""))
  );
}

function findHeaderRowIndex(rows: SheetMatrix): number | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] ?? [];
    if (isHeaderLabelRow(row)) return i;
    const joined = row.map(cellText).join(",");
    if (
      /日付|配車日|運転手|ドライバー|配車名|車両|業務名|社員/.test(joined) &&
      row.filter((c) => cellText(c)).length >= 3
    ) {
      return i;
    }
  }
  return null;
}

function isScheduleMatrixFormat(rows: SheetMatrix): boolean {
  let hits = 0;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i] ?? [];
    const dateCell = row[SCHEDULE_COL.date];
    const driver = cellText(row[SCHEDULE_COL.driver]);
    const dispatch = cellText(row[SCHEDULE_COL.dispatch]);
    if (
      (typeof dateCell === "number" || parseIsoDateFromCell(dateCell)) &&
      driver.length >= 2 &&
      dispatch &&
      !dispatch.includes("休")
    ) {
      hits += 1;
    }
  }
  return hits >= 3;
}

/** 合計・小計などの集計行ラベルか判定 */
function isAggregateLine(text: string): boolean {
  return /^(合計|小計|合算|計|total|subtotal)$/i.test(
    text.replace(/[\s\u3000（）()]/g, ""),
  );
}

/** 配車名が「なし」を意味するダッシュ・記号のみかどうか */
function isDashPlaceholder(text: string): boolean {
  // 全角ダッシュ・半角ハイフン・長音符・×などの記号のみで構成される短い文字列はプレースホルダー扱い
  return /^[\-–—−ーーー×＊\s]{1,3}$/.test(text.trim());
}

function shouldSkipScheduleRow(dispatch: string, shipper: string): boolean {
  if (isAttendanceScheduleRow(shipper, dispatch)) return false;
  if (!dispatch) return true;
  // 「ー」「－」「—」などダッシュのみのプレースホルダーはスキップ
  if (isDashPlaceholder(dispatch)) return true;
  // FileMaker が出力する集計行（合計・小計など）はスキップ
  if (isAggregateLine(dispatch)) return true;
  return false;
}

function attendanceFields(
  shipperName: string,
  dispatchName: string,
): Pick<ParsedFileMakerDispatch, "isAttendanceRow" | "dayStatus"> {
  if (!isAttendanceScheduleRow(shipperName, dispatchName)) {
    return {};
  }
  return {
    isAttendanceRow: true,
    dayStatus: detectDayStatusFromText(dispatchName, shipperName) ?? "公休",
  };
}

function parseRevenueCell(value: unknown): string {
  if (typeof value === "number" && value > 0) {
    return String(Math.round(value));
  }
  const text = cellText(value).replace(/[,，円¥\s]/g, "");
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n));
}

function columnIndex(
  headerRow: unknown[],
  aliases: string[],
): number | null {
  for (let i = 0; i < headerRow.length; i++) {
    const h = cellText(headerRow[i]);
    if (!h) continue;
    const normalized = h.replace(/\s/g, "");
    if (aliases.some((a) => normalized.includes(a.replace(/\s/g, "")))) {
      return i;
    }
  }
  return null;
}

function isDataRowNotHeader(row: unknown[]): boolean {
  const shipper = cellText(row[SCHEDULE_COL.shipper]);
  if (shipper.includes("::") || shipper.includes("荷主M")) return false;
  if (/^実売上$|売上_/.test(shipper)) return false;
  return true;
}

function parseScheduleMatrixRows(
  rows: SheetMatrix,
  sourceFileName: string,
  startRow = 0,
  defaultDate = "",
): ParsedFileMakerDispatch[] {
  const results: ParsedFileMakerDispatch[] = [];
  const cols = resolveScheduleColumns(null);

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (!isDataRowNotHeader(row)) continue;

    const shipperName = cellText(row[cols.shipper]);
    const dispatchRaw = cellText(row[cols.dispatch]);
    const vehicleNumber = cellText(row[cols.vehicle]);
    const driverRaw = cellText(row[cols.driver]);
    const revenue = parseRevenueCell(row[cols.revenue]);
    const personalRemarks =
      cols.remarks >= 0 ? cellText(row[cols.remarks]) : "";

    if (shouldSkipScheduleRow(dispatchRaw, shipperName)) continue;

    const attendance = attendanceFields(shipperName, dispatchRaw);
    const date =
      parseIsoDateFromCell(row[cols.date]) || defaultDate || "";
    const driverName = normalizeDriverName(driverRaw);
    const dispatchName = normalizeDispatchName(dispatchRaw);

    if (!driverName) continue;
    if (!dispatchName && !attendance.isAttendanceRow) continue;

    const warnings: string[] = [];
    if (!date) warnings.push(`行${i + 1}: 日付不明`);

    results.push({
      sourceFileName,
      date,
      driverName,
      vehicleNumber,
      dispatchName: dispatchName || attendance.dayStatus || "休み",
      shipperName,
      revenue: attendance.isAttendanceRow ? "" : revenue,
      tollFee: "",
      personalRemarks: personalRemarks || undefined,
      ...attendance,
      warnings,
    });
  }

  return results;
}

function parseHeaderTableRows(
  rows: SheetMatrix,
  sourceFileName: string,
  headerIdx: number,
  defaultDate = "",
): ParsedFileMakerDispatch[] {
  const headerRow = rows[headerIdx] ?? [];
  const col = {
    date: columnIndex(headerRow, HEADER_MAP["date"] ?? []),
    driver: columnIndex(headerRow, HEADER_MAP["driver"] ?? []),
    vehicle: columnIndex(headerRow, HEADER_MAP["vehicle"] ?? []),
    dispatch: columnIndex(headerRow, HEADER_MAP["dispatch"] ?? []),
    shipper: columnIndex(headerRow, HEADER_MAP["shipper"] ?? []),
    revenue: columnIndex(headerRow, HEADER_MAP["revenue"] ?? []),
    toll: columnIndex(headerRow, HEADER_MAP["toll"] ?? []),
    timecardIn: columnIndex(headerRow, HEADER_MAP["timecardIn"] ?? []),
    timecardOut: columnIndex(headerRow, HEADER_MAP["timecardOut"] ?? []),
    remarks: columnIndex(headerRow, HEADER_MAP["remarks"] ?? []),
  };

  const results: ParsedFileMakerDispatch[] = [];

  // 連続行形式（FileMaker の「ドライバーヘッダー行 + 業務行」形式）に対応するため、
  // 前の行の日付・ドライバー名・車両番号を引き継ぐ。
  // タイムカードは「同一日付×同一ドライバー」内でのみ引き継ぎ（他ドライバーへの漏洩を防止）。
  let lastDate = defaultDate;
  let lastDriverName = "";
  let lastVehicle = "";
  let timecardKey = "";
  let timecardInCarry: string | undefined;
  let timecardOutCarry: string | undefined;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const warnings: string[] = [];

    const rawDate = col.date != null ? row[col.date] : undefined;
    const rawDriverCell =
      col.driver != null ? cellText(row[col.driver]) : cellText(row[1]);
    const vehicleRaw =
      col.vehicle != null ? cellText(row[col.vehicle]) : cellText(row[2]);
    const dispatchRaw =
      col.dispatch != null ? cellText(row[col.dispatch]) : cellText(row[3]);
    const shipperName =
      col.shipper != null ? cellText(row[col.shipper]) : cellText(row[4]);
    const revenue =
      col.revenue != null
        ? parseRevenueCell(row[col.revenue])
        : parseRevenueCell(row[5]);
    const tollFee =
      col.toll != null ? parseRevenueCell(row[col.toll]) : "";
    const personalRemarks =
      col.remarks != null ? cellText(row[col.remarks]) : "";

    const parsedDate = parseIsoDateFromCell(rawDate);
    const parsedDriver = normalizeDriverName(rawDriverCell);
    const dispatchName = normalizeDispatchName(dispatchRaw);

    // 現在行の日付・ドライバーが存在すれば引継ぎ値を更新する
    if (parsedDate && parsedDate !== lastDate) {
      lastDate = parsedDate;
      lastDriverName = parsedDriver;
      lastVehicle = vehicleRaw || "";
    } else if (parsedDriver && parsedDriver !== lastDriverName) {
      lastDriverName = parsedDriver;
      lastVehicle = vehicleRaw || "";
    }

    // 日付・ドライバー名は現在行になければ前行から引継ぎ
    const date = parsedDate || lastDate;
    const driverName = parsedDriver || lastDriverName;

    const dayDriverKey = `${date}|${driverName}`;
    if (dayDriverKey !== timecardKey) {
      timecardKey = dayDriverKey;
      timecardInCarry = undefined;
      timecardOutCarry = undefined;
    }

    const hasTcInCol = col.timecardIn != null;
    const hasTcOutCol = col.timecardOut != null;
    const tcIn = hasTcInCol
      ? parseTimecardTimeCell(row[col.timecardIn!])
      : undefined;
    const tcOut = hasTcOutCol
      ? parseTimecardTimeCell(row[col.timecardOut!])
      : undefined;

    if (tcIn) timecardInCarry = tcIn;
    if (tcOut) timecardOutCarry = tcOut;

    // 車両番号は現在行の値を優先し、なければ前行から引継ぎ
    if (vehicleRaw) lastVehicle = vehicleRaw;
    const resolvedVehicle = vehicleRaw || lastVehicle;

    // 何も有効な情報がない行はスキップ
    if (!date && !driverName && !dispatchName && !shipperName) continue;

    // 配車名なし（タイムカード・ヘッダー専用行）はスキップ。
    // 車両・タイムカードは上記で既に引継ぎ変数に保存済み。
    if (shouldSkipScheduleRow(dispatchName, shipperName)) continue;

    const attendance = attendanceFields(shipperName, dispatchName);
    const resolvedDate = date || defaultDate || "";

    // 勤怠行でタイムカード列が空欄の場合は明示的にクリア（前日・他人の打刻を引き継がない）
    if (attendance.isAttendanceRow) {
      if (hasTcInCol && !tcIn) timecardInCarry = undefined;
      if (hasTcOutCol && !tcOut) timecardOutCarry = undefined;
    }

    // 日付・ドライバー名が完全に取れない行はデータ行として無効
    if (!resolvedDate && !driverName) continue;

    if (!resolvedDate) warnings.push(`行${i + 1}: 日付不明`);
    if (!driverName) warnings.push(`行${i + 1}: 運転手不明`);

    results.push({
      sourceFileName,
      date: resolvedDate,
      driverName,
      vehicleNumber: resolvedVehicle,
      dispatchName: dispatchName || attendance.dayStatus || "休み",
      shipperName,
      revenue: attendance.isAttendanceRow ? "" : revenue,
      tollFee,
      personalRemarks: personalRemarks || undefined,
      timecardIn: timecardInCarry,
      timecardOut: timecardOutCarry,
      ...attendance,
      warnings,
    });
  }

  return results;
}

/** 同一ドライバー×日の配車行からタイムカードを解決（空欄勤怠行は明示的にクリア） */
export function resolveTimecardFromDispatches(
  dispatches: ParsedFileMakerDispatch[],
): { timecardIn?: string; timecardOut?: string } {
  if (dispatches.length === 0) return {};

  let timecardIn: string | undefined;
  let timecardOut: string | undefined;
  const onlyAttendance = dispatches.every((d) => d.isAttendanceRow);
  let attendanceWithoutTimecard = false;

  for (const d of dispatches) {
    if (d.timecardIn) timecardIn = d.timecardIn;
    if (d.timecardOut) timecardOut = d.timecardOut;
    if (d.isAttendanceRow && !d.timecardIn && !d.timecardOut) {
      attendanceWithoutTimecard = true;
    }
  }

  if (onlyAttendance && attendanceWithoutTimecard) {
    return { timecardIn: undefined, timecardOut: undefined };
  }

  return { timecardIn, timecardOut };
}

/**
 * FileMaker 配車スケジュールの CSV / Excel を解析する。
 * - 配車表形式（20260530.csv）: 売上|荷主|配車名|車両|運転手|日付
 * - 表形式（ヘッダー行あり）にも対応
 */
export function parseFileMakerDispatchSheet(
  rows: SheetMatrix,
  sourceFileName = "",
): ParsedFileMakerDispatch[] {
  if (rows.length === 0) return [];

  const defaultDate = parseIsoDateFromFileName(sourceFileName) ?? "";

  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx != null) {
    return parseHeaderTableRows(rows, sourceFileName, headerIdx, defaultDate);
  }

  if (isScheduleMatrixFormat(rows)) {
    return parseScheduleMatrixRows(rows, sourceFileName, 0, defaultDate);
  }

  return parseScheduleMatrixRows(rows, sourceFileName, 0, defaultDate);
}

export function dispatchMatchKey(d: ParsedFileMakerDispatch): string | null {
  if (!d.date || !d.driverName) return null;
  return fusionMatchKey(d.date, d.driverName, d.vehicleNumber);
}
