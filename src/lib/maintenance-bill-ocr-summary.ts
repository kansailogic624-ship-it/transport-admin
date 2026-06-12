/**
 * 請求書OCR — 集計モード + 車両行正規化
 *
 * AI/OCRレスポンスとTesseractテキストの両方から
 * InvoiceVehicleLine[] に統一してから車両別内訳テーブルへ反映する。
 */

import { safeNumber } from "./currency-format";
import type { BillType } from "./types";
import {
  emptyInvoiceVehicleLine,
  extractInvoiceLinesFromJsonText,
  extractInvoiceMeta,
  filterValidInvoiceVehicleLines,
  mapNormalizedInvoiceLine,
  OCR_INVOICE_EXTRACTION_PROMPT,
  parseAiResponseToVehicleEntries,
  parseInvoiceOcrResponse,
  repairTypeToMaintenanceType,
  toNumber,
  type InvoiceVehicleLine,
} from "./invoice-ocr-normalize";
import {
  mapTextExtractToVehicleEntries,
  parseInvoiceFromPdfText,
  parseTextExtractJsonResponse,
  TEXT_INVOICE_EXTRACTION_PROMPT,
  textExtractToInvoiceLines,
} from "./invoice-text-extractor";
import {
  extractLenientPlateFromLine,
  extractDistinctRegistrationNumbers,
  extractRegistrationHintsFromText,
  inferMaintenanceTypeFromText,
  isLenientPlateCandidate,
  isValidInvoiceVehicleNumber,
  normalizeOcrText,
  normalizePlateKey,
  parseAmount,
  mergeVehicleEntries,
  parsePerVehicleByRegistration,
  parseVendorVehicleTable,
  type ParsedBillText,
  type ParsedVehicleEntry,
} from "./maintenance-bill-parser";

/** @deprecated OCR_INVOICE_EXTRACTION_PROMPT を使用 */
export const OCR_BILL_SUMMARY_EXTRACTION_PROMPT = OCR_INVOICE_EXTRACTION_PROMPT;

export type OcrBillSummaryJson = {
  vehicle_number: string;
  maintenance_type: string;
  base_amount: number;
  tax_amount: number;
};

export {
  OCR_INVOICE_EXTRACTION_PROMPT,
  type InvoiceVehicleLine,
  normalizeInvoiceLines,
  mapNormalizedInvoiceLine,
  toNumber,
  parseInvoiceOcrResponse,
  emptyInvoiceVehicleLine,
} from "./invoice-ocr-normalize";

export { TEXT_INVOICE_EXTRACTION_PROMPT } from "./invoice-text-extractor";

/** 単一オブジェクト・配列・null を必ず配列に正規化 */
export function coerceToArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** @deprecated parseInvoiceOcrResponse を使用 */
export function coerceOcrResponseToSummaries(response: unknown): OcrBillSummaryJson[] {
  return parseInvoiceOcrResponse(response).map(invoiceLineToSummaryJson);
}

/** @deprecated mapNormalizedInvoiceLine 経由で補完済み */
export function normalizeOcrBillSummary(
  raw: Partial<OcrBillSummaryJson> | null | undefined,
): OcrBillSummaryJson {
  const mapped = mapNormalizedInvoiceLine(raw ?? {});
  return invoiceLineToSummaryJson(mapped);
}

function invoiceLineToSummaryJson(line: InvoiceVehicleLine): OcrBillSummaryJson {
  return {
    vehicle_number: line.vehicle_number,
    maintenance_type: line.repair_type || "その他",
    base_amount: line.base_amount,
    tax_amount: line.tax_amount,
  };
}

function summaryJsonToInvoiceLine(
  summary: OcrBillSummaryJson,
  vendorName?: string,
): InvoiceVehicleLine {
  const base = toNumber(summary.base_amount);
  const tax = toNumber(summary.tax_amount);
  return {
    vehicle_number: summary.vehicle_number ?? "",
    repair_type: summary.maintenance_type ?? "",
    base_amount: base,
    tax_amount: tax,
    total_amount: base + tax,
    vendor_name: vendorName,
  };
}

/** ParsedVehicleEntry の配列を保証 */
export function ensureParsedVehicleEntries(
  value: ParsedVehicleEntry | ParsedVehicleEntry[] | null | undefined,
): ParsedVehicleEntry[] {
  if (value == null) return [];
  const arr = coerceToArray(value);
  return arr.filter(
    (v): v is ParsedVehicleEntry => v != null && typeof v === "object",
  );
}

const LINE_AMOUNT_RE =
  /[¥￥]?\s*[1-9]\d{0,2}(?:,\d{3})+|\b[1-9]\d{4,7}\b/g;

const DETAIL_PLATE_RE =
  /([一-龠々]{2,6})?\s*(\d{2,3})\s*([ぁ-んァ-ンa-zA-Z]?)\s*(\d{1,4})/;

const BASE_AMOUNT_KEYWORDS = [
  /整備費用請求小計|整備費用小計/,
  /課税計|税抜合計|税抜金額|本体価格合計/,
  /今回売上金額|売上金額|本体価格/,
  /御買上額|御買上金額/,
  /請求金額.*税抜|整備代.*税抜/,
  /小計/,
];

function amountsFromLine(s: string, min = 100): number[] {
  LINE_AMOUNT_RE.lastIndex = 0;
  return [...s.matchAll(LINE_AMOUNT_RE)]
    .map((m) => parseAmount(m[0]))
    .filter((n) => n >= min);
}

const SUMMARY_LINE_RE =
  /整備費用請求小計|整備費用小計|諸費用請求小計|御請求(?:総)?額|ご請求(?:総)?額|今回売上金額|売上金額|課税計|税抜合計|税抜金額|本体価格|御買上|請求金額.*税抜|整備代.*税抜|(?:^|[\s　])消費税|地方消費税/;

export function isInvoiceDetailLine(line: string): boolean {
  if (SUMMARY_LINE_RE.test(line)) return false;

  const compact = line.replace(/\s/g, "");
  if (DETAIL_PLATE_RE.test(line) && amountsFromLine(line).length >= 1) {
    return true;
  }
  if (/\b\d{2,3}[-－]\d{1,4}\b/.test(line) && amountsFromLine(line).length >= 1) {
    return true;
  }
  if (amountsFromLine(line).length >= 3) return true;
  if (/オイル|タイヤ|交換|フィルター|パッド|バッテリー/.test(compact) && amountsFromLine(line).length >= 1) {
    return true;
  }
  return false;
}

export function extractPrimaryVehicleNumber(text: string): string {
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/登録番号|車両番号|車番/.test(line)) {
      const labeled = line.match(
        /(?:登録番号|車両番号|車番)\s*[：:]?\s*([0-9０-９a-zA-Zぁ-んァ-ン\-－ー]+)/,
      );
      if (labeled?.[1]) return labeled[1].replace(/[：:]/g, "").trim();
      const p = extractLenientPlateFromLine(line);
      if (p) return p;
    }
  }

  for (const line of lines.slice(0, 20)) {
    if (isInvoiceDetailLine(line)) continue;
    if (/^(合計|小計|消費税|御請求|請求総額|技術料|部品代)/.test(line)) continue;
    const p = extractLenientPlateFromLine(line);
    if (p && isLenientPlateCandidate(p)) return p;
  }

  const hints = extractRegistrationHintsFromText(text);
  return hints[0] ?? "";
}

export function extractBillBaseAmount(text: string): number {
  const lines = normalizeOcrText(text)
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const pat of BASE_AMOUNT_KEYWORDS) {
    for (const line of lines) {
      if (!pat.test(line)) continue;
      if (isInvoiceDetailLine(line)) continue;
      if (/諸費用/.test(line) && !/請求小計/.test(line)) continue;
      const nums = amountsFromLine(line);
      if (nums.length > 0) return nums[nums.length - 1]!;
    }
  }

  return 0;
}

export function extractBillTaxAmount(text: string): number {
  const lines = normalizeOcrText(text)
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  let taxSum = 0;
  let found = false;

  for (const line of lines) {
    if (!/(?:^|[\s　])消費税|地方消費税/.test(line)) continue;
    if (/税抜|税込|本体|売上/.test(line)) continue;
    if (isInvoiceDetailLine(line)) continue;

    const nums = amountsFromLine(line);
    if (nums.length > 0) {
      taxSum += nums[0]!;
      found = true;
    }
  }

  return found ? taxSum : 0;
}

export function extractOcrBillSummary(
  text: string,
  billHeader?: Partial<ParsedBillText>,
): OcrBillSummaryJson {
  const vehicle_number = extractPrimaryVehicleNumber(text);
  const maintenance_type = inferMaintenanceTypeFromText(text);

  let base_amount = extractBillBaseAmount(text);
  if (base_amount <= 0) {
    base_amount = safeNumber(billHeader?.maintenanceSubtotalExTax);
  }

  let tax_amount = extractBillTaxAmount(text);
  if (tax_amount <= 0) {
    tax_amount = safeNumber(billHeader?.taxAmount);
  }

  return normalizeOcrBillSummary({
    vehicle_number,
    maintenance_type,
    base_amount,
    tax_amount,
  });
}

/** ParsedVehicleEntry → InvoiceVehicleLine */
export function parsedVehicleEntryToInvoiceLine(
  entry: ParsedVehicleEntry,
  vendorName?: string,
): InvoiceVehicleLine {
  const labor = toNumber(entry.laborFee);
  const parts = toNumber(entry.partsFee);
  const common = toNumber(entry.commonExpense);
  const tax = toNumber(entry.consumptionTax);
  const base = labor + parts + common;
  const total = toNumber(entry.totalAmount) || base + tax;

  return {
    vehicle_number: entry.vehicleNumber ?? "",
    repair_type:
      entry.maintenanceType ??
      inferMaintenanceTypeFromText(entry.workDescription ?? ""),
    base_amount: base,
    tax_amount: tax,
    total_amount: total,
    vendor_name: vendorName,
  };
}

/** InvoiceVehicleLine → 車両別内訳行 */
export function invoiceLineToVehicleEntry(
  line: InvoiceVehicleLine,
  billType: BillType,
): ParsedVehicleEntry {
  const normalized = mapNormalizedInvoiceLine(line);
  const base = toNumber(normalized.base_amount);
  const tax = toNumber(normalized.tax_amount);
  const laborFee = billType === "部品代" ? 0 : base;
  const partsFee = billType === "部品代" ? base : 0;
  const maintenanceType = repairTypeToMaintenanceType(normalized.repair_type);

  return {
    vehicleNumber: normalized.vehicle_number,
    workDescription: normalized.repair_type,
    laborFee,
    partsFee,
    commonExpense: 0,
    consumptionTax: tax,
    maintenanceType,
    totalAmount:
      toNumber(normalized.total_amount) > 0
        ? toNumber(normalized.total_amount)
        : base + tax,
    taxCategory: "ex_tax",
  };
}

/** @deprecated invoiceLineToVehicleEntry を使用 */
export function ocrSummaryToVehicleEntry(
  summary: OcrBillSummaryJson,
  billType: BillType,
): ParsedVehicleEntry {
  return invoiceLineToVehicleEntry(summaryJsonToInvoiceLine(summary), billType);
}

function mergeInvoiceLinesSameVehicle(
  primary: InvoiceVehicleLine,
  fallback: InvoiceVehicleLine,
): InvoiceVehicleLine {
  const pKey = normalizePlateKey(primary.vehicle_number);
  const fKey = normalizePlateKey(fallback.vehicle_number);
  if (pKey && fKey && pKey !== fKey) {
    return primary;
  }

  const repair_type =
    primary.repair_type && primary.repair_type !== "その他"
      ? primary.repair_type
      : fallback.repair_type || primary.repair_type;

  return mapNormalizedInvoiceLine({
    vehicle_number: primary.vehicle_number || fallback.vehicle_number,
    repair_type,
    base_amount:
      fallback.base_amount > 0 ? fallback.base_amount : primary.base_amount,
    tax_amount: fallback.tax_amount > 0 ? fallback.tax_amount : primary.tax_amount,
    total_amount:
      fallback.total_amount > 0 ? fallback.total_amount : primary.total_amount,
    vendor_name: primary.vendor_name || fallback.vendor_name,
  });
}

function entriesToInvoiceLines(
  entries: ParsedVehicleEntry[],
  vendorName: string,
): InvoiceVehicleLine[] {
  return filterValidInvoiceVehicleLines(
    entries.map((e) => parsedVehicleEntryToInvoiceLine(e, vendorName)),
  );
}

/** 登録番号ヘッダー（38-12 等）とフルナンバーが共存する場合、ヘッダーだけの行を除外 */
function dropFleetRegistrationHeaders(
  entries: ParsedVehicleEntry[],
): ParsedVehicleEntry[] {
  const hasFullPlate = entries.some(
    (e) => /[一-龠々]/.test(e.vehicleNumber) || /[ぁ-んァ-ン]/.test(e.vehicleNumber),
  );
  if (!hasFullPlate || entries.length <= 1) return entries;
  return entries.filter((e) => {
    const v = e.vehicleNumber.trim();
    if (/^\d{2,3}[-－]\d{1,4}$/.test(v)) return false;
    return true;
  });
}

/**
 * OCRテキストから InvoiceVehicleLine[] を抽出。
 * 登録番号（34-88 等）をキーに1台1行。加島等の宛名行は無視。
 */
export function extractInvoiceLinesFromText(
  text: string,
  billType: BillType,
  billHeader?: Partial<ParsedBillText>,
): InvoiceVehicleLine[] {
  const vendorName = billHeader?.vendorName ?? "";

  let perVehicle: ParsedVehicleEntry[] = [];
  let vendorEntries: ParsedVehicleEntry[] = [];
  try {
    perVehicle = ensureParsedVehicleEntries(
      parsePerVehicleByRegistration(text, billType),
    );
  } catch (err) {
    console.error("[MaintenanceBillOCR] parsePerVehicleByRegistration 失敗", err);
  }
  try {
    vendorEntries = ensureParsedVehicleEntries(
      parseVendorVehicleTable(text, billType),
    );
  } catch (err) {
    console.error("[MaintenanceBillOCR] parseVendorVehicleTable 失敗", err);
  }

  const mergedEntries = dropFleetRegistrationHeaders(
    mergeVehicleEntries(
      [...perVehicle, ...vendorEntries].filter((e) =>
        isValidInvoiceVehicleNumber(e.vehicleNumber ?? ""),
      ),
    ),
  );

  if (mergedEntries.length > 1) {
    return entriesToInvoiceLines(mergedEntries, vendorName);
  }

  const regHints = extractDistinctRegistrationNumbers(text);

  if (mergedEntries.length === 1 && regHints.length <= 1) {
    const summaryLine = summaryJsonToInvoiceLine(
      extractOcrBillSummary(text, billHeader),
      vendorName,
    );
    const vehicleLine = parsedVehicleEntryToInvoiceLine(
      mergedEntries[0]!,
      vendorName,
    );
    if (regHints.length === 1 && !vehicleLine.vehicle_number) {
      vehicleLine.vehicle_number = regHints[0]!;
    }
    const merged = mergeInvoiceLinesSameVehicle(vehicleLine, summaryLine);
    if (
      merged.base_amount > 0 ||
      merged.tax_amount > 0 ||
      isValidInvoiceVehicleNumber(merged.vehicle_number)
    ) {
      return filterValidInvoiceVehicleLines([merged]);
    }
  }

  if (mergedEntries.length === 1) {
    return entriesToInvoiceLines(mergedEntries, vendorName);
  }

  const regHintsLater = extractDistinctRegistrationNumbers(text);

  // 登録番号が1台のみのときだけ請求書全体の集計を1行に落とす
  if (regHintsLater.length <= 1) {
    const summaryLine = summaryJsonToInvoiceLine(
      extractOcrBillSummary(text, billHeader),
      vendorName,
    );
    if (
      summaryLine.base_amount > 0 ||
      summaryLine.tax_amount > 0 ||
      isValidInvoiceVehicleNumber(summaryLine.vehicle_number)
    ) {
      if (regHintsLater.length === 1 && !summaryLine.vehicle_number) {
        summaryLine.vehicle_number = regHintsLater[0]!;
      }
      return filterValidInvoiceVehicleLines([summaryLine]);
    }
  }

  return [];
}

export type MaintenanceBillOcrResult = {
  lines: InvoiceVehicleLine[];
  vehicles: ParsedVehicleEntry[];
  hasData: boolean;
  /** text: PDF生テキストのピンポイント抽出 / ai: LLM JSON / legacy: 旧ルールベース */
  extractionMode?: "text" | "ai" | "legacy";
};

function hasMeaningfulVehicleData(
  vehicles: ParsedVehicleEntry[],
  lines: InvoiceVehicleLine[],
): boolean {
  if (
    vehicles.some(
      (v) =>
        isValidInvoiceVehicleNumber(v.vehicleNumber ?? "") &&
        (toNumber(v.laborFee) +
          toNumber(v.partsFee) +
          toNumber(v.commonExpense) +
          toNumber(v.consumptionTax) >
          0),
    )
  ) {
    return true;
  }
  return lines.some(
    (l) =>
      isValidInvoiceVehicleNumber(l.vehicle_number) &&
      (l.base_amount > 0 || l.tax_amount > 0 || l.total_amount > 0),
  );
}

/**
 * 請求書解析のメイン入口。
 * PDF生テキストのピンポイント抽出を主軸とし、AI/旧パーサーはフォールバック。
 */
export function parseMaintenanceBillOcr(
  text: string,
  billType: BillType,
  billHeader?: Partial<ParsedBillText>,
  aiResponse?: unknown,
): MaintenanceBillOcrResult {
  const vendorName = billHeader?.vendorName ?? "";

  try {
    let lines: InvoiceVehicleLine[] = [];
    let vehicles: ParsedVehicleEntry[] = [];
    let extractionMode: MaintenanceBillOcrResult["extractionMode"] = "text";

    if (aiResponse != null) {
      const fromAiEntries = parseAiResponseToVehicleEntries(aiResponse, billType);
      if (fromAiEntries.length > 0) {
        vehicles = ensureParsedVehicleEntries(fromAiEntries);
        lines = vehicles.map((e) =>
          parsedVehicleEntryToInvoiceLine(e, extractInvoiceMeta(aiResponse).vendor_name || vendorName),
        );
        extractionMode = "ai";
      } else {
        const fromAiText = parseTextExtractJsonResponse(aiResponse);
        if (fromAiText.length > 0) {
          vehicles = mapTextExtractToVehicleEntries(fromAiText, billType).filter((e) =>
            isValidInvoiceVehicleNumber(e.vehicleNumber ?? ""),
          );
          lines = textExtractToInvoiceLines(fromAiText);
          extractionMode = "ai";
        } else {
          const fromAiLegacy = parseInvoiceOcrResponse(aiResponse, vendorName);
          if (fromAiLegacy.length > 0) {
            lines = fromAiLegacy;
            vehicles = ensureParsedVehicleEntries(
              lines
                .filter((line) => isValidInvoiceVehicleNumber(line.vehicle_number))
                .map((line) => invoiceLineToVehicleEntry(line, billType)),
            );
            extractionMode = "ai";
          }
        }
      }
    }

    if (vehicles.length === 0) {
      const textParse = parseInvoiceFromPdfText(text, billType);
      if (textParse.vehicles.length > 0) {
        vehicles = ensureParsedVehicleEntries(textParse.vehicles);
        lines = filterValidInvoiceVehicleLines(textParse.invoiceLines);
        extractionMode = "text";
      }
    }

    if (vehicles.length === 0) {
      const fromJson = extractInvoiceLinesFromJsonText(text);
      const fromLegacy = extractInvoiceLinesFromText(text, billType, billHeader);

      if (fromJson.length > 0) {
        lines = fromJson;
      } else if (fromLegacy.length > 0) {
        lines = fromLegacy;
      }

      if (lines.length === 1 && fromLegacy.length === 1) {
        lines = [mergeInvoiceLinesSameVehicle(lines[0]!, fromLegacy[0]!)];
      }

      lines = filterValidInvoiceVehicleLines(lines);
      vehicles = ensureParsedVehicleEntries(
        lines
          .filter((line) => isValidInvoiceVehicleNumber(line.vehicle_number))
          .map((line) => invoiceLineToVehicleEntry(line, billType)),
      );
      extractionMode = "legacy";
    }

    const hasMeaningfulData = hasMeaningfulVehicleData(vehicles, lines);

    if (!hasMeaningfulData) {
      console.error(
        "[MaintenanceBillOCR] 解析結果がほぼ空 — 手動入力用の空行を用意",
        { billType, textLength: text?.length ?? 0, preview: text?.slice(0, 2000) },
      );
    } else {
      console.info("[MaintenanceBillOCR] 車両行を抽出", {
        mode: extractionMode,
        count: vehicles.length,
        lines,
      });
    }

    return {
      lines,
      vehicles,
      hasData: hasMeaningfulData,
      extractionMode,
    };
  } catch (err) {
    console.error("[MaintenanceBillOCR] parseMaintenanceBillOcr 例外", {
      error: err,
      billType,
      textPreview: text?.slice(0, 2000),
    });
    return {
      lines: [],
      vehicles: [],
      hasData: false,
    };
  }
}

/** @deprecated parseMaintenanceBillOcr を使用 */
export function buildVehicleRowsFromBillSummary(
  text: string,
  billType: BillType,
  billHeader?: Partial<ParsedBillText>,
  aiResponse?: unknown,
): ParsedVehicleEntry[] {
  const result = parseMaintenanceBillOcr(text, billType, billHeader, aiResponse);
  if (result.vehicles.length > 0) return result.vehicles;
  return [invoiceLineToVehicleEntry(emptyInvoiceVehicleLine(), billType)];
}
