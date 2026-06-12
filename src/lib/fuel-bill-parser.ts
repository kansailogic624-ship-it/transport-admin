/**
 * 有限会社加島様 燃料代請求書テキスト解析
 * 車番ごとの集計（車番計・数量計）のみを抽出する。
 */

import { safeNumber } from "./currency-format";
import {
  parseAmount,
  parseJapaneseBillingMonth,
  parseJapaneseDate,
} from "./maintenance-bill-parser";
import type { BillType } from "./types";

export const KASHIMA_VENDOR = "有限会社加島";

/** 車番ごとの集計1件 */
export type FuelVehicleSummary = {
  vehicleCode: string;
  totalQuantity: number;
  totalAmount: number;
};

export type ParsedFuelVehicleEntry = FuelVehicleSummary & {
  vehicleNumber: string;
  workDescription: string;
};

export type ParsedFuelBill = {
  vendorName: string;
  billType: BillType;
  billingMonth: string;
  issueDate: string;
  totalAmount: number;
  vehicles: ParsedFuelVehicleEntry[];
};

export function isKashimaBillText(text: string, fileName?: string): boolean {
  const compact = text.replace(/\s/g, "");

  const issuerIsKashima =
    /有限会社加島(?:様)?(?:燃料|軽油|車番計|COMET|ＣＯＭＥＴ)/i.test(compact) ||
    /(?:燃料|軽油|車番計).{0,30}有限会社加島/i.test(compact);

  const fuelLayout =
    /車番計/.test(text) &&
    /軽油/.test(text) &&
    (/00101|13340|カード/.test(text) || /COMET|ＣＯＭＥＴ/i.test(text));

  if (issuerIsKashima || fuelLayout) return true;
  if (/01-00-13340|上津屋中堤|13340-01/.test(text)) return true;
  if (
    fileName &&
    /13340|KASHIMA/i.test(fileName) &&
    !/安井|ダイサブ|ふそう|整備/i.test(fileName)
  ) {
    return true;
  }
  return false;
}

export function parseBillingMonthFromFuelFilename(
  fileName: string,
): string | null {
  const m = fileName.match(/(\d{4})(\d{2})\d{2}/);
  if (m) return `${m[1]}-${m[2]}`;
  const ym = fileName.match(/(\d{4})[-_](\d{2})/);
  if (ym) return `${ym[1]}-${ym[2]}`;
  return null;
}

function normalizeFuelText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u3000/g, " ")
    .replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[￥¥]/g, "")
    .replace(/^-- \d+ of \d+ --$/gm, "");
}

function normalizeShabanKey(raw: string): string {
  const t = raw.trim();
  const four = t.match(/^(\d{4})/);
  if (four) return four[1]!;
  return t;
}

function isFuelNoiseLine(line: string): boolean {
  return (
    /^(33|2|0|01-00-13340|000103|5064)$/.test(line) ||
    /^登録番号/.test(line) ||
    /^御\s*請\s*求\s*書/.test(line) ||
    /^-- \d+ of \d+ --$/.test(line) ||
    /^年\s+月/.test(line) ||
    /^\d{1,2}\s*月\s*\(/.test(line)
  );
}

/** 成形済みテキスト（車番： / 車番計：） */
function parseSimplifiedFuelFormat(text: string): FuelVehicleSummary[] {
  const results: FuelVehicleSummary[] = [];
  let currentKey: string | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/\u3000/g, " ");
    if (!line || isFuelNoiseLine(line)) continue;

    const keyMatch = line.match(/^車番\s*[:：]\s*(.+)$/);
    if (keyMatch) {
      currentKey = normalizeShabanKey(keyMatch[1]!);
      continue;
    }

    const keiMatch = line.match(/^車番計\s*[:：]\s*(.+)$/);
    if (keiMatch && currentKey) {
      const amounts = [...keiMatch[1]!.matchAll(/([\d,]+)/g)].map((m) =>
        parseAmount(m[1]!),
      );
      const yen = amounts.length > 0 ? Math.max(...amounts) : 0;
      if (yen >= 100) {
        results.push({
          vehicleCode: currentKey,
          totalQuantity: 0,
          totalAmount: yen,
        });
      }
      currentKey = null;
    }
  }

  return results;
}

/** 日次給油明細行（車番計抽出時はスキップ・車両コード追跡のみ） */
function isDailyFuelDetailLine(line: string): boolean {
  const s = line.replace(/\u3000/g, " ").trim();
  return /^\d{2}\/\d{2}\s+\d{4}\s+\d{5}\s+/.test(s);
}

/** 行から4桁車両コードを検出（明細行から車番ブロック紐付け用） */
function peekVehicleCodeFromLine(line: string): string | null {
  const s = line.replace(/\u3000/g, " ").trim();
  const m = s.match(/(\d{4})\s+\d{5}\s+軽油/);
  return m ? m[1]! : null;
}

function isFuelTaxLine(line: string): boolean {
  return /\*+\s*軽油税/.test(line) && !/車番計/.test(line);
}

function isVehicleShabanKeiLine(line: string): boolean {
  return /車番計/.test(line) && !/軽油税合計|税込合計|標準税率/.test(line);
}

function parseFuelTaxQuantity(line: string): number | null {
  const s = line.replace(/\u3000/g, " ").trim();
  const m = s.match(/\*+\s*軽油税\s+([\d,.]+)/);
  if (!m) return null;
  const n = parseFloat(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseShabanKeiAmount(line: string, prevLine?: string): number | null {
  if (!isVehicleShabanKeiLine(line)) return null;

  const normalized = line.replace(/\u3000/g, " ").trim();

  const after = normalized.match(/^\*+\s+車番計\s+([\d,]+)/);
  if (after) {
    const n = parseAmount(after[1]!);
    return n >= 100 ? n : null;
  }

  const before = normalized.match(/^([\d,]+)\s+\*+\s*車番計/);
  if (before) {
    const n = parseAmount(before[1]!);
    return n >= 100 ? n : null;
  }

  if (/^\*+\s+車番計/.test(normalized) && prevLine) {
    const prev = prevLine.replace(/\u3000/g, " ").trim();
    const only = prev.match(/^([\d,]+)$/);
    if (only) {
      const n = parseAmount(only[1]!);
      return n >= 1000 ? n : null;
    }
  }

  return null;
}

export type ShabanKeiBlock = {
  vehicleCode: string;
  taxLine: string | null;
  keiLine: string;
  totalQuantity: number;
  totalAmount: number;
};

/**
 * PDF全文から「車番計」集計ブロックのみを収集（日次明細は無視）。
 * ルールベース解析・AI入力の共通ソース。
 */
export function collectShabanKeiBlocks(text: string): ShabanKeiBlock[] {
  const normalized = normalizeFuelText(text);
  const lines = normalized.split("\n");
  const results: ShabanKeiBlock[] = [];
  let currentCode: string | null = null;
  let pendingTaxLine: string | null = null;
  let pendingQuantity = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim().replace(/\u3000/g, " ");
    if (!line || isFuelNoiseLine(line) || /^─/.test(line)) continue;

    if (isDailyFuelDetailLine(line)) {
      const code = peekVehicleCodeFromLine(line);
      if (code) currentCode = code;
      continue;
    }

    const code = peekVehicleCodeFromLine(line);
    if (code) currentCode = code;

    if (isFuelTaxLine(line)) {
      pendingTaxLine = line;
      const qty = parseFuelTaxQuantity(line);
      if (qty !== null) pendingQuantity = qty;
      continue;
    }

    if (isVehicleShabanKeiLine(line)) {
      const prev = i > 0 ? lines[i - 1]!.trim() : undefined;
      const amount = parseShabanKeiAmount(line, prev);
      if (amount !== null && currentCode) {
        results.push({
          vehicleCode: currentCode,
          taxLine: pendingTaxLine,
          keiLine: line,
          totalQuantity: pendingQuantity,
          totalAmount: amount,
        });
      }
      currentCode = null;
      pendingTaxLine = null;
      pendingQuantity = 0;
    }
  }

  return results;
}

/** AI/OCR用: 車番計ブロックだけを切り出したテキスト（日次明細を完全除外） */
export function extractShabanKeiBlocksForAi(text: string): string {
  const blocks = collectShabanKeiBlocks(text);
  if (blocks.length === 0) return "";

  const header =
    "以下は加島燃料代請求書から切り出した「車番計」集計ブロックのみです。日次給油明細は含みません。\n";

  const body = blocks
    .map((b) => {
      const lines = [`車番: ${b.vehicleCode}`];
      if (b.taxLine) lines.push(b.taxLine);
      lines.push(b.keiLine);
      return lines.join("\n");
    })
    .join("\n\n---\n\n");

  return `${header}\n${body}`;
}

/** 車番計ブロック件数（ルール vs AI の充足判定用） */
export function countShabanKeiBlocks(text: string): number {
  return collectShabanKeiBlocks(text).length;
}

const FUEL_TAX_LINE_RE =
  /^\*+\s+軽油税\s+(?!合計)([\d,.]+)\s+([\d,.]+)\s+([\d,]+)/;
const FUEL_TAX_TOTAL_LINE_RE =
  /^\*+\s+軽油税合計\s+([\d,.]+)\s+([\d,.]+)\s+([\d,]+)/;

function parseFuelTaxUnitRate(line: string): number | null {
  const s = line.replace(/\u3000/g, " ").trim();
  const m = s.match(FUEL_TAX_LINE_RE) ?? s.match(FUEL_TAX_TOTAL_LINE_RE);
  if (!m) return null;
  const rate = parseFloat(m[2]!.replace(/,/g, ""));
  if (!Number.isFinite(rate) || rate <= 0 || rate > 200) return null;
  return rate;
}

/**
 * PDFテキストから軽油税の単価（円/L）を自動判別。
 * 「***** 軽油税 数量 単価 金額」行の単価列を収集し、最頻値を返す。
 */
export function detectFuelTaxRateFromText(text: string): number | null {
  const normalized = normalizeFuelText(text);
  const counts = new Map<number, number>();

  for (const raw of normalized.split("\n")) {
    const rate = parseFuelTaxUnitRate(raw.trim());
    if (rate === null) continue;
    counts.set(rate, (counts.get(rate) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  let bestRate: number | null = null;
  let bestCount = 0;
  for (const [rate, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestRate = rate;
    }
  }
  return bestRate;
}

/** PDFテキストから車番計・軽油税（数量計）ブロックを抽出 */
export function parseVehicleSummariesFromBill(text: string): FuelVehicleSummary[] {
  return collectShabanKeiBlocks(text).map((b) => ({
    vehicleCode: b.vehicleCode,
    totalQuantity: b.totalQuantity,
    totalAmount: b.totalAmount,
  }));
}

function extractLineAmount(line: string): number {
  const s = line.trim();
  if (!s) return 0;

  if (/軽油税|ガソリン税|石油税|消費税|税額|小計|合計|請求|御請求/i.test(s)) {
    const amounts = [...s.matchAll(/([\d,]+)\s*円?/g)]
      .map((m) => parseAmount(m[1]!))
      .filter((n) => n > 0);
    return amounts.length > 0 ? amounts[amounts.length - 1]! : 0;
  }

  const fuelLine =
    /軽油|ガソリン|レギュラー|ハイオク|給油|燃料|diesel|gasoline/i.test(s);
  const amounts = [...s.matchAll(/([\d,]+)\s*円?/g)]
    .map((m) => parseAmount(m[1]!))
    .filter((n) => n > 0 && n < 10_000_000);

  if (amounts.length === 0) return 0;
  if (fuelLine) return amounts[amounts.length - 1]!;
  if (amounts.length === 1 && amounts[0]! >= 100) return amounts[0]!;
  return 0;
}

function parseBillingMeta(text: string): {
  billingMonth: string;
  issueDate: string;
  totalAmount: number;
} {
  let billingMonth = "";
  let issueDate = "";
  let totalAmount = 0;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!billingMonth) {
      const m =
        parseJapaneseBillingMonth(line) ??
        parseJapaneseBillingMonth(
          line.replace(/請求対象月|ご請求月|対象月|請求月/g, ""),
        );
      if (m) billingMonth = m;
    }
    if (!issueDate) {
      const d =
        parseJapaneseDate(line) ??
        parseJapaneseDate(line.replace(/請求年月日|発行日/g, ""));
      if (d) issueDate = d;
    }
    if (totalAmount <= 0 && /御請求|請求総額|ご請求額|合計金額/i.test(line)) {
      const n = extractLineAmount(line);
      if (n > 0) totalAmount = n;
    }
  }

  if (!billingMonth) {
    const ym = text.match(/(\d{4})[年/-](\d{1,2})[月]/);
    if (ym) {
      billingMonth = `${ym[1]}-${String(Number(ym[2]!)).padStart(2, "0")}`;
    }
  }

  if (!billingMonth) {
    const closing = text.match(/(\d{2})\s*月\s*\(\s*\d+\s*日締\)/);
    if (closing) {
      const year = text.match(/\b(20\d{2})\b/)?.[1];
      if (year) {
        billingMonth = `${year}-${String(Number(closing[1]!)).padStart(2, "0")}`;
      }
    }
  }

  if (!billingMonth) {
    const headerClose = text.match(
      /月\s*\(\s*\d+\s*日締\)[\s\S]{0,40}?\b05\b/,
    );
    const year = text.match(/\b(20\d{2})\b/)?.[1];
    if (headerClose && year) {
      billingMonth = `${year}-05`;
    }
  }

  if (totalAmount <= 0) {
    const m = text.match(/今回御請求額[\s\S]{0,80}?([\d,]+)/);
    if (m) totalAmount = parseAmount(m[1]!);
  }

  return { billingMonth, issueDate, totalAmount };
}

export function parseKashimaFuelBill(
  text: string,
  fileName?: string,
): ParsedFuelBill {
  const normalized = normalizeFuelText(text);
  const meta = parseBillingMeta(normalized);
  let billingMonth = "";
  if (fileName) {
    billingMonth = parseBillingMonthFromFuelFilename(fileName) ?? "";
  }
  if (!billingMonth) billingMonth = meta.billingMonth;
  let issueDate = meta.issueDate;
  if (!issueDate && fileName) {
    const d = fileName.match(/(\d{4})(\d{2})(\d{2})/);
    if (d) issueDate = `${d[1]}-${d[2]}-${d[3]}`;
  }

  let summaries = parseSimplifiedFuelFormat(normalized);
  if (summaries.length === 0) {
    summaries = parseVehicleSummariesFromBill(normalized);
  }
  summaries = mergeFuelVehicleSummaries(summaries);

  const vehicles: ParsedFuelVehicleEntry[] = summaries
    .filter((v) => v.totalAmount > 0)
    .map((v) => ({
      ...v,
      vehicleNumber: "",
      workDescription: fuelVehicleWorkDescription(v),
    }));

  const computedTotal = vehicles.reduce((s, v) => s + v.totalAmount, 0);

  return {
    vendorName: KASHIMA_VENDOR,
    billType: "燃料代",
    billingMonth,
    issueDate,
    totalAmount: meta.totalAmount > 0 ? meta.totalAmount : computedTotal,
    vehicles,
  };
}

export function fuelVehicleWorkDescription(v: FuelVehicleSummary): string {
  const qty =
    v.totalQuantity > 0
      ? `${v.totalQuantity.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}L`
      : "";
  return ["燃料代", qty, "車番計"].filter(Boolean).join(" ");
}

/** 同一車番をマージしつつ、PDF原本の登場順を維持 */
export function mergeFuelVehicleSummaries(
  entries: FuelVehicleSummary[],
): FuelVehicleSummary[] {
  const map = new Map<string, FuelVehicleSummary>();
  const order: string[] = [];
  for (const e of entries) {
    const key = e.vehicleCode.trim();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...e });
      order.push(key);
    } else {
      prev.totalQuantity += e.totalQuantity;
      prev.totalAmount += e.totalAmount;
    }
  }
  return order.map((k) => map.get(k)!);
}

/** @deprecated mergeFuelVehicleSummaries を使用 */
export function mergeFuelVehicleEntries(
  entries: ParsedFuelVehicleEntry[],
): ParsedFuelVehicleEntry[] {
  const merged = mergeFuelVehicleSummaries(entries);
  return merged.map((v) => ({
    ...v,
    vehicleNumber: "",
    workDescription: fuelVehicleWorkDescription(v),
  }));
}

export function fuelRowTotal(entry: { totalAmount: unknown }): number {
  return safeNumber(entry.totalAmount);
}

export function formatFuelBillForImport(parsed: ParsedFuelBill): string {
  const header = [
    `${parsed.vendorName} 燃料代請求書`,
    parsed.billingMonth ? `請求月：${parsed.billingMonth}` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const body = parsed.vehicles
    .map(
      (v) =>
        `車番：${normalizeShabanKey(v.vehicleCode)}\n車番計：${v.totalAmount}`,
    )
    .join("\n\n");

  const total = parsed.vehicles.reduce((s, v) => s + v.totalAmount, 0);
  return `${header}\n${body}\n\n合計：￥${total.toLocaleString("ja-JP")}\n`;
}
