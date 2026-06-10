/**
 * 有限会社加島様 燃料代請求書テキスト解析
 *
 * カードNo.（例: 9766 00101）をトリガーに、次のカードまでの金額を合算。
 * 軽油税等は燃料小計に対する比率で車両別に按分。
 */

import { safeNumber } from "./currency-format";
import {
  parseAmount,
  parseJapaneseBillingMonth,
  parseJapaneseDate,
} from "./maintenance-bill-parser";
import type { BillType } from "./types";

export const KASHIMA_VENDOR = "有限会社加島";

export type ParsedFuelVehicleEntry = {
  /** カード識別番号（生テキスト） */
  cardKey: string;
  vehicleNumber: string;
  workDescription: string;
  totalAmount: number;
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
  if (/加島|KASHIMA/i.test(text)) return true;
  if (/車番計/.test(text) && /軽油/.test(text)) return true;
  if (/01-00-13340|上津屋中堤|13340/.test(text)) return true;
  if (fileName && /13340|加島|KASHIMA/i.test(fileName)) return true;
  return false;
}

/** ファイル名から請求月を推定（例: 13340-01-20260520-... → 2026-05） */
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

/** 4桁車番を正規化（0600 00101 → 0600） */
function normalizeShabanKey(raw: string): string {
  const t = raw.trim();
  const four = t.match(/^(\d{4})/);
  if (four) return four[1]!;
  return t;
}

/** ページヘッダー等のノイズ行 */
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

/** 成形済みテキスト（車番： / 車番計：）の解析 */
function parseSimplifiedFuelFormat(text: string): Map<string, number> {
  const totals = new Map<string, number>();
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
        totals.set(currentKey, (totals.get(currentKey) ?? 0) + yen);
      }
      currentKey = null;
    }
  }

  return totals;
}

/** 日次給油明細行か（金額集計対象外・車番追跡のみ） */
function isFuelDetailLine(line: string): boolean {
  const s = line.replace(/\u3000/g, " ").trim();
  if (/^\d{2}\/\d{2}\s+\d{4}\s+\d{5}\s+軽油/.test(s)) return true;
  if (/^\d+\s+\d{2}\/\d{2}\s+[\d,.]+\s+[\d,]+\s+\d{4}\s+\d{5}\s+軽油/.test(s))
    return true;
  return false;
}

/** 給油明細行から4桁車番を抽出（伝票NO・給油SSは無視） */
function extractShabanFromDetailLine(line: string): string | null {
  const s = line.replace(/\u3000/g, " ").trim();
  const m = s.match(/(\d{4})\s+\d{5}\s+軽油/);
  return m ? m[1]! : null;
}

/** 軽油税行（集計対象外） */
function isFuelTaxLine(line: string): boolean {
  return /\*+\s*軽油税/.test(line) && !/車番計/.test(line);
}

/**
 * 車番計行の合計金額のみ抽出（伝票NO・日次明細金額は無視）
 * 対応形式:
 *   ***** 車番計 221,202  （PDF抽出）
 *   221,202 ***** 車番計  （テキスト貼付）
 */
function parseShabanKeiAmount(line: string, prevLine?: string): number | null {
  if (!/車番計/.test(line) || /軽油税合計|税込合計|標準税率/.test(line))
    return null;

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

/** 車番計のみから車両別合計を抽出（日次明細はすべてスキップ） */
function parseVehicleTotalsFromShabanKei(text: string): Map<string, number> {
  const totals = new Map<string, number>();
  const lines = text.split("\n");
  let currentShaban: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim().replace(/\u3000/g, " ");
    if (!line || isFuelNoiseLine(line) || /^─/.test(line)) continue;

    if (isFuelDetailLine(line)) {
      const shaban = extractShabanFromDetailLine(line);
      if (shaban) currentShaban = shaban;
      continue;
    }

    if (isFuelTaxLine(line)) continue;

    if (/車番計/.test(line)) {
      const prev = i > 0 ? lines[i - 1]!.trim() : undefined;
      const amount = parseShabanKeiAmount(line, prev);
      if (amount !== null && currentShaban) {
        totals.set(currentShaban, amount);
      }
      currentShaban = null;
    }
  }

  return totals;
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

/**
 * 加島様燃料代請求テキストを車両別に集計
 *
 * 優先: 「車番計」行の金額（軽油税込み）を直前ブロックの車番に紐付け
 * フォールバック: 給油明細行の金額を車番ごとに合算 + 軽油税按分
 */
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

  let vehicleTotals = parseSimplifiedFuelFormat(normalized);

  if (vehicleTotals.size === 0) {
    vehicleTotals = parseVehicleTotalsFromShabanKei(normalized);
  }

  const vehicles: ParsedFuelVehicleEntry[] = [...vehicleTotals.entries()]
    .filter(([, amt]) => amt > 0)
    .map(([cardKey, totalAmount]) => ({
      cardKey,
      vehicleNumber: "",
      workDescription: "燃料代（軽油・ガソリン）",
      totalAmount,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

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

/** 同一カードキーの重複をマージ */
export function mergeFuelVehicleEntries(
  entries: ParsedFuelVehicleEntry[],
): ParsedFuelVehicleEntry[] {
  const map = new Map<string, ParsedFuelVehicleEntry>();
  for (const e of entries) {
    const key = e.cardKey.trim();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...e });
    } else {
      prev.totalAmount += e.totalAmount;
    }
  }
  return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

export function fuelRowTotal(entry: {
  totalAmount: unknown;
}): number {
  return safeNumber(entry.totalAmount);
}

/** 解析結果をインポート用成形テキストに変換 */
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
        `車番：${normalizeShabanKey(v.cardKey)}\n車番計：${v.totalAmount}`,
    )
    .join("\n\n");

  const total = parsed.vehicles.reduce((s, v) => s + v.totalAmount, 0);
  return `${header}\n${body}\n\n合計：￥${total.toLocaleString("ja-JP")}\n`;
}
