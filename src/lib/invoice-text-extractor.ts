/**
 * 請求書 — テキストベース高精度解析（PDF生テキスト → 車両行）
 *
 * 画像OCRや複雑な推測は行わず、抽出テキスト内の文字列を
 * ピンポイント検索して車両ごとの行データを組み立てる。
 * （将来 LLM に渡すプロンプト仕様と同一ルールで実装）
 */

import { toNumber, type InvoiceVehicleLine } from "./invoice-ocr-normalize";
import type { BillType, MaintenanceType } from "./types";
import {
  cleanPlateNumber,
  extractLenientPlateFromLine,
  extractRegistrationPlateFromLine,
  inferMaintenanceTypeFromText,
  inferTaxCategoryFromText,
  isClientOrHeaderLine,
  isValidInvoiceVehicleNumber,
  normalizeOcrText,
  normalizePlateKey,
  pickBestPlateMatch,
  mergeVehicleEntries,
  splitInclusiveAmounts,
  type ParsedVehicleEntry,
  type VehicleRowTaxCategory,
} from "./maintenance-bill-parser";

function dropFleetRegistrationHeaders(
  entries: ParsedVehicleEntry[],
): ParsedVehicleEntry[] {
  const hasFullPlate = entries.some(
    (e) =>
      /[一-龠々]/.test(e.vehicleNumber) ||
      /[ぁ-んァ-ン]/.test(e.vehicleNumber),
  );
  if (!hasFullPlate || entries.length <= 1) return entries;
  return entries.filter((e) => {
    const v = e.vehicleNumber.trim();
    if (/^\d{2,3}[-－]\d{1,4}$/.test(v)) return false;
    return true;
  });
}

/** LLM / テキスト解析共通 — 出力JSON仕様 */
export const TEXT_INVOICE_EXTRACTION_PROMPT = `
請求書PDFから抽出した「生テキスト」を解析してください。

【禁止】
- 計算・按分・推測（消費税の逆算などはしない）
- 説明文・Markdown・コードブロック

【やること — テキスト内を文字検索のみ】
1. 登録番号・車台番号・車両ナンバー（例: 1577, 5939, 3488, 7545, 京都100き1577, 34-88）をすべて探す
2. 各車両について「同じ行」または「直後1〜3行」のブロックから以下をそのまま抜き出す（1文字も変えない）
   - vehicle_number: 車両番号文字列
   - repair_type: 利用内容（車検、3ヵ月点検、一般整備など）
   - amount_text: 金額文字列（例: "17,369" "100,032"）
   - tax_text: 消費税の明記があればその文字列（なければ ""）
   - common_text: 諸費用の明記があればその文字列（なければ ""）

【返却形式 — JSONのみ】
{
  "lines": [
    {
      "vehicle_number": "京都100き1577",
      "repair_type": "車検",
      "amount_text": "88,000",
      "tax_text": "",
      "common_text": "43,030",
      "tax_inclusive": true
    }
  ]
}
`.trim();

/** テキストから機械的に抜いた1行（金額は文字列のまま） */
export type TextExtractedVehicleLine = {
  vehicle_number: string;
  repair_type: string;
  amount_text: string;
  tax_text: string;
  common_text: string;
  tax_inclusive: boolean;
  source_lines: string[];
};

const DETAIL_PLATE_RE =
  /([一-龠々]{2,6})?\s*(\d{2,3})\s*([ぁ-んァ-ンa-zA-Z]?)\s*(\d{1,4})/;

const LITERAL_AMOUNT_RE =
  /[¥￥]?\s*([1-9]\d{0,2}(?:,\d{3})+|\d{4,7})/g;

const HEADER_SKIP_RE =
  /^(合計|小計|御請求|請求総額|今回売上|売上金額|課税計|税抜|本体価格|御買上|請求書|発行日|請求年月)/;

const SUMMARY_LINE_RE =
  /今回売上|売上金額|御買上|課税計|請求総額|御請求額|合計金額|請求金額合計/;

function splitRawLines(text: string): string[] {
  return text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
}

/** 行から車両アンカー（登録番号・ナンバー）を1つ抽出 */
function findVehicleAnchor(rawLine: string, normLine: string): string {
  const fromReg = extractRegistrationPlateFromLine(normLine);
  if (fromReg && isValidInvoiceVehicleNumber(fromReg)) return fromReg;

  const pm = pickBestPlateMatch(normLine, DETAIL_PLATE_RE);
  if (pm) {
    const plate = cleanPlateNumber(
      `${pm[1] ?? ""}${pm[2]}${pm[3] ?? ""}${pm[4]}`,
    );
    if (isValidInvoiceVehicleNumber(plate)) return plate;
  }

  const fromLenient = extractLenientPlateFromLine(normLine);
  if (isValidInvoiceVehicleNumber(fromLenient)) return fromLenient;

  return "";
}

/** 金額文字列をテキストからそのまま抽出（カンマ保持） */
export function extractLiteralAmountStrings(text: string): string[] {
  const results: string[] = [];
  LITERAL_AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LITERAL_AMOUNT_RE.exec(text)) !== null) {
    const raw = m[1] ?? m[0];
    if (toNumber(raw) >= 100) results.push(raw.replace(/[¥￥\s]/g, ""));
  }
  return results;
}

/** ナンバー構成数字（1577, 100 等）を金額候補から除外 */
function excludePlateComponentAmounts(
  amounts: string[],
  vehicle: string,
): string[] {
  const plateParts = new Set<string>();
  const tail = vehicle.match(/[ぁ-んァ-ンa-zA-Z]?(\d{1,4})$/);
  if (tail?.[1]) plateParts.add(tail[1]);
  const mid = vehicle.match(/(\d{2,3})[ぁ-んァ-ンa-zA-Z]/);
  if (mid?.[1]) plateParts.add(mid[1]);
  const reg = vehicle.match(/^(\d{2,3})[-－](\d{1,4})$/);
  if (reg) {
    plateParts.add(reg[1]!);
    plateParts.add(reg[2]!);
  }

  return amounts.filter((a) => {
    const bare = a.replace(/,/g, "");
    if (plateParts.has(bare)) return false;
    return toNumber(a) >= 100;
  });
}

/** 車両行の直後ブロック（次の車両が出るまで最大3行） */
function collectVehicleBlock(
  rawLines: string[],
  startIdx: number,
  vehicleKey: string,
): string[] {
  const block = [rawLines[startIdx]!];
  for (let j = startIdx + 1; j <= Math.min(startIdx + 3, rawLines.length - 1); j++) {
    const raw = rawLines[j]!;
    const norm = normalizeOcrText(raw);
    if (isClientOrHeaderLine(norm) || HEADER_SKIP_RE.test(norm)) continue;
    if (SUMMARY_LINE_RE.test(norm)) break;

    const nextVehicle = findVehicleAnchor(raw, norm);
    if (nextVehicle && normalizePlateKey(nextVehicle) !== vehicleKey) break;

    if (/^消費税|^地方消費税/.test(norm)) break;

    block.push(raw);
    if (/諸費用|工賃|部品/.test(norm) && !findVehicleAnchor(raw, norm)) break;
  }
  return block;
}

function labeledAmountFromBlock(
  block: string[],
  label: RegExp,
): string {
  for (const line of block) {
    const m = line.match(label);
    if (m?.[1]) return m[1].replace(/[¥￥\s]/g, "");
  }
  return "";
}

/**
 * PDF/貼り付けテキストから車両行をピンポイント抽出（計算なし）。
 */
export function extractVehicleLinesFromPdfText(
  text: string,
): TextExtractedVehicleLine[] {
  if (!text?.trim()) return [];

  const rawLines = splitRawLines(text);
  const docIncl = /工賃部品計.*税込|税込.*工賃|諸費用計.*税込/i.test(
    text.replace(/\s/g, ""),
  );
  const results: TextExtractedVehicleLine[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]!;
    const norm = normalizeOcrText(raw);
    if (isClientOrHeaderLine(norm) || HEADER_SKIP_RE.test(norm)) continue;

    const vehicle = findVehicleAnchor(raw, norm);
    if (!vehicle) continue;

    const key = normalizePlateKey(vehicle);
    if (seen.has(key)) continue;

    const block = collectVehicleBlock(rawLines, i, key);
    const blockText = block.join(" ");
    const allAmounts = excludePlateComponentAmounts(
      extractLiteralAmountStrings(blockText),
      vehicle,
    );

    const taxText = labeledAmountFromBlock(
      block.slice(0, 1),
      /(?:消費税|地方消費税)\s*[：:]?\s*([0-9,，]+)/,
    );
    const commonText = labeledAmountFromBlock(
      block,
      /(?:諸費用|重量税|自賠責)\s*[：:]?\s*([0-9,，]+)/,
    );

    let amountText = "";
    const workAmounts = allAmounts.filter((a) => {
      if (taxText && a === taxText) return false;
      if (commonText && a === commonText) return false;
      return true;
    });
    if (workAmounts.length > 0) {
      amountText = workAmounts[0]!;
    }
    const commonFromAmounts =
      !commonText && workAmounts.length > 1 ? workAmounts[1]! : commonText;

    const repairType = inferMaintenanceTypeFromText(blockText);
    const lineIncl =
      docIncl || /税込|内税/.test(blockText) || inferTaxCategoryFromText(text, blockText) === "incl_tax";

    if (!amountText && !taxText && !commonText) continue;

    results.push({
      vehicle_number: vehicle,
      repair_type: repairType,
      amount_text: amountText,
      tax_text: taxText,
      common_text: commonFromAmounts,
      tax_inclusive: lineIncl,
      source_lines: block,
    });
    seen.add(key);
  }

  return results;
}

/** AI/JSONレスポンス → TextExtractedVehicleLine[] */
export function parseTextExtractJsonResponse(response: unknown): TextExtractedVehicleLine[] {
  if (response == null) return [];
  try {
    let payload: unknown = response;
    if (typeof payload === "string") {
      payload = JSON.parse(payload.trim()) as unknown;
    }
    if (typeof payload !== "object" || payload === null) return [];
    const obj = payload as Record<string, unknown>;
    const lines = Array.isArray(obj.lines)
      ? obj.lines
      : Array.isArray(obj.items)
        ? obj.items
        : Array.isArray(payload)
          ? payload
          : [payload];

    return lines
      .filter((l) => l != null && typeof l === "object")
      .map((l) => {
        const row = l as Record<string, unknown>;
        return {
          vehicle_number: String(row.vehicle_number ?? row.vehicleNumber ?? "").trim(),
          repair_type: String(
            row.repair_type ?? row.maintenance_type ?? row.description ?? "",
          ).trim(),
          amount_text: String(
            row.amount_text ?? row.amount ?? row.base_amount ?? row.laborFee ?? "",
          ).trim(),
          tax_text: String(row.tax_text ?? row.tax_amount ?? row.tax ?? "").trim(),
          common_text: String(
            row.common_text ?? row.common_expense ?? row.commonExpense ?? "",
          ).trim(),
          tax_inclusive: Boolean(row.tax_inclusive ?? row.taxInclusive),
          source_lines: [],
        };
      })
      .filter((l) => l.vehicle_number || l.amount_text);
  } catch {
    return [];
  }
}

/**
 * テキスト抽出行 → 車両別内訳行（数値化・税込逆算はここで実施 — AIに計算させない）
 */
export function mapTextExtractToVehicleEntries(
  lines: TextExtractedVehicleLine[],
  billType: BillType,
): ParsedVehicleEntry[] {
  const entries: ParsedVehicleEntry[] = [];

  for (const raw of lines) {
    if (!raw.vehicle_number && !raw.amount_text) continue;

    const laborRaw = toNumber(raw.amount_text);
    const taxRaw = toNumber(raw.tax_text);
    const commonRaw = toNumber(raw.common_text);
    const repairType = (raw.repair_type ||
      inferMaintenanceTypeFromText(raw.source_lines.join(" "))) as MaintenanceType;

    let laborFee = billType === "部品代" ? 0 : laborRaw;
    let partsFee = billType === "部品代" ? laborRaw : 0;
    let commonExpense = commonRaw;
    let consumptionTax: number | undefined = taxRaw > 0 ? taxRaw : undefined;
    let taxCategory: VehicleRowTaxCategory =
      commonRaw > 0 && laborRaw === 0 ? "exempt" : "ex_tax";

    if (raw.tax_inclusive && consumptionTax === undefined && laborRaw > 0) {
      // 諸費用（重量税等）は非課税のため税込逆算の対象外
      const split = splitInclusiveAmounts(laborFee, partsFee, 0);
      laborFee = split.laborFee;
      partsFee = split.partsFee;
      consumptionTax = split.consumptionTax;
      taxCategory = commonRaw > 0 ? "exempt" : "ex_tax";
    } else if (consumptionTax === undefined && laborFee + partsFee + commonExpense > 0) {
      consumptionTax = 0;
    }

    const exTax = laborFee + partsFee + commonExpense;
    if (exTax <= 0 && (consumptionTax ?? 0) <= 0) continue;

    entries.push({
      vehicleNumber: raw.vehicle_number,
      workDescription: raw.repair_type || repairType,
      laborFee,
      partsFee,
      commonExpense,
      consumptionTax,
      maintenanceType: repairType,
      totalAmount: exTax + (consumptionTax ?? 0),
      taxCategory,
    });
  }

  return entries;
}

export function textExtractToInvoiceLines(
  lines: TextExtractedVehicleLine[],
): InvoiceVehicleLine[] {
  return lines.map((raw) => ({
    vehicle_number: raw.vehicle_number,
    repair_type: raw.repair_type,
    base_amount: toNumber(raw.amount_text),
    tax_amount: toNumber(raw.tax_text),
    total_amount:
      toNumber(raw.amount_text) +
      toNumber(raw.tax_text) +
      toNumber(raw.common_text),
    vendor_name: undefined,
  }));
}

export type TextParseResult = {
  rawLines: TextExtractedVehicleLine[];
  vehicles: ParsedVehicleEntry[];
  invoiceLines: InvoiceVehicleLine[];
};

/** テキストベース解析のメイン入口 */
export function parseInvoiceFromPdfText(
  text: string,
  billType: BillType,
  aiResponse?: unknown,
): TextParseResult {
  const fromAi = parseTextExtractJsonResponse(aiResponse);
  const fromText = extractVehicleLinesFromPdfText(text);
  const rawLines = fromAi.length > 0 ? fromAi : fromText;
  const vehicles = dropFleetRegistrationHeaders(
    mergeVehicleEntries(
      mapTextExtractToVehicleEntries(rawLines, billType).filter((e) =>
        isValidInvoiceVehicleNumber(e.vehicleNumber ?? ""),
      ),
    ),
  );

  return {
    rawLines,
    vehicles,
    invoiceLines: textExtractToInvoiceLines(rawLines),
  };
}
