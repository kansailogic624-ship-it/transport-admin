/**
 * Amazon実績 xlsx（Sheet1）解析
 */

import { normalizeOwnCompanyName } from "./amazon-own-company";
import {
  parseIsoDateFromCell,
  tryExcelSerialFromUnknown,
} from "./import-match-keys";
import type { SheetMatrix } from "./driving-report-parser";

export type ParsedAmazonPerformanceRow = {
  date: string;
  driverName: string;
  companyName: string;
  /** Excel 生の会社名（前処理・自社/傭車判定用） */
  companyNameRaw: string;
  routeLabel: string;
  revenue: number;
  payment: number;
  diff: number;
  laborCost: number;
  memo: string;
};

const NOISE_TEXT_RE =
  /^(合計|小計|総合計|計|Amazon実績|Amazon|実績|日付|名前|会社名|便名|売上|支払|差異|人件費|備考)$/i;

/** セル値を安全に文字列化（undefined/null でも .replace しない） */
function safeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function normalizeHeaderCell(raw: unknown): string {
  return safeText(raw).replace(/\u3000/g, "").replace(/\s/g, "").trim();
}

function getCell(row: unknown, col: number): unknown {
  if (col < 0 || !Array.isArray(row)) return undefined;
  return row[col];
}

function findHeaderRowIndex(rows: SheetMatrix): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map(normalizeHeaderCell);
    if (
      cells.includes("日付") &&
      cells.includes("名前") &&
      (cells.includes("会社名") || cells.includes("会社"))
    ) {
      return i;
    }
  }
  return -1;
}

function findColumnIndex(header: string[], candidates: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = normalizeHeaderCell(header[i]);
    if (!h) continue;
    for (const c of candidates) {
      if (h === c || h.includes(c)) return i;
    }
  }
  return -1;
}

function parseMoney(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  const n = Number(safeText(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseText(value: unknown): string {
  return safeText(value).replace(/\u3000/g, " ").trim();
}

function isNoiseLabel(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (NOISE_TEXT_RE.test(t)) return true;
  if (/合計|小計|総合計|Amazon実績/i.test(t)) return true;
  return false;
}

/** 名前が有効なドライバー名か（数字のみ・ノイズを除外） */
function isValidDriverName(name: string): boolean {
  const t = name.trim();
  if (!t || t.length < 1) return false;
  if (isNoiseLabel(t)) return false;
  if (/^\d+([.,]\d+)?$/.test(t)) return false;
  return true;
}

/**
 * 日付セルが明細行として有効か（タイトル・集計行・不正形式を除外）
 */
function parseAmazonDateCell(value: unknown): string | null {
  if (value == null || value === "") return null;

  const text = safeText(value).replace(/\u3000/g, " ").trim();
  if (!text) return null;
  if (isNoiseLabel(text)) return null;
  if (/^日付$/i.test(text)) return null;

  const serialIso = tryExcelSerialFromUnknown(value);
  if (serialIso) return serialIso;

  return parseIsoDateFromCell(value);
}

/** パース済み・シリアル混在の日付を YYYY-MM-DD に統一（FM照合用） */
export function normalizeAmazonPerformanceDate(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const serialIso = tryExcelSerialFromUnknown(t);
  if (serialIso) return serialIso;

  const parsed = parseIsoDateFromCell(t);
  if (parsed) return parsed;

  return t;
}

/** 画面表示用（2025/06/01 形式） */
export function formatAmazonPerformanceDisplayDate(raw: string): string {
  const iso = normalizeAmazonPerformanceDate(raw);
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  return iso;
}

function isRowEmpty(row: unknown): boolean {
  if (!Array.isArray(row)) return true;
  return row.every((cell) => safeText(cell).trim() === "");
}

/** 明細行として処理してよいか */
function isValidAmazonDataRow(
  row: unknown,
  dateCol: number,
  nameCol: number,
): boolean {
  if (!Array.isArray(row) || isRowEmpty(row)) return false;

  const driverName = parseText(getCell(row, nameCol));
  if (!isValidDriverName(driverName)) return false;

  const date = parseAmazonDateCell(getCell(row, dateCol));
  if (!date) return false;

  return true;
}

export type AmazonExcelHeaderTotals = {
  sales: number | null;
  payment: number | null;
  difference: number | null;
  laborCost: number | null;
  found: boolean;
};

function moneyFromLabelCell(label: string, sameCell: unknown, nextCell: unknown): number | null {
  const fromNext = parseMoney(nextCell);
  if (fromNext > 0) return fromNext;
  const text = safeText(sameCell);
  const inline = text.replace(/[^\d,.-]/g, "").replace(/,/g, "");
  const n = Number(inline);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return null;
}

/** ヘッダー行より上の合計行を読み取る */
export function parseAmazonSheetHeaderTotals(
  rows: SheetMatrix,
  headerIdx: number,
): AmazonExcelHeaderTotals {
  const result: AmazonExcelHeaderTotals = {
    sales: null,
    payment: null,
    difference: null,
    laborCost: null,
    found: false,
  };

  if (headerIdx <= 0) return result;

  for (let i = 0; i < headerIdx; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const label = normalizeHeaderCell(row[c]);
      if (!label) continue;
      const value = moneyFromLabelCell(label, row[c], getCell(row, c + 1));
      if (value == null) continue;

      if (/売上/.test(label) && /合計|計/.test(label)) result.sales = value;
      else if (label === "売上" || label.includes("売上合計")) result.sales = value;
      else if (/支払/.test(label) && /合計|計/.test(label)) result.payment = value;
      else if (label === "支払" || label.includes("支払合計")) result.payment = value;
      else if (/差異/.test(label) && /合計|計/.test(label)) result.difference = value;
      else if (label === "差異" || label.includes("差異合計")) result.difference = value;
      else if (/人件費/.test(label) && /合計|計/.test(label)) result.laborCost = value;
      else if (label === "人件費" || label.includes("人件費合計")) {
        result.laborCost = value;
      }
    }
  }

  result.found =
    result.sales != null ||
    result.payment != null ||
    result.difference != null ||
    result.laborCost != null;

  return result;
}

export type AmazonSheetParseResult = {
  rows: ParsedAmazonPerformanceRow[];
  headerTotals: AmazonExcelHeaderTotals;
};

/** Sheet1 行列から実績行と上部合計を抽出 */
export function parseAmazonPerformanceSheetWithMeta(
  rows: SheetMatrix,
): AmazonSheetParseResult {
  const headerIdx = findHeaderRowIndex(rows);
  const headerTotals =
    headerIdx >= 0
      ? parseAmazonSheetHeaderTotals(rows, headerIdx)
      : {
          sales: null,
          payment: null,
          difference: null,
          laborCost: null,
          found: false,
        };
  return {
    rows: parseAmazonPerformanceSheet(rows),
    headerTotals,
  };
}

/** Sheet1 行列から実績行を抽出 */
export function parseAmazonPerformanceSheet(
  rows: SheetMatrix,
): ParsedAmazonPerformanceRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx < 0) return [];

  const header = (rows[headerIdx] ?? []).map((c) => safeText(c));
  const dateCol = findColumnIndex(header, ["日付"]);
  const nameCol = findColumnIndex(header, ["名前", "ドライバー", "運転手"]);
  const companyCol = findColumnIndex(header, ["会社名", "会社"]);
  const routeCol = findColumnIndex(header, ["便名", "コース", "業務"]);
  const revenueCol = findColumnIndex(header, ["売上"]);
  const paymentCol = findColumnIndex(header, ["支払"]);
  const diffCol = findColumnIndex(header, ["差異"]);
  const laborCol = findColumnIndex(header, ["人件費"]);
  const memoCol = findColumnIndex(header, ["備考", "メモ"]);

  if (dateCol < 0 || nameCol < 0) return [];

  const results: ParsedAmazonPerformanceRow[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!isValidAmazonDataRow(row, dateCol, nameCol)) continue;

    const driverName = parseText(getCell(row, nameCol));
    const date = parseAmazonDateCell(getCell(row, dateCol));
    if (!date || !driverName) continue;

    const companyRaw =
      companyCol >= 0 ? parseText(getCell(row, companyCol)) : "";
    results.push({
      date: normalizeAmazonPerformanceDate(date),
      driverName,
      companyNameRaw: companyRaw,
      companyName: normalizeOwnCompanyName(companyRaw),
      routeLabel: routeCol >= 0 ? parseText(getCell(row, routeCol)) : "",
      revenue: revenueCol >= 0 ? parseMoney(getCell(row, revenueCol)) : 0,
      payment: paymentCol >= 0 ? parseMoney(getCell(row, paymentCol)) : 0,
      diff: diffCol >= 0 ? parseMoney(getCell(row, diffCol)) : 0,
      laborCost: laborCol >= 0 ? parseMoney(getCell(row, laborCol)) : 0,
      memo: memoCol >= 0 ? parseText(getCell(row, memoCol)) : "",
    });
  }

  return results;
}

/** xlsx/csv バッファから Sheet1 を優先して解析 */
export async function parseAmazonPerformanceBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<ParsedAmazonPerformanceRow[]> {
  const meta = await parseAmazonPerformanceWithMeta(buffer, fileName);
  return meta.rows;
}

/** 明細 + Excel上部合計をまとめて解析 */
export async function parseAmazonPerformanceWithMeta(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<AmazonSheetParseResult> {
  const { allSheetMatricesFromArrayBuffer } = await import("./spreadsheet-read");
  const sheets = await allSheetMatricesFromArrayBuffer(buffer, fileName);
  const sheet =
    sheets.find((s) => s.sheetName === "Sheet1") ??
    sheets.find((s) => /sheet1/i.test(s.sheetName)) ??
    sheets[0];
  if (!sheet?.rows) {
    return {
      rows: [],
      headerTotals: {
        sales: null,
        payment: null,
        difference: null,
        laborCost: null,
        found: false,
      },
    };
  }
  return parseAmazonPerformanceSheetWithMeta(sheet.rows);
}
