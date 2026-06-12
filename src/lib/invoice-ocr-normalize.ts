/**
 * 請求書OCR — AI/OCRレスポンスの正規化レイヤー
 *
 * 配列・単一オブジェクト・data/lines/items 欠損・undefined フィールドを
 * 必ず InvoiceVehicleLine[] に変換してからテーブルへ渡す。
 */

import { safeNumber } from "./currency-format";
import type { MaintenanceType } from "./types";
import type { BillType } from "./types";
import {
  inferMaintenanceTypeFromText,
  isValidInvoiceVehicleNumber,
  normalizePlateKey,
  splitInclusiveAmounts,
  suggestRowConsumptionTax,
  type ParsedVehicleEntry,
  type VehicleRowTaxCategory,
} from "./maintenance-bill-parser";

/** AIが返す税区分 */
export type ExtractedTaxType = "税込" | "税抜" | "非課税" | "不明";

export type InvoiceAiExtractedLine = {
  vehicle_number: string;
  repair_type: string;
  amount_text: string;
  tax_text?: string;
  common_text?: string;
  tax_type: ExtractedTaxType | string;
};

/** フロントエンドで統一して扱う車両行 */
export type InvoiceVehicleLine = {
  vehicle_number: string;
  repair_type: string;
  base_amount: number;
  tax_amount: number;
  total_amount: number;
  vendor_name?: string;
};

const MAINTENANCE_TYPE_VALUES: MaintenanceType[] = [
  "車検",
  "3か月点検（法定）",
  "一般整備",
  "その他",
];

/** AIが "86,774" 等の文字列で返す場合も数値化 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[,\s円¥￥]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/**
 * AI/OCRレスポンスを行配列に正規化。
 * data / lines / items / result / 単体オブジェクト / 配列 のいずれも受け付ける。
 */
export function normalizeInvoiceLines(response: unknown): unknown[] {
  if (response == null) return [];

  let payload: unknown = response;

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        payload = JSON.parse(trimmed) as unknown;
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  if (typeof payload !== "object" || payload === null) return [];

  const obj = payload as Record<string, unknown>;

  if (Array.isArray(obj.lines)) return obj.lines;
  if (Array.isArray(obj.items)) return obj.items;

  const raw =
    obj.data ??
    obj.lines ??
    obj.items ??
    obj.result ??
    payload;

  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === "object") {
    const nested = raw as Record<string, unknown>;
    if (Array.isArray(nested.lines)) return nested.lines;
    if (Array.isArray(nested.items)) return nested.items;
    return [raw];
  }

  return [];
}

/** 税区分文字列を正規化 */
export function parseTaxType(value: unknown): ExtractedTaxType {
  const t = String(value ?? "")
    .replace(/\s/g, "")
    .toLowerCase();
  if (!t || t === "不明" || t === "unknown") return "不明";
  if (/税込|内税|込|incl/.test(t)) return "税込";
  if (/税抜|外税|抜|excl|ex_tax/.test(t)) return "税抜";
  if (/非課税|免税|諸費用|exempt/.test(t)) return "非課税";
  return "不明";
}

/**
 * AI抽出行（金額文字列）→ フロント側で base/tax/total を計算。
 * AIに計算させない。
 */
export function computeAmountsFromExtractedLine(
  line: InvoiceAiExtractedLine,
  billType: BillType = "一括",
): {
  base_amount: number;
  tax_amount: number;
  total_amount: number;
  labor_fee: number;
  parts_fee: number;
  common_expense: number;
  tax_category: VehicleRowTaxCategory;
} {
  const amount = toNumber(line.amount_text);
  const taxRaw = toNumber(line.tax_text);
  const common = toNumber(line.common_text);
  const taxType = parseTaxType(line.tax_type);

  let labor = billType === "部品代" ? 0 : amount;
  let parts = billType === "部品代" ? amount : 0;
  let tax = taxRaw;
  let taxCategory: VehicleRowTaxCategory =
    taxType === "非課税" ? "exempt" : "ex_tax";

  if (taxType === "税込" && tax === 0 && amount > 0) {
    const split = splitInclusiveAmounts(labor, parts, 0);
    labor = split.laborFee;
    parts = split.partsFee;
    tax = split.consumptionTax;
    taxCategory = "ex_tax";
  } else if (
    (taxType === "税抜" || taxType === "不明") &&
    tax === 0 &&
    amount > 0 &&
    taxCategory !== "exempt"
  ) {
    tax = suggestRowConsumptionTax(labor, parts, 0, "ex_tax");
  }

  const base = labor + parts + common;
  const total = base + tax;

  return {
    base_amount: labor + parts,
    tax_amount: tax,
    total_amount: total,
    labor_fee: labor,
    parts_fee: parts,
    common_expense: common,
    tax_category: taxCategory,
  };
}

/** AI抽出行 → ParsedVehicleEntry */
export function aiExtractedLineToVehicleEntry(
  line: InvoiceAiExtractedLine,
  billType: BillType,
): ParsedVehicleEntry {
  const amounts = computeAmountsFromExtractedLine(line, billType);
  const common = toNumber(line.common_text);
  const repairType = repairTypeToMaintenanceType(line.repair_type ?? "");
  const total = amounts.labor_fee + amounts.parts_fee + common + amounts.tax_amount;

  return {
    vehicleNumber: String(line.vehicle_number ?? "").trim(),
    workDescription: line.repair_type ?? repairType,
    laborFee: amounts.labor_fee,
    partsFee: amounts.parts_fee,
    commonExpense: common,
    consumptionTax: amounts.tax_amount,
    maintenanceType: repairType,
    totalAmount: total,
    taxCategory: common > 0 && amounts.labor_fee + amounts.parts_fee === 0
      ? "exempt"
      : amounts.tax_category,
  };
}

/** AIレスポンス全体 → ParsedVehicleEntry[] */
export function parseAiResponseToVehicleEntries(
  response: unknown,
  billType: BillType,
): ParsedVehicleEntry[] {
  const rawLines = normalizeInvoiceLines(response);
  const entries: ParsedVehicleEntry[] = [];

  for (const raw of rawLines) {
    if (raw == null || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const extracted: InvoiceAiExtractedLine = {
      vehicle_number: String(
        row.vehicle_number ?? row.vehicleNumber ?? "",
      ).trim(),
      repair_type: String(
        row.repair_type ??
          row.maintenance_type ??
          row.description ??
          "",
      ).trim(),
      amount_text: String(
        row.amount_text ??
          row.amount ??
          row.base_amount ??
          row.laborFee ??
          "",
      ).trim(),
      tax_text: String(row.tax_text ?? row.tax_amount ?? row.tax ?? "").trim(),
      common_text: String(
        row.common_text ?? row.common_expense ?? row.commonExpense ?? "",
      ).trim(),
      tax_type: String(row.tax_type ?? row.taxType ?? row.tax_inclusive ? "税込" : "不明"),
    };

    if (!extracted.vehicle_number && !extracted.amount_text) continue;
    if (!isValidInvoiceVehicleNumber(extracted.vehicle_number)) continue;

    entries.push(aiExtractedLineToVehicleEntry(extracted, billType));
  }

  return entries;
}

/** 1行分のフィールド名ゆれを吸収し、安全な初期値で補完 */
export function mapNormalizedInvoiceLine(line: unknown): InvoiceVehicleLine {
  const l =
    line != null && typeof line === "object"
      ? (line as Record<string, unknown>)
      : {};

  const vehicle_number = String(
    l.vehicle_number ?? l.vehicleNo ?? l.car_number ?? l.vehicleNumber ?? "",
  ).trim();

  const repairRaw = String(
    l.repair_type ??
      l.maintenance_type ??
      l.maintenanceType ??
      l.description ??
      l.workDescription ??
      "",
  ).trim();

  const base_amount = toNumber(
    l.base_amount ?? l.amount_ex_tax ?? l.subtotal ?? l.laborFee ?? l.partsFee,
  );
  const tax_amount = toNumber(l.tax_amount ?? l.tax ?? l.consumptionTax);
  let total_amount = toNumber(
    l.total_amount ?? l.amount_with_tax ?? l.totalAmount ?? l.total,
  );
  if (total_amount <= 0 && base_amount + tax_amount > 0) {
    total_amount = base_amount + tax_amount;
  }

  const repair_type = repairRaw
    ? MAINTENANCE_TYPE_VALUES.includes(repairRaw as MaintenanceType)
      ? repairRaw
      : inferMaintenanceTypeFromText(repairRaw)
    : "";

  return {
    vehicle_number,
    repair_type,
    base_amount,
    tax_amount,
    total_amount,
    vendor_name:
      typeof l.vendor_name === "string"
        ? l.vendor_name
        : typeof l.vendorName === "string"
          ? l.vendorName
          : undefined,
  };
}

/** 空行（手動入力用フォールバック） */
export function emptyInvoiceVehicleLine(): InvoiceVehicleLine {
  return {
    vehicle_number: "",
    repair_type: "",
    base_amount: 0,
    tax_amount: 0,
    total_amount: 0,
  };
}

function extractVendorName(response: unknown): string | undefined {
  if (response == null || typeof response !== "object") return undefined;
  const o = response as Record<string, unknown>;
  if (typeof o.vendor_name === "string" && o.vendor_name.trim()) {
    return o.vendor_name.trim();
  }
  if (typeof o.vendorName === "string" && o.vendorName.trim()) {
    return o.vendorName.trim();
  }
  if (o.data != null && typeof o.data === "object") {
    return extractVendorName(o.data);
  }
  return undefined;
}

function extractInvoiceTotal(response: unknown): number {
  if (response == null || typeof response !== "object") return 0;
  const o = response as Record<string, unknown>;
  const direct = toNumber(o.invoice_total ?? o.totalAmount ?? o.total_amount);
  if (direct > 0) return direct;
  if (o.data != null && typeof o.data === "object") {
    return extractInvoiceTotal(o.data);
  }
  return 0;
}

/**
 * AI/OCRレスポンス全体を InvoiceVehicleLine[] に変換。
 * 0件でも [] を返し、呼び出し側でクラッシュさせない。
 */
export function parseInvoiceOcrResponse(
  response: unknown,
  fallbackVendorName = "",
): InvoiceVehicleLine[] {
  if (response == null) return [];

  try {
    const vendor =
      extractVendorName(response) || fallbackVendorName || undefined;
    const rawLines = normalizeInvoiceLines(response);

    return filterValidInvoiceVehicleLines(
      rawLines.map((line) => {
        const mapped = mapNormalizedInvoiceLine(line);
        return {
          ...mapped,
          vendor_name: mapped.vendor_name || vendor,
        };
      }),
    );
  } catch (err) {
    console.error("[InvoiceOCR] parseInvoiceOcrResponse 失敗", {
      error: err,
      response,
    });
    return [];
  }
}

/** OCRテキスト内の JSON（コードブロック・インライン）を抽出してパース */
export function extractInvoiceLinesFromJsonText(text: string): InvoiceVehicleLine[] {
  if (!text?.trim()) return [];

  const chunks: string[] = [];
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (m[1]?.trim()) chunks.push(m[1].trim());
  }

  const inline =
    text.match(/\{[\s\S]*?"(?:lines|vehicle_number)"[\s\S]*?\}/) ??
    text.match(/\[[\s\S]*?"vehicle_number"[\s\S]*?\]/);
  if (inline?.[0]) chunks.push(inline[0]);

  const results: InvoiceVehicleLine[] = [];
  for (const chunk of chunks) {
    results.push(...parseInvoiceOcrResponse(chunk));
  }
  return results;
}

/** repair_type 文字列 → MaintenanceType */
export function repairTypeToMaintenanceType(repairType: string): MaintenanceType {
  const t = repairType.trim();
  if (MAINTENANCE_TYPE_VALUES.includes(t as MaintenanceType)) {
    return t as MaintenanceType;
  }
  return inferMaintenanceTypeFromText(t);
}

/** InvoiceVehicleLine → 集計レスポンスのメタ情報 */
export function extractInvoiceMeta(response: unknown): {
  vendor_name: string;
  invoice_total: number;
} {
  return {
    vendor_name: extractVendorName(response) ?? "",
    invoice_total: extractInvoiceTotal(response),
  };
}

function invoiceLineScore(line: InvoiceVehicleLine): number {
  let s = 0;
  if (line.vehicle_number) s += 5;
  if (line.base_amount > 0) s += 3;
  if (line.tax_amount > 0) s += 2;
  if (line.repair_type) s += 1;
  return s;
}

/**
 * 登録番号をキーに重複排除。異なる車両の金額は絶対に合算しない。
 */
export function deduplicateInvoiceLinesByVehicle(
  lines: InvoiceVehicleLine[],
): InvoiceVehicleLine[] {
  const map = new Map<string, InvoiceVehicleLine>();

  for (const raw of lines) {
    const line = mapNormalizedInvoiceLine(raw);
    if (!isValidInvoiceVehicleNumber(line.vehicle_number)) continue;

    const key = normalizePlateKey(line.vehicle_number);
    const existing = map.get(key);
    if (!existing || invoiceLineScore(line) > invoiceLineScore(existing)) {
      map.set(key, line);
    }
  }

  return [...map.values()];
}

/** 有効な登録番号を持つ行のみ残す（加島・宛名行を除外） */
export function filterValidInvoiceVehicleLines(
  lines: InvoiceVehicleLine[],
): InvoiceVehicleLine[] {
  return deduplicateInvoiceLinesByVehicle(lines);
}

/**
 * 請求書AIプロンプト（テキストベース抽出仕様）。
 * 詳細は invoice-text-extractor.ts の TEXT_INVOICE_EXTRACTION_PROMPT と同一ルール。
 */
export const OCR_INVOICE_EXTRACTION_PROMPT = `
請求書PDFから抽出した「生テキスト」を解析してください。

【禁止】
- 計算・按分・推測（消費税の逆算などはしない）
- 説明文・Markdown・コードブロック
- 複数台の金額を1オブジェクトに合算すること
- 宛名（加島、御中、様）、合計行を vehicle_number にすること

【やること — テキスト内を文字検索のみ】
1. vendor_name（業者名）を探す
2. 登録番号・車両ナンバー（例: 1577, 5939, 34-88, 京都100き1577）をすべて探す
3. 各車両の「同じ行」または「直後1〜3行」から以下をそのまま抜き出す（1文字も変えない）
   - vehicle_number, repair_type, amount_text, tax_text, common_text, tax_type
4. tax_type は「税込」「税抜」「非課税」「不明」のいずれか
5. 1台につき lines 配列の独立したオブジェクトを1つだけ返す

【返却形式 — JSONのみ】
{
  "vendor_name": "安井自動車",
  "lines": [
    {
      "vehicle_number": "京都100き1577",
      "repair_type": "車検",
      "amount_text": "88,000",
      "tax_text": "",
      "common_text": "43,030",
      "tax_type": "税込"
    }
  ]
}
`.trim();
