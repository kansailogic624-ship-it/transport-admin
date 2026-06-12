/**
 * 車両整備請求書テキスト解析ユーティリティ（全面書き直し版）
 *
 * 設計方針：
 *  1. 行ごとに「キー：値」に分割 → キーをパターンマッチ → 値を個別パーサーで解析
 *  2. 元号（R/H/S + 令和/平成/昭和）→ 西暦への自動変換
 *  3. 金額：カンマ・円・¥・スペースを除去して数値抽出
 *  4. 失敗しても残りフィールドに影響しない（行ごとに独立）
 *
 * 請求書OCRの車両行は maintenance-bill-ocr-summary.ts の「集計4項目モード」を使用。
 * 明細行の1行ずつパースは行わない（vehicle_number / maintenance_type / base_amount / tax_amount のみ）。
 */

import { parseCurrencyInput, safeNumber } from "./currency-format";
import type {
  BillType,
  MaintenanceType,
  VehicleExpenseRecord,
  VehicleMaintenanceBill,
} from "./types";

// ---------------------------------------------------------------------------
// 元号変換
// ---------------------------------------------------------------------------

const ERA_OFFSET: Record<string, number> = {
  令和: 2018, R: 2018, r: 2018,
  平成: 1988, H: 1988, h: 1988,
  昭和: 1925, S: 1925, s: 1925,
};

/**
 * 元号 or 西暦の日付文字列を "YYYY-MM-DD" に変換。
 *
 * 対応入力例:
 *  "R8.6.2"  "R8. 6. 2"  "令和8年6月2日"
 *  "H30.4.1"  "2026-06-02"  "2026年6月2日"
 */
export function parseJapaneseDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  // スペースを除去してから処理
  const s = raw.trim().replace(/\s+/g, "");

  // ─ 略称元号: R8.6.2 / R8/6/2 / R8年6月2日
  const m1 = s.match(/^([RrHhSs])(\d{1,2})[./年](\d{1,2})[./月](\d{1,2})/);
  if (m1) {
    const offset = ERA_OFFSET[m1[1]!.toUpperCase()] ?? ERA_OFFSET[m1[1]!];
    if (offset != null)
      return pad4(offset + Number(m1[2]!), Number(m1[3]!), Number(m1[4]!));
  }

  // ─ 漢字元号: 令和8年6月2日
  const m2 = s.match(/^(令和|平成|昭和)(\d{1,2})[年./](\d{1,2})[月./](\d{1,2})/);
  if (m2) {
    const offset = ERA_OFFSET[m2[1]!];
    if (offset != null)
      return pad4(offset + Number(m2[2]!), Number(m2[3]!), Number(m2[4]!));
  }

  // ─ 西暦: 2026-06-02 / 2026/06/02 / 2026年6月2日
  const m3 = s.match(/^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/);
  if (m3) return pad4(Number(m3[1]!), Number(m3[2]!), Number(m3[3]!));

  return null;
}

/**
 * 請求月（YYYY-MM）の解析。
 *
 * 対応入力例:
 *  "2026年6月度"  "2026年6月"  "R8.5"  "R8.5度"
 *  "令和8年5月度"  "2026-05"  "2026/05"
 *
 * 【重要】「R8.5.1 〜 R8.5.31」のような対象期間文字列が含まれている場合は
 * その開始月を優先して返す（請求年月日より対象期間の方が正確なため）。
 */
export function parseJapaneseBillingMonth(raw: string): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().replace(/\s+/g, "");

  // ─ 対象期間パターン: "R8.5.1" → 2026-05
  const period = s.match(/([RrHhSs]\d{1,2})[./](\d{1,2})[./]\d{1,2}/);
  if (period) {
    const offset = ERA_OFFSET[period[1]![0]!.toUpperCase()] ?? ERA_OFFSET[period[1]![0]!];
    if (offset != null)
      return `${offset + Number(period[1]!.slice(1))}-${String(Number(period[2]!)).padStart(2, "0")}`;
  }

  // ─ 西暦年月: "2026年6月度" / "2026年6月"
  const wy = s.match(/^(\d{4})[年](\d{1,2})[月]/);
  if (wy) return `${wy[1]}-${String(Number(wy[2]!)).padStart(2, "0")}`;

  // ─ 略称元号月: "R8.5" / "R8.5度"
  const em = s.match(/^([RrHhSs])(\d{1,2})[./年](\d{1,2})/);
  if (em) {
    const offset = ERA_OFFSET[em[1]!.toUpperCase()] ?? ERA_OFFSET[em[1]!];
    if (offset != null)
      return `${offset + Number(em[2]!)}-${String(Number(em[3]!)).padStart(2, "0")}`;
  }

  // ─ 漢字元号: "令和8年5月"
  const km = s.match(/^(令和|平成|昭和)(\d{1,2})[年./](\d{1,2})/);
  if (km) {
    const offset = ERA_OFFSET[km[1]!];
    if (offset != null)
      return `${offset + Number(km[2]!)}-${String(Number(km[3]!)).padStart(2, "0")}`;
  }

  // ─ ISO: "2026-06" / "2026/06"
  const iso = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${String(Number(iso[2]!)).padStart(2, "0")}`;

  return null;
}

/** 金額文字列から数値のみ抽出（カンマ・円・¥・全角数字・スペース除去、NaN → 0） */
export function parseAmount(raw: string): number {
  return parseCurrencyInput(raw);
}

// ---------------------------------------------------------------------------
// テキスト全文からの自動抽出（メイン関数）
// ---------------------------------------------------------------------------

export interface ParsedBillText {
  vendorName: string;
  clientName: string;
  billingMonth: string;
  issueDate: string;
  billType: BillType;
  totalAmount: number;
  maintenanceSubtotalExTax: number;
  taxAmount: number;
  expensesSubtotal: number;
  rawText: string;
  /** 税抜・消費税が税込合計からの推測値か */
  taxInferred?: boolean;
}

export type ResolvedBillTaxBreakdown = Partial<ParsedBillText> & {
  taxInferred: boolean;
};

const OCR_AMT_RE =
  /[¥￥]?\s*[1-9]\d{0,2}(?:,\d{3})+|\b[1-9]\d{3,7}\b/g;

/** 税込合計のみ判明時: 税抜＝四捨五入(合計÷1.1)、消費税＝差額 */
export function inferTaxFromInclusiveTotal(total: number): {
  exTax: number;
  tax: number;
} {
  if (total <= 0) return { exTax: 0, tax: 0 };
  const exTax = Math.round(total / 1.1);
  const tax = total - exTax;
  return { exTax, tax };
}

/** 請求書テキストから税抜・消費税・合計を補完・整合 */
export function resolveBillTaxBreakdown(
  parsed: Partial<ParsedBillText>,
): ResolvedBillTaxBreakdown {
  let maintenance = safeNumber(parsed.maintenanceSubtotalExTax);
  let expenses = safeNumber(parsed.expensesSubtotal);
  let tax = safeNumber(parsed.taxAmount);
  let total = safeNumber(parsed.totalAmount);
  let taxInferred = parsed.taxInferred ?? false;

  const exTaxCombined = maintenance + expenses;

  if (total > 0 && exTaxCombined <= 0 && tax <= 0) {
    const inferred = inferTaxFromInclusiveTotal(total);
    maintenance = inferred.exTax;
    expenses = 0;
    tax = inferred.tax;
    taxInferred = true;
  } else if (total > 0 && exTaxCombined > 0 && tax <= 0) {
    const diff = total - exTaxCombined;
    if (diff >= 0) {
      tax = diff;
    } else {
      const inferred = inferTaxFromInclusiveTotal(total);
      maintenance = inferred.exTax;
      expenses = 0;
      tax = inferred.tax;
      taxInferred = true;
    }
  } else if (total > 0 && tax > 0 && exTaxCombined <= 0) {
    const remainder = total - tax;
    if (remainder > 0) {
      maintenance = remainder;
    }
  } else if (exTaxCombined > 0 && tax > 0 && total <= 0) {
    total = exTaxCombined + tax;
  } else if (exTaxCombined > 0 && tax <= 0 && total > 0) {
    tax = Math.max(0, total - exTaxCombined);
    if (tax === 0 && exTaxCombined < total) {
      const inferred = inferTaxFromInclusiveTotal(total);
      maintenance = inferred.exTax;
      expenses = 0;
      tax = inferred.tax;
      taxInferred = true;
    }
  }

  if (!taxInferred && total > 0 && maintenance + expenses + tax > 0) {
    const sum = maintenance + expenses + tax;
    if (Math.abs(sum - total) > 2) {
      total = sum;
    }
  }

  return {
    ...parsed,
    maintenanceSubtotalExTax: maintenance,
    expensesSubtotal: expenses,
    taxAmount: tax,
    totalAmount: total,
    taxInferred,
  };
}

/** キーワード直後の金額を抽出（最初の1件） */
function amountAfterKeyword(text: string, keywordRe: RegExp): number {
  const m = text.match(keywordRe);
  if (!m?.[1]) return 0;
  return parseAmount(m[1]);
}

/** テキスト全体から税区分の集計値を抽出 */
function extractAggregatedTaxFromText(text: string): Partial<ParsedBillText> {
  const normalized = normalizeOcrText(text);
  const lines = normalized
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: Partial<ParsedBillText> = {};

  const fullCompact = normalized.replace(/\s/g, "");

  if (!out.totalAmount) {
    const totalCandidates = [
      amountAfterKeyword(
        fullCompact,
        /御請求(?:総?額|金額)\s*[：:¥￥]?\s*([1-9]\d{0,2}(?:,\d{3})+)/,
      ),
      amountAfterKeyword(
        fullCompact,
        /ご請求(?:総?額|金額)\s*[：:¥￥]?\s*([1-9]\d{0,2}(?:,\d{3})+)/,
      ),
      amountAfterKeyword(
        fullCompact,
        /請求(?:総?額|金額)(?!小計)\s*[：:¥￥]?\s*([1-9]\d{0,2}(?:,\d{3})+)/,
      ),
    ].filter((n) => n > 0);
    if (totalCandidates.length > 0) {
      out.totalAmount = Math.max(...totalCandidates);
    }
  }

  let salesExTaxSum = 0;
  let taxSum = 0;
  let expensesExTax = 0;
  let maintenanceExTax = 0;
  let inMiscSection = false;

  for (const line of lines) {
    if (/諸費用/.test(line) && !/請求小計|合計/.test(line)) {
      inMiscSection = true;
    }
    if (/整備費用|整備費/.test(line) && !/請求小計|合計|消費税/.test(line)) {
      inMiscSection = false;
    }

    if (/今回売上金額|売上金額|本体価格/.test(line)) {
      OCR_AMT_RE.lastIndex = 0;
      const amounts = [...line.matchAll(OCR_AMT_RE)]
        .map((m) => parseAmount(m[0]))
        .filter((n) => n >= 100);
      if (amounts.length > 0) {
        const val = amounts[0]!;
        salesExTaxSum += val;
        if (inMiscSection) expensesExTax += val;
        else maintenanceExTax += val;
      }
      continue;
    }

    if (
      /(?:^|[\s　])消費税|地方消費税/.test(line) &&
      !/税抜|税込|本体|売上/.test(line)
    ) {
      OCR_AMT_RE.lastIndex = 0;
      const amounts = [...line.matchAll(OCR_AMT_RE)]
        .map((m) => parseAmount(m[0]))
        .filter((n) => n > 0 && n < 10_000_000);
      if (amounts.length > 0) {
        taxSum += amounts[0]!;
      }
    }

    if (!out.expensesSubtotal && /諸費用請求小計/.test(line)) {
      const n = amountAfterKeyword(
        line.replace(/\s/g, ""),
        /諸費用請求小計\s*[：:]?\s*([1-9]\d{0,2}(?:,\d{3})+)/,
      );
      if (n > 0) out.expensesSubtotal = n;
    }
  }

  if (salesExTaxSum > 0) {
    if (maintenanceExTax > 0) {
      out.maintenanceSubtotalExTax = maintenanceExTax;
    }
    if (expensesExTax > 0) {
      out.expensesSubtotal = expensesExTax;
    } else if (!out.maintenanceSubtotalExTax) {
      out.maintenanceSubtotalExTax = salesExTaxSum;
    }
  }

  if (taxSum > 0) {
    out.taxAmount = taxSum;
  }

  if (!out.maintenanceSubtotalExTax) {
    const patterns = [
      /(?:小計|税抜|本体価格|整備費用)(?:請求)?\s*[：:]?\s*([1-9]\d{0,2}(?:,\d{3})+)/,
      /整備費用請求小計\s*[：:]?\s*([1-9]\d{0,2}(?:,\d{3})+)/,
    ];
    for (const re of patterns) {
      const n = amountAfterKeyword(fullCompact, re);
      if (n > 0) {
        out.maintenanceSubtotalExTax = n;
        break;
      }
    }
  }

  return out;
}

/** 登録番号・車両番号・車台番号の表記を抽出 */
export function extractRegistrationHintsFromText(text: string): string[] {
  const normalized = normalizeOcrText(text);
  const hints = new Set<string>();

  const patterns = [
    /登録番号\s*[：:]\s*([^\s　,、]+)/g,
    /車両番号\s*[：:]\s*([^\s　,、]+)/g,
    /車台番号\s*[：:]\s*([^\s　,、]+)/g,
    /\b(\d{2,3})[-－](\d{1,4})\b/g,
    /\b(\d{2,3})(\d{4})\b/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized)) !== null) {
      if (m[2] !== undefined) {
        hints.add(`${m[1]}-${m[2]}`);
        hints.add(`${m[1]}${m[2]}`);
      } else if (m[1]) {
        hints.add(m[1].trim());
      }
    }
  }

  return [...hints].filter((h) => h.length >= 3);
}

/** 請求書内の登録番号（34-88 形式）を重複なく列挙（金額の数字分割は含めない） */
export function extractDistinctRegistrationNumbers(text: string): string[] {
  const normalized = normalizeOcrText(text);
  const hints = new Set<string>();

  for (const m of normalized.matchAll(
    /(?:登録番号|車両番号|車番)\s*[：:]?\s*(\d{2,3})[-－](\d{1,4})/g,
  )) {
    hints.add(`${m[1]}-${m[2]}`);
  }

  for (const m of normalized.matchAll(
    /(?:^|[\s　,、])(\d{2,3})[-－](\d{1,4})(?:[\s　,、]|$)/gm,
  )) {
    hints.add(`${m[1]}-${m[2]}`);
  }

  return [...hints].filter(isValidInvoiceVehicleNumber);
}

// ---------------------------------------------------------------------------
// OCRテキスト正規化
// ---------------------------------------------------------------------------

/**
 * Tesseract.js の OCR 出力を正規化して解析精度を向上させる。
 *
 * OCR で起きやすい問題:
 *  - 文字間に不要なスペース: "ダ イ サ ブ" → "ダイサブ"
 *  - 数字間の空白: "3 3 3, 4 3 1" → "333,431"
 *  - 全角数字: "１０１" → "101"
 *  - 誤認識: "ダィサブ" → "ダイサブ"
 *  - カンマ後のスペース: "333, 431" → "333,431"
 */
export function normalizeOcrText(raw: string): string {
  let s = raw;

  // 1. 全角数字 → 半角
  s = s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );

  // 2. カタカナ間の空白除去（OCR で字間スペースが入りやすい）
  //    "ダ イ サ ブ" → "ダイサブ"
  for (let i = 0; i < 4; i++) {
    s = s.replace(/([\u30A0-\u30FF]) ([\u30A0-\u30FF])/g, "$1$2");
  }

  // 3. ひらがな間の空白除去
  for (let i = 0; i < 3; i++) {
    s = s.replace(/([\u3040-\u309F]) ([\u3040-\u309F])/g, "$1$2");
  }

  // 4. 漢字間の空白除去
  for (let i = 0; i < 3; i++) {
    s = s.replace(/([\u4E00-\u9FFF\u3005]) ([\u4E00-\u9FFF\u3005])/g, "$1$2");
  }

  // 5. 数字間の空白除去（複数回）— "1 0 1" → "101", "3 3 3, 4 3 1" → "333,431"
  for (let i = 0; i < 5; i++) {
    s = s.replace(/(\d) (\d)/g, "$1$2");
  }

  // 6. カンマ後スペース除去: "333, 431" → "333,431"
  s = s.replace(/,\s+(\d)/g, ",$1");

  // 7. 車番パターン内スペース統一（数字-かな-数字の間）
  //    "101 あ 600" はこのまま維持（後段の正規表現が \s* で対応）

  // 8. よくある OCR 誤認識を修正
  s = s.replace(/ダィサブ/g, "ダイサブ");
  s = s.replace(/カンサイロジッり/g, "カンサイロジック");
  s = s.replace(/株 式 会 社/g, "株式会社");
  s = s.replace(/株 式会社/g, "株式会社");
  s = s.replace(/株式 会社/g, "株式会社");

  // 9. 「御請求」「ご請求」などキーワードの前後スペース
  s = s.replace(/御 請 求/g, "御請求");
  s = s.replace(/ご 請 求/g, "ご請求");
  s = s.replace(/消 費 税/g, "消費税");
  s = s.replace(/諸 費 用/g, "諸費用");
  s = s.replace(/整 備 費/g, "整備費");
  s = s.replace(/部 品 代/g, "部品代");
  s = s.replace(/技 術 料/g, "技術料");

  // 10. 三菱ふそう系キーワード
  s = s.replace(/三 菱 ふ そ う/g, "三菱ふそう");
  s = s.replace(/近 畿 ふ そ う/g, "近畿ふそう");
  s = s.replace(/車 両 番 号/g, "車両番号");

  return s;
}

/** カタカナ → ひらがな（ナンバープレート用） */
const KATA_TO_HIRA: Record<string, string> = {
  ア: "あ", イ: "い", ウ: "う", エ: "え", オ: "お",
  カ: "か", キ: "き", ク: "く", ケ: "け", コ: "こ",
  サ: "さ", シ: "し", ス: "す", セ: "せ", ソ: "そ",
  タ: "た", チ: "ち", ツ: "つ", テ: "て", ト: "と",
  ナ: "な", ニ: "に", ヌ: "ぬ", ネ: "ね", ノ: "の",
  ハ: "は", ヒ: "ひ", フ: "ふ", ホ: "ほ", マ: "ま",
  ミ: "み", ム: "む", メ: "め", モ: "も",
  ヤ: "や", ユ: "ゆ", ヨ: "よ",
  ラ: "ら", リ: "り", ル: "る", レ: "れ", ロ: "ろ",
  ワ: "わ", ヲ: "を", ン: "ん",
};

/**
 * OCR 誤認識のブレ補正（車番周辺の文字列向け）。
 * 数字位置の O→0, l/I→1, B→8 などを修正し、カタカナをひらがなに統一。
 */
export function fixOcrPlateChars(raw: string): string {
  let s = raw;

  // カタカナ → ひらがな
  s = s.replace(/[ア-ン]/g, (c) => KATA_TO_HIRA[c] ?? c);

  // 車番らしきパターン内の英字誤認識を数字に
  // "1O1" → "101", "8OO" → "800"
  s = s.replace(
    /(\d)[OoＯｏ](\d)/g,
    "$10$2",
  );
  s = s.replace(
    /(\d)[OoＯｏ](\d)/g,
    "$10$2",
  );
  s = s.replace(/[Il|Ｉｌ](\d)/g, "1$1");
  s = s.replace(/(\d)[Il|Ｉｌ]/g, "$11");
  s = s.replace(/(\d)[BbＢｂ](\d)/g, "$18$2");
  // 連番末尾の O → 0（例: 6OO → 600）
  s = s.replace(
    /(\d)([OoＯｏ]{1,3})(?=\s|　|$|[^\dOoＯｏ])/g,
    (_, d: string, os: string) => d + "0".repeat(os.length),
  );

  // ハイフン類を統一（京都-10 → 京都10）
  s = s.replace(/[-－ー‐—]/g, "");

  return s;
}

/** 車番の正規化キー（重複判定用・緩い比較） */
export function normalizePlateKey(plate: string): string {
  return cleanPlateNumber(plate)
    .replace(/[\s　\-－ー]/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

/** 車番文字列のクリーニング */
export function cleanPlateNumber(raw: string): string {
  return raw
    .replace(/^車両番号\s*/g, "")
    .replace(/undefined/g, "")
    .trim();
}

const PLATE_NOISE_WORDS =
  /交換|車検|タイヤ|オイル|請求|金額|番号|合計|小計|技術|部品|諸費|内容|整備|フィルター|点検|修理|作業/;

const DETAIL_PLATE_RE =
  /([一-龠々]{2,6})?\s*(\d{2,3})\s*([ぁ-んァ-ンa-zA-Z]?)\s*(\d{1,4})/;

/** 車番として妥当かの簡易チェック */
export function isPlausiblePlate(plate: string): boolean {
  const v = cleanPlateNumber(plate);
  if (!v || v.length < 4) return false;
  if (PLATE_NOISE_WORDS.test(v)) return false;
  if (!/\d{2,}/.test(v)) return false;
  // 地域+分類番号 or 分類+かな+連番 のどちらか
  if (/^[一-龠々]{2,6}\d{2,3}[ぁ-んァ-ン]?[a-zA-Z]?\d{1,4}$/.test(v)) return true;
  if (/^\d{2,3}[ぁ-んァ-ン][a-zA-Z]?\d{1,4}$/.test(v)) return true;
  if (/^\d{2,3}[ぁ-んァ-ン]?[a-zA-Z]?\d{3,4}$/.test(v)) return true;
  return false;
}

/** 請求書OCRで車両行として採用してよい登録番号か（加島・御中等は除外） */
const NON_VEHICLE_PLATE_PATTERNS = [
  /^加島/,
  /^有限会社/,
  /^株式会社/,
  /御中/,
  /^様$/,
  /^消費税/,
  /^合計/,
  /^小計/,
  /^請求/,
  /^売上/,
  /^諸費/,
  /^整備費/,
  /^部品/,
  /^技術料/,
];

export function isValidInvoiceVehicleNumber(plate: string): boolean {
  const raw = cleanPlateNumber(plate).trim();
  if (!raw || raw.length < 2) return false;

  const compact = raw.replace(/\s/g, "");
  for (const pat of NON_VEHICLE_PLATE_PATTERNS) {
    if (pat.test(compact)) return false;
  }
  if (!/\d/.test(raw)) return false;

  const noSep = compact.replace(/[-－ー]/g, "");

  // 金額と誤認しやすい連続数字（5桁以上・ハイフン/かな/地名なし）は車番にしない
  if (
    /^\d{5,}$/.test(noSep) &&
    !/[一-龠々ぁ-んァ-ン]/.test(raw) &&
    !/[-－]/.test(raw)
  ) {
    return false;
  }

  if (/^\d{2,3}[-－]\d{1,4}$/.test(raw)) return true;
  if (isPlausiblePlate(raw)) return true;

  if (/^\d{2,3}[ぁ-んァ-ン][a-zA-Z]?\d{1,4}$/.test(noSep)) return true;
  if (/^[一-龠々]{2,6}\d{2,3}[ぁ-んァ-ン]?[a-zA-Z]?\d{1,4}$/.test(noSep)) {
    return true;
  }
  return false;
}

/** 宛名・ヘッダー行（車両番号ではない） */
export function isClientOrHeaderLine(line: string): boolean {
  const t = line.trim();
  const c = t.replace(/\s/g, "");
  if (!t) return true;
  if (/^(?:有限会社|株式会社)?加島|加島(?:様|御中)|御中/.test(c)) return true;
  if (/^[^\d]{2,12}様$/.test(t)) return true;
  if (/^(御請求|ご請求|請求書|請求年月|発行日|住所|TEL|FAX|振込)/.test(c)) {
    return true;
  }
  if (/今回売上|売上金額|御買上|課税計|税抜合計|請求小計|請求金額/.test(c)) {
    return true;
  }
  return false;
}

/** 行から登録番号（34-88 等）または有効な車両番号を1つ抽出 */
export function extractRegistrationPlateFromLine(line: string): string {
  const labeled = line.match(
    /(?:登録番号|車両番号|車番)\s*[：:]?\s*(\d{2,3})[-－](\d{1,4})/,
  );
  if (labeled) return `${labeled[1]}-${labeled[2]}`;

  const dash = line.match(/(?:^|[\s　,、])(\d{2,3})[-－](\d{1,4})(?:[\s　,、]|$)/);
  if (dash) return `${dash[1]}-${dash[2]}`;

  const plate = extractLenientPlateFromLine(line);
  return isValidInvoiceVehicleNumber(plate) ? plate : "";
}

/**
 * 登録番号を絶対キーとして1台1行を抽出（加島等の宛名行は無視）。
 * 異なる登録番号の金額を合算しない。
 */
export function parsePerVehicleByRegistration(
  text: string,
  billType: BillType,
): ParsedVehicleEntry[] {
  const rawLines = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lines = rawLines.map((l) => normalizeOcrText(l));
  const results: ParsedVehicleEntry[] = [];
  const seenKeys = new Set<string>();
  const defaultTax = inferDocumentDefaultTaxCategory(text);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const rawLine = rawLines[i]!;
    if (isClientOrHeaderLine(line)) continue;

    const plate = extractRegistrationPlateFromLine(line);
    if (!plate) continue;

    const key = normalizePlateKey(plate);
    if (seenKeys.has(key)) continue;

    const labeled = extractLabeledAmountsFromLine(rawLine);
    let labor = labeled.labor;
    let parts = labeled.parts;
    let common = labeled.common;
    let tax = labeled.consumptionTax;
    let amounts = amountsFromLineText(rawLine);

    if (
      labor + parts + common === 0 &&
      amounts.length === 0 &&
      tax === undefined
    ) {
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
        const nxt = lines[j]!;
        const rawNxt = rawLines[j]!;
        if (isClientOrHeaderLine(nxt)) continue;
        const nxtCompact = nxt.replace(/\s/g, "");
        if (
          /今回売上|売上金額|課税計|税抜|御請求|合計|小計/.test(nxtCompact) &&
          !extractRegistrationPlateFromLine(nxt)
        ) {
          continue;
        }

        const nextPlate = extractRegistrationPlateFromLine(nxt);
        if (nextPlate && normalizePlateKey(nextPlate) !== key) break;

        const nextLabeled = extractLabeledAmountsFromLine(rawNxt);
        labor = labor || nextLabeled.labor;
        parts = parts || nextLabeled.parts;
        common = common || nextLabeled.common;
        if (tax === undefined && nextLabeled.consumptionTax !== undefined) {
          tax = nextLabeled.consumptionTax;
        }
        amounts.push(...amountsFromLineText(rawNxt));
        if (
          labor + parts + common > 0 ||
          amounts.length > 0 ||
          tax !== undefined
        ) {
          break;
        }
      }
    }

    if (labor + parts + common === 0 && amounts.length > 0) {
      if (billType === "部品代") {
        parts = amounts[0] ?? 0;
      } else {
        labor = amounts[0] ?? 0;
      }
      if (amounts.length >= 2 && tax === undefined) {
        const second = amounts[1]!;
        if (second > 0 && second <= (labor + parts + common || amounts[0]!)) {
          tax = second;
        }
      }
    }

    const exTax = labor + parts + common;
    if (exTax <= 0 && tax === undefined) continue;

    results.push(
      finalizeVehicleEntry({
        vehicleNumber: plate,
        workDescription: line
          .replace(LINE_AMOUNT_RE, "")
          .replace(plate, "")
          .trim()
          .slice(0, 40),
        laborFee: billType === "部品代" ? 0 : labor || exTax,
        partsFee: billType === "部品代" ? parts || exTax : parts,
        commonExpense: common,
        consumptionTax: tax,
        maintenanceType: inferMaintenanceTypeFromText(
          [rawLine, rawLines[i + 1], rawLines[i + 2]].filter(Boolean).join(" "),
        ),
        totalAmount: exTax + (tax ?? 0),
        taxCategory: inferTaxCategoryFromText(text, line) ?? defaultTax,
      }),
    );
    seenKeys.add(key);
  }

  return results;
}

/**
 * 緩和チェック: 登録番号風の部分一致（41-79, 3812 等）も車両行として許容。
 */
export function isLenientPlateCandidate(plate: string): boolean {
  const raw = cleanPlateNumber(plate);
  if (!raw || raw.length < 2) return false;
  if (isPlausiblePlate(raw)) return true;
  const v = raw.replace(/[-－ー]/g, "");
  if (/^\d{2,4}$/.test(v)) return true;
  if (/^\d{2,3}[ぁ-んァ-ンa-zA-Z]?\d{0,4}$/.test(v)) return true;
  if (/^[一-龠々]{1,6}\d{2,4}$/.test(v)) return true;
  return false;
}

/** 行内金額: カンマ区切り or 5桁以上の連続数字（88000 等。車番4桁との混同を避ける） */
const LINE_AMOUNT_RE =
  /[¥￥]?\s*[1-9]\d{0,2}(?:,\d{3})+|\b[1-9]\d{4,7}\b/g;

const MIN_LINE_AMOUNT = 100;

function safeParseStep<T>(step: string, fn: () => T, fallback: T): T {
  try {
    const result = fn();
    return result ?? fallback;
  } catch (err) {
    console.error(`[MaintenanceBillParser] ${step} で例外`, err);
    return fallback;
  }
}

function scorePlateMatch(candidate: RegExpMatchArray): number {
  let score = 0;
  if (candidate[1]) score += 10;
  if (candidate[3]) score += 5;
  if (Number(candidate[2]) >= 100) score += 3;
  return score;
}

export function pickBestPlateMatch(line: string, re: RegExp): RegExpMatchArray | null {
  const plateMatches = [...line.matchAll(new RegExp(re.source, "g"))];
  let pm: RegExpMatchArray | null = null;
  let bestScore = -1;
  for (const candidate of plateMatches) {
    const plate = cleanPlateNumber(
      `${candidate[1] ?? ""}${candidate[2]}${candidate[3] ?? ""}${candidate[4]}`,
    );
    if (!isLenientPlateCandidate(plate)) continue;
    const score = scorePlateMatch(candidate);
    if (score >= bestScore) {
      bestScore = score;
      pm = candidate;
    }
  }
  return pm;
}

function amountsFromLineText(s: string, min = MIN_LINE_AMOUNT): number[] {
  LINE_AMOUNT_RE.lastIndex = 0;
  return [...s.matchAll(LINE_AMOUNT_RE)]
    .map((m) => parseAmount(m[0]))
    .filter((n) => n >= min);
}

export type LenientLineAmounts = {
  labor: number;
  parts: number;
  common: number;
  consumptionTax?: number;
};

/** 行テキストから項目名付き金額を抽出（消費税は紙面明記のみ） */
export function extractLabeledAmountsFromLine(line: string): LenientLineAmounts {
  const out: LenientLineAmounts = {
    labor: 0,
    parts: 0,
    common: 0,
  };
  const compact = line.replace(/\s/g, "");

  const labeled: { re: RegExp; field: keyof LenientLineAmounts }[] = [
    { re: /(?:技術料|工賃|工賃部品|整備代|請求金額|御買上|売上)[^0-9]{0,12}([0-9,，]+)/, field: "labor" },
    { re: /(?:部品代|部品費|部品)[^0-9]{0,12}([0-9,，]+)/, field: "parts" },
    { re: /(?:諸費用|外注費|外注|重量税|自賠責|印紙)[^0-9]{0,12}([0-9,，]+)/, field: "common" },
    { re: /(?:消費税|地方消費税)[^0-9]{0,12}([0-9,，]+)/, field: "consumptionTax" },
  ];

  for (const { re, field } of labeled) {
    const m = line.match(re) ?? compact.match(re);
    if (!m?.[1]) continue;
    const n = parseAmount(m[1]);
    if (n <= 0) continue;
    if (field === "consumptionTax") out.consumptionTax = n;
    else out[field] = n;
  }

  if (out.labor + out.parts + out.common === 0) {
    const nums = amountsFromLineText(line);
    if (nums.length >= 3) {
      out.labor = nums[0] ?? 0;
      out.parts = nums[1] ?? 0;
      out.common = nums[2] ?? 0;
      if (nums.length >= 4 && out.consumptionTax === undefined) {
        out.consumptionTax = nums[3];
      }
    } else if (nums.length === 2) {
      out.labor = nums[0] ?? 0;
      if (/消費税|税額|内税/.test(line)) {
        if (out.consumptionTax === undefined) out.consumptionTax = nums[1];
      } else {
        out.common = nums[1] ?? 0;
      }
    } else if (nums.length === 1) {
      out.labor = nums[0] ?? 0;
    }
  }

  return out;
}

/** 行から登録番号・車両番号を緩和抽出 */
export function extractLenientPlateFromLine(line: string): string {
  const regLabel = line.match(
    /(?:登録番号|車両番号|車番)\s*[：:]?\s*([0-9０-９a-zA-Zぁ-んァ-ン\-－ー]+)/,
  );
  if (regLabel?.[1]) return cleanPlateNumber(regLabel[1]);

  const dash = line.match(/\b(\d{2,3})[-－](\d{1,4})\b/);
  if (dash) return `${dash[1]}-${dash[2]}`;

  const pm = pickBestPlateMatch(line, DETAIL_PLATE_RE);
  if (pm) {
    return cleanPlateNumber(
      `${pm[1] ?? ""}${pm[2]}${pm[3] ?? ""}${pm[4]}`,
    );
  }

  const loose = line.match(
    /(?:^|[\s　,、])(\d{2,4})([ぁ-んァ-ンa-zA-Z])?(\d{0,4})?(?=[\s　¥￥,，]|$)/,
  );
  if (loose?.[1]) {
    const plate = `${loose[1]}${loose[2] ?? ""}${loose[3] ?? ""}`;
    if (isLenientPlateCandidate(plate)) return plate;
  }

  return "";
}

// ---------------------------------------------------------------------------
// 業者名・請求書種別の自動判定
// ---------------------------------------------------------------------------

/**
 * テキストの内容から業者名と請求書種別を自動判定する。
 *
 * 判定ルール:
 *  - "ダイサブ" + "部品" が含まれる → 株式会社ダイサブ / 部品代
 *  - "ダイサブ" のみ              → 株式会社ダイサブ / 整備費
 *  - "安井自動車"                  → 安井自動車      / 一括
 *  - それ以外                     → 空文字           / その他
 */
export function detectVendorAndBillType(text: string): {
  vendorName: string;
  billType: BillType;
} {
  // スペースを除去してから判定（OCR で字間スペースが入っていても検出）
  const t = text.replace(/\s/g, "");

  // ダイサブ（OCR誤認識バリアントも含む）
  if (/ダイサブ|ダィサブ|DAISAB|DAISUB/.test(t)) {
    // 「部品」という文字があれば部品代請求書
    if (/部品(?:代|費|請求|明細)|ブヒン|BUHIN/.test(t)) {
      return { vendorName: "株式会社ダイサブ", billType: "部品代" };
    }
    return { vendorName: "株式会社ダイサブ", billType: "整備費" };
  }

  // 安井自動車
  if (/安井自動車|安井じどうしゃ|YASUI/.test(t)) {
    return { vendorName: "安井自動車", billType: "一括" };
  }

  // 三菱ふそう（近畿ふそう含む）
  if (/三菱ふそう|三菱フソウ|近畿ふそう|近畿フソウ|MITSUBISHI|FUSO|ミツビシフソウ/.test(t)) {
    if (/部品(?:代|費)|ブヒン/.test(t)) {
      return { vendorName: "三菱ふそうトラック・バス株式会社", billType: "部品代" };
    }
    return { vendorName: "三菱ふそうトラック・バス株式会社", billType: "一括" };
  }

  // その他のヒューリスティック: "整備費" があれば整備費
  if (/整備費/.test(t) && !result_vendorEmpty(t)) {
    return { vendorName: extractVendorFallback(t), billType: "整備費" };
  }

  return { vendorName: "", billType: "その他" };
}

/** 業者名が「空ではない」かどうかの簡易チェック（ダイサブ/安井以外） */
function result_vendorEmpty(t: string): boolean {
  return !/株式会社|有限会社|合同会社|自動車/.test(t);
}

/** ダイサブ・安井以外の業者名を fallback 抽出 */
function extractVendorFallback(t: string): string {
  const m = t.match(/(?:株式会社|有限会社|合同会社)([^\s請求御合計]{2,15})/);
  return m ? `株式会社${m[1]}` : "";
}

// ---------------------------------------------------------------------------
// 車両行の税区分
// ---------------------------------------------------------------------------

export type VehicleRowTaxCategory = "ex_tax" | "incl_tax" | "exempt";

export const TAX_CATEGORY_OPTIONS: {
  value: VehicleRowTaxCategory;
  label: string;
}[] = [
  { value: "ex_tax", label: "税抜（+10%）" },
  { value: "incl_tax", label: "税込（内税）" },
  { value: "exempt", label: "非課税/諸費用" },
];

export const MAINTENANCE_TYPE_OPTIONS: {
  value: MaintenanceType;
  label: string;
}[] = [
  { value: "車検", label: "車検" },
  { value: "3か月点検（法定）", label: "3か月点検（法定）" },
  { value: "一般整備", label: "一般整備" },
  { value: "その他", label: "その他" },
];

/** 作業内容テキストから整備種別を推測 */
export function inferMaintenanceTypeFromText(text: string): MaintenanceType {
  const t = text.replace(/\s/g, "");
  if (/車検|法定検査|シェイケン/.test(t) && !/[３3][ヶカか]?月/.test(t)) {
    return "車検";
  }
  if (/[３3][ヶカか]月|３ヶ月|3ヶ月|法定点検|法定.*点検/.test(t)) {
    return "3か月点検（法定）";
  }
  if (/一般整備|オイル|タイヤ|消耗品|修理|交換|メンテ/.test(t)) {
    return "一般整備";
  }
  return "その他";
}

/** 税区分に応じた消費税の自動計算値 */
export function suggestRowConsumptionTax(
  labor: number,
  parts: number,
  common: number,
  taxCategory: VehicleRowTaxCategory = "ex_tax",
): number {
  if (taxCategory === "exempt") return 0;
  return computeRowTaxBreakdown(labor, parts, common, taxCategory).tax;
}

/** 税込入力を税抜＋消費税に按分分割 */
export function splitInclusiveAmounts(
  labor: number,
  parts: number,
  common: number,
): {
  laborFee: number;
  partsFee: number;
  commonExpense: number;
  consumptionTax: number;
} {
  const laborN = safeNumber(labor);
  const partsN = safeNumber(parts);
  const commonN = safeNumber(common);
  const incl = laborN + partsN + commonN;
  if (incl <= 0) {
    return { laborFee: 0, partsFee: 0, commonExpense: 0, consumptionTax: 0 };
  }
  const exBase = Math.round(incl / 1.1);
  const tax = incl - exBase;
  const ratio = exBase / incl;
  const laborEx = Math.round(laborN * ratio);
  const partsEx = Math.round(partsN * ratio);
  const commonEx = exBase - laborEx - partsEx;
  return {
    laborFee: laborEx,
    partsFee: partsEx,
    commonExpense: commonEx,
    consumptionTax: tax,
  };
}

/** 請求書表記から行の税区分を推測 */
export function inferTaxCategoryFromText(
  text: string,
  lineContext = "",
): VehicleRowTaxCategory {
  const ctx = `${lineContext} ${text}`.replace(/\s/g, "");
  if (/諸費用計|諸費用|非課税|印紙|重量税|自賠責/.test(ctx) && !/税込|内税/.test(ctx)) {
    return "exempt";
  }
  if (/税込|内税|込み|総額|税込み/.test(ctx)) {
    return "incl_tax";
  }
  if (/税抜|本体|売上金額|御買上|請求金額|整備代|部品代/.test(ctx)) {
    return "ex_tax";
  }
  return "ex_tax";
}

/** 文書全体のデフォルト税区分（業者フォーマット） */
export function inferDocumentDefaultTaxCategory(text: string): VehicleRowTaxCategory {
  const t = text.replace(/\s/g, "");
  if (/安井自動車|安井じどうしゃ/.test(t) && /工賃部品計.*税込|税込.*工賃/.test(t)) {
    return "incl_tax";
  }
  if (/三菱ふそう|近畿ふそう|請求金額.*税抜|整備代.*税抜/.test(t)) {
    return "ex_tax";
  }
  if (/ダイサブ|御買上額|今回売上金額/.test(t)) {
    return "ex_tax";
  }
  return "ex_tax";
}

export type VehicleRowTaxBreakdown = {
  exTaxBase: number;
  tax: number;
  totalIncl: number;
  maintenanceExTax: number;
  expensesExTax: number;
};

/** 税区分に応じて行の税抜・消費税・税込合計を算出 */
export function computeRowTaxBreakdown(
  labor: number,
  parts: number,
  common: number,
  taxCategory: VehicleRowTaxCategory,
): VehicleRowTaxBreakdown {
  const laborN = safeNumber(labor);
  const partsN = safeNumber(parts);
  const commonN = safeNumber(common);
  const inputSum = laborN + partsN + commonN;

  if (inputSum <= 0) {
    return {
      exTaxBase: 0,
      tax: 0,
      totalIncl: 0,
      maintenanceExTax: 0,
      expensesExTax: 0,
    };
  }

  if (taxCategory === "exempt") {
    return {
      exTaxBase: inputSum,
      tax: 0,
      totalIncl: inputSum,
      maintenanceExTax: laborN + partsN,
      expensesExTax: commonN,
    };
  }

  if (taxCategory === "incl_tax") {
    const totalIncl = inputSum;
    const exTaxBase = Math.round(totalIncl / 1.1);
    const tax = totalIncl - exTaxBase;
    const maintInput = laborN + partsN;
    const maintRatio = inputSum > 0 ? maintInput / inputSum : 1;
    const maintenanceExTax = Math.round(exTaxBase * maintRatio);
    const expensesExTax = exTaxBase - maintenanceExTax;
    return { exTaxBase, tax, totalIncl, maintenanceExTax, expensesExTax };
  }

  const exTaxBase = inputSum;
  const tax = Math.round(exTaxBase * 0.1);
  const totalIncl = exTaxBase + tax;
  return {
    exTaxBase,
    tax,
    totalIncl,
    maintenanceExTax: laborN + partsN,
    expensesExTax: commonN,
  };
}

export function computeVehicleRowTotal(
  row: Pick<
    ParsedVehicleEntry,
    "laborFee" | "partsFee" | "commonExpense" | "consumptionTax" | "taxCategory"
  >,
): number {
  const labor = safeNumber(row.laborFee);
  const parts = safeNumber(row.partsFee);
  const common = safeNumber(row.commonExpense);
  const taxCat = row.taxCategory ?? "ex_tax";
  const tax =
    row.consumptionTax !== undefined && row.consumptionTax !== null
      ? safeNumber(row.consumptionTax)
      : suggestRowConsumptionTax(labor, parts, common, taxCat);
  return labor + parts + common + tax;
}

// ---------------------------------------------------------------------------
// 車両別内訳の解析
// ---------------------------------------------------------------------------

/** 車両別内訳の1行分 */
export interface ParsedVehicleEntry {
  vehicleNumber: string;
  workDescription: string;
  /** 技術料・工賃（円） */
  laborFee: number;
  /** 部品代（円） */
  partsFee: number;
  /** 諸費用（円） */
  commonExpense: number;
  /** 行合計（税込・円） */
  totalAmount: number;
  /** 行の税区分（OCR推測 or 手動） */
  taxCategory?: VehicleRowTaxCategory;
  /** 行の消費税額（円）— OCR読取 or 手動上書き */
  consumptionTax?: number;
  /** 整備種別 */
  maintenanceType?: MaintenanceType;
}

function finalizeVehicleEntry(
  entry: Omit<ParsedVehicleEntry, "totalAmount"> & { totalAmount?: number },
): ParsedVehicleEntry {
  let taxCategory = entry.taxCategory ?? "ex_tax";
  let labor = safeNumber(entry.laborFee);
  let parts = safeNumber(entry.partsFee);
  let common = safeNumber(entry.commonExpense);
  let consumptionTax = entry.consumptionTax;

  if (taxCategory === "incl_tax") {
    const split = splitInclusiveAmounts(labor, parts, common);
    labor = split.laborFee;
    parts = split.partsFee;
    common = split.commonExpense;
    consumptionTax = split.consumptionTax;
    taxCategory = "ex_tax";
  }

  if (consumptionTax === undefined || consumptionTax === null) {
    consumptionTax = suggestRowConsumptionTax(labor, parts, common, taxCategory);
  }

  const maintenanceType =
    entry.maintenanceType ??
    inferMaintenanceTypeFromText(entry.workDescription ?? "");

  const totalAmount =
    entry.totalAmount && entry.totalAmount > 0
      ? entry.totalAmount
      : computeVehicleRowTotal({
          laborFee: labor,
          partsFee: parts,
          commonExpense: common,
          consumptionTax,
          taxCategory,
        });

  return {
    ...entry,
    laborFee: labor,
    partsFee: parts,
    commonExpense: common,
    taxCategory,
    consumptionTax,
    maintenanceType,
    totalAmount,
  };
}

/**
 * テキスト（直接貼り付け or OCR 出力）から車両ナンバーごとの費用を抽出する。
 *
 * 対応フォーマット:
 *  ① 1行形式: "京都101あ600　オイル交換　25,000　27,500"
 *  ② 複数行:  "101 あ 600\nオイル交換\n25,000\n27,500"（OCR で起きやすい）
 *  ③ スペースあり車番: "101 あ 600"（OCR で字間スペースが入る）
 *  ④ 地域名なし車番: "101 あ 600"（ダイサブ様スタイル）
 *  ⑤ 地域名あり車番: "京都101あ600"（安井自動車様スタイル）
 */
/** ダイサブ明細: 御買上額（税抜）＋消費税 */
function parseDaisabuDetailLines(text: string): ParsedVehicleEntry[] {
  const compact = text.replace(/\s/g, "");
  if (!/ダ[イィい][サさサ][ブぶブ]|ダィサブ|ダイサブ/.test(compact)) return [];
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  const results: ParsedVehicleEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/合計|小計|請求|売上金額|御請求/.test(line) && !DETAIL_PLATE_RE.test(line)) {
      continue;
    }
    const pm = pickBestPlateMatch(line, DETAIL_PLATE_RE);
    if (!pm) continue;

    const vehicle = cleanPlateNumber(
      `${pm[1] ?? ""}${pm[2]}${pm[3] ?? ""}${pm[4]}`,
    );

    const after = line.slice((pm.index ?? 0) + pm[0].length);
    let amounts = amountsFromLineText(after);

    if (amounts.length === 0) {
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
        const nxt = lines[j]!;
        if (DETAIL_PLATE_RE.test(nxt)) break;
        amounts = amountsFromLineText(nxt);
        if (amounts.length > 0) break;
      }
    }

    if (amounts.length === 0) continue;

    const exTax = amounts[0]!;
    const tax = amounts[1] ?? Math.round(exTax * 0.1);
    const desc = after
      .replace(LINE_AMOUNT_RE, "")
      .replace(/[^\u3040-\u9fff\u30a0-\u30ffa-zA-Z]/g, " ")
      .trim()
      .slice(0, 40);
    const lineContext = `${desc} ${line}`;

    results.push(
      finalizeVehicleEntry({
        vehicleNumber: vehicle,
        workDescription: desc,
        laborFee: exTax,
        partsFee: 0,
        commonExpense: 0,
        consumptionTax: tax,
        maintenanceType: inferMaintenanceTypeFromText(lineContext),
        totalAmount: exTax + tax,
        taxCategory: "ex_tax",
      }),
    );
  }
  return results;
}

/** 安井自動車: 工賃部品計（税込）・諸費用計（税込）— 1台1行 */
function parseYasuiDetailLines(text: string): ParsedVehicleEntry[] {
  const compact = text.replace(/\s/g, "");
  if (!/安井自動車|安井じどうしゃ|YASUI/i.test(compact)) return [];
  const rawLines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  const lines = rawLines.map((l) => normalizeOcrText(l));
  const results: ParsedVehicleEntry[] = [];
  const seenKeys = new Set<string>();
  const docIncl = inferTaxCategoryFromText(text) === "incl_tax";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const rawLine = rawLines[i]!;
    if (isClientOrHeaderLine(line)) continue;
    if (/合計|小計|今回|売上|御請求/.test(line) && !DETAIL_PLATE_RE.test(line)) {
      continue;
    }

    const pm = pickBestPlateMatch(line, DETAIL_PLATE_RE);
    if (!pm) continue;

    const vehicle = cleanPlateNumber(
      `${pm[1] ?? ""}${pm[2]}${pm[3] ?? ""}${pm[4]}`,
    );
    if (!isValidInvoiceVehicleNumber(vehicle)) continue;

    const key = normalizePlateKey(vehicle);
    if (seenKeys.has(key)) continue;

    const after = rawLine.slice((pm.index ?? 0) + pm[0].length);
    const labeled = extractLabeledAmountsFromLine(after || rawLine);
    let amounts = amountsFromLineText(after);

    if (amounts.length === 0) {
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
        const nxt = rawLines[j]!;
        if (DETAIL_PLATE_RE.test(lines[j]!)) break;
        amounts.push(...amountsFromLineText(nxt));
        if (amounts.length > 0) break;
      }
    }

    const laborRaw = labeled.labor || amounts[0] || 0;
    const miscRaw = labeled.common || (amounts.length >= 2 ? amounts[1]! : 0);
    const explicitTax = /消費税|税額/.test(line)
      ? labeled.consumptionTax
      : undefined;

    if (laborRaw + miscRaw <= 0 && explicitTax === undefined) continue;

    const ctx = `${line} ${text.slice(0, 500)}`;
    const workDescription = after
      .replace(LINE_AMOUNT_RE, "")
      .trim()
      .slice(0, 40);
    const isIncl =
      inferTaxCategoryFromText(ctx, line) === "incl_tax" || docIncl;

    let laborFee = laborRaw;
    let partsFee = labeled.parts;
    let commonExpense = miscRaw;
    let consumptionTax = explicitTax;
    let taxCategory: VehicleRowTaxCategory =
      miscRaw > 0 && laborRaw === 0 ? "exempt" : "ex_tax";

    if (isIncl && explicitTax === undefined) {
      let taxSum = 0;
      if (laborRaw > 0) {
        const s = splitInclusiveAmounts(laborRaw, 0, 0);
        laborFee = s.laborFee;
        taxSum += s.consumptionTax;
      }
      if (miscRaw > 0) {
        const s = splitInclusiveAmounts(0, 0, miscRaw);
        commonExpense = s.commonExpense;
        taxSum += s.consumptionTax;
      }
      consumptionTax = taxSum;
      taxCategory = "ex_tax";
    }

    results.push(
      finalizeVehicleEntry({
        vehicleNumber: vehicle,
        workDescription,
        laborFee,
        partsFee,
        commonExpense,
        consumptionTax,
        maintenanceType: inferMaintenanceTypeFromText(`${workDescription} ${rawLine}`),
        taxCategory,
      }),
    );
    seenKeys.add(key);
  }
  return results;
}

/**
 * 最終フォールバック: 書式不問で行単位に車番・金額・種別を緩和抽出。
 * エラーは投げず、取れた行だけ返す（0件でも []）。
 */
export function parseLenientVehicleExtraction(
  text: string,
  billType: BillType,
): ParsedVehicleEntry[] {
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  const results: ParsedVehicleEntry[] = [];
  const defaultTax = inferDocumentDefaultTaxCategory(text);

  for (const line of lines) {
    if (/^(?:合計|小計|御請求|請求総額|消費税合計)/.test(line)) continue;
    if (/^(?:技術料|部品代|諸費用|車番|登録番号)\s*$/i.test(line)) continue;

    const plate = extractLenientPlateFromLine(line);
    if (!plate) continue;

    const labeled = extractLabeledAmountsFromLine(
      plate ? line.replace(plate, " ") : line,
    );
    let labor = labeled.labor;
    let parts = labeled.parts;
    let common = labeled.common;

    if (labor + parts + common === 0) {
      const nums = amountsFromLineText(line);
      if (billType === "部品代") {
        parts = nums[0] ?? 0;
      } else if (billType === "整備費") {
        labor = nums[0] ?? 0;
      } else if (nums.length >= 3) {
        labor = nums[0] ?? 0;
        parts = nums[1] ?? 0;
        common = nums[2] ?? 0;
      } else if (nums.length >= 2) {
        labor = nums[0] ?? 0;
        common = nums[1] ?? 0;
      } else {
        labor = nums[0] ?? 0;
      }
    }

    if (labor + parts + common === 0 && labeled.consumptionTax === undefined) {
      continue;
    }

    const workDescription = line
      .replace(LINE_AMOUNT_RE, "")
      .replace(plate, "")
      .trim()
      .slice(0, 40);

    results.push(
      finalizeVehicleEntry({
        vehicleNumber: plate,
        workDescription,
        laborFee: labor,
        partsFee: parts,
        commonExpense: common,
        consumptionTax: labeled.consumptionTax,
        maintenanceType: inferMaintenanceTypeFromText(line),
        taxCategory: inferTaxCategoryFromText(text, line) ?? defaultTax,
      }),
    );
  }

  return mergeVehicleEntries(results);
}

/**
 * 3社（ダイサブ・安井・三菱ふそう）専用パーサーのみ実行。
 * 超緩和パーサーは使わない（OCR誤検出行の混入を防ぐ）。
 */
export function parseVendorVehicleTable(
  text: string,
  _billType: BillType,
): ParsedVehicleEntry[] {
  return safeParseStep(
    "parseVendorVehicleTable",
    () => {
      const compact = text.replace(/\s/g, "");
      const rawCompact = text.replace(/\s/g, "");
      const results: ParsedVehicleEntry[] = [];

      const isDaisabu =
        /ダ[イィい][サさサ][ブぶブ]|ダィサブ|ダイサブ|DAISAB/i.test(compact) ||
        /ダ[イィい][サさサ][ブぶブ]|ダィサブ|ダイサブ|DAISAB/i.test(rawCompact);
      const isYasui =
        /安井自動車|安井じどうしゃ|YASUI/i.test(compact) ||
        /安井自動車|安井じどうしゃ|YASUI/i.test(rawCompact);
      const isFuso =
        /三菱ふそう|三菱フソウ|近畿ふそう|近畿フソウ|ミツビシフソウ|MITSUBISHI|FUSO/i.test(
          compact,
        ) ||
        /三菱ふそう|三菱フソウ|近畿ふそう|近畿フソウ|ミツビシフソウ|MITSUBISHI|FUSO/i.test(
          rawCompact,
        );

      if (isDaisabu) {
        results.push(...parseDaisabuDetailLines(text));
      }
      if (isYasui) {
        results.push(...parseYasuiDetailLines(text));
      }
      if (isFuso) {
        results.push(...parseFusoVehicleTable(text));
      }

      return mergeVehicleEntries(results);
    },
    [],
  );
}

export function parseVehicleTable(
  text: string,
  billType: BillType,
): ParsedVehicleEntry[] {
  return safeParseStep(
    "parseVehicleTable",
    () => parseVehicleTableInner(text, billType),
    parseLenientVehicleExtraction(text, billType),
  );
}

function parseVehicleTableInner(
  text: string,
  billType: BillType,
): ParsedVehicleEntry[] {
  const normalized = normalizeOcrText(text);
  const fixed = fixOcrPlateChars(normalized);
  const compact = fixed.replace(/\s/g, "");
  const rawCompact = text.replace(/\s/g, "");
  const defaultTax = inferDocumentDefaultTaxCategory(text);

  const isFuso =
    /三菱ふそう|三菱フソウ|近畿ふそう|近畿フソウ|ミツビシフソウ|MITSUBISHI|FUSO/i.test(compact) ||
    /三菱ふそう|三菱フソウ|近畿ふそう|近畿フソウ|ミツビシフソウ|MITSUBISHI|FUSO/i.test(rawCompact);
  const isDaisabu =
    /ダ[イィい][サさサ][ブぶブ]|ダィサブ|ダイサブ|DAISAB/i.test(compact) ||
    /ダ[イィい][サさサ][ブぶブ]|ダィサブ|ダイサブ|DAISAB/i.test(rawCompact);
  const isYasui =
    /安井自動車|安井じどうしゃ|YASUI/i.test(compact) ||
    /安井自動車|安井じどうしゃ|YASUI/i.test(rawCompact);

  const vendorFirst: ParsedVehicleEntry[] = [];
  // 業者専用パーサーは行構造を保つため生テキストを使用（日付と伝票番号の結合を防ぐ）
  if (isDaisabu) {
    vendorFirst.push(
      ...safeParseStep("parseDaisabuDetailLines", () => parseDaisabuDetailLines(text), []),
    );
  }
  if (isYasui) {
    vendorFirst.push(
      ...safeParseStep("parseYasuiDetailLines", () => parseYasuiDetailLines(text), []),
    );
  }

  const vendorParsed = vendorFirst.length > 0;
  const core =
    vendorParsed && (isYasui || isDaisabu || isFuso)
      ? []
      : safeParseStep(
          "parseVehicleTableCore",
          () => parseVehicleTableCore(fixed, billType, defaultTax),
          [],
        );
  const fuso = isFuso
    ? safeParseStep("parseFusoVehicleTable", () => parseFusoVehicleTable(text), [])
    : [];

  const existingKeys = new Set(
    [...vendorFirst, ...core, ...fuso].map((e) =>
      normalizePlateKey(e.vehicleNumber),
    ),
  );

  const ultra = safeParseStep(
    "parseVehicleTableUltraLoose",
    () => parseVehicleTableUltraLoose(fixed, billType, defaultTax),
    [],
  ).filter((e) => {
    const plate = cleanPlateNumber(e.vehicleNumber);
    if (!isLenientPlateCandidate(plate)) return false;
    const key = normalizePlateKey(plate);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });

  const all = [...vendorFirst, ...core, ...fuso, ...ultra];
  if (all.length === 0) {
    all.push(
      ...safeParseStep(
        "parseVehicleTableFallback",
        () => parseVehicleTableFallback(fixed, billType, defaultTax),
        [],
      ),
    );
  }
  if (all.length === 0) {
    console.error(
      "[MaintenanceBillParser] 全パーサーで車両0件 → 緩和抽出にフォールバック",
      { textLength: text.length, preview: text.slice(0, 1500) },
    );
    return parseLenientVehicleExtraction(text, billType);
  }

  return mergeVehicleEntries(
    all.map((e) =>
      finalizeVehicleEntry({
        ...e,
        taxCategory: e.taxCategory ?? defaultTax,
      }),
    ),
  );
}

/** 複数パスで得た車両行をマージ（登録番号キーで重複排除、情報量の多い方を優先） */
export function mergeVehicleEntries(entries: ParsedVehicleEntry[]): ParsedVehicleEntry[] {
  const map = new Map<string, ParsedVehicleEntry>();
  for (const e of entries) {
    const plate = cleanPlateNumber(e.vehicleNumber);
    if (!plate || !isLenientPlateCandidate(plate)) continue;
    const key = normalizePlateKey(plate);
    const cleaned = { ...e, vehicleNumber: plate };
    const existing = map.get(key);
    if (!existing || scoreEntry(cleaned) > scoreEntry(existing)) {
      map.set(key, cleaned);
    }
  }
  return [...map.values()];
}

function scoreEntry(e: ParsedVehicleEntry): number {
  let s = 0;
  if (e.laborFee > 0) s += 2;
  if (e.partsFee > 0) s += 2;
  if (e.commonExpense > 0) s += 1;
  if (e.totalAmount > 0) s += 3;
  if (e.workDescription) s += 1;
  if (/[一-龠]/.test(e.vehicleNumber)) s += 1; // 地域名ありを優先
  return s;
}

/**
 * メイン車両解析ロジック。
 *
 * 【修正済みバグ】
 *  ① 金額収集を「同一行→次行（別車番なら停止）」に限定し、
 *     他車両行の数値を誤集計しないようにした。
 *  ② AMOUNT_RE をカンマ区切り優先にして車番末尾4桁との混同を防止。
 *  ③ totalAmount を最後の金額から正確に取るよう修正。
 *  ④ colOrder "total" 列の値で totalAmount を上書きするよう修正。
 */
function parseVehicleTableCore(
  text: string,
  billType: BillType,
  defaultTax: VehicleRowTaxCategory = "ex_tax",
): ParsedVehicleEntry[] {
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  const results: ParsedVehicleEntry[] = [];

  // 車番パターン（かなは省略可・OCRブレ許容）
  const PLATE_A =
    /([一-龠々]{2,6})\s*(\d{1,3})\s*([あ-ん]?)\s*(\d{1,4})/;
  const PLATE_B =
    /(?:^|[\s　,、])(\d{2,3})\s*([あ-ん]?)\s*(\d{1,4})(?=[\s　¥￥,，]|$)/;

  // 金額パターン: カンマ区切り優先（車番末尾4桁誤検出防止のため4桁単独は除外）
  //   "25,000"  "333,431"  "100,032" → ヒット
  //   "8958" (車番末尾) → ヒットしない（カンマなし4桁なので除外）
  const AMOUNT_RE = /[¥￥]?\s*[1-9]\d{0,2}(?:,\d{3})+/g;

  // ヘッダー行から列順序を検出
  // ※ "諸費用請求小計" などの1キーワードだけ含む小計行を誤検出しないよう、
  //    2種類以上のキーワードを含む行のみをヘッダーと判定する
  let colOrder: ("labor" | "parts" | "expense" | "total")[] = [];
  for (const line of lines) {
    const hasLabor = /技術料|工賃/.test(line);
    const hasParts = /部品代/.test(line);
    const hasExpense = /諸費用/.test(line);
    const hasTotal = /(?:^|[\s　])合計(?:[\s　]|$)|合計金額/.test(line);
    const kwCount = [hasLabor, hasParts, hasExpense, hasTotal].filter(Boolean).length;
    // 2種類以上のキーワードがある行をヘッダーとして認識
    if (kwCount >= 2) {
      if (hasLabor) colOrder.push("labor");
      if (hasParts) colOrder.push("parts");
      if (hasExpense) colOrder.push("expense");
      if (hasTotal) colOrder.push("total");
      break;
    }
  }

  const hasPlate = (s: string) => PLATE_A.test(s) || PLATE_B.test(s);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let vehicleNumber = "";
    let plateEnd = 0;

    const mA = PLATE_A.exec(line);
    if (mA) {
      const kana = (mA[3] ?? "").trim();
      vehicleNumber = `${mA[1]}${mA[2]}${kana}${mA[4]}`;
      plateEnd = (mA.index ?? 0) + mA[0].length;
    } else {
      const mB = PLATE_B.exec(line);
      if (mB) {
        const kana = (mB[2] ?? "").trim();
        vehicleNumber = `${mB[1]}${kana}${mB[3]}`;
        plateEnd = (mB.index ?? 0) + mB[0].length;
      }
    }

    if (!vehicleNumber) continue;

    // 同一行の車番以降から金額を収集
    const afterPlate = line.slice(plateEnd);
    const amounts: number[] = amountsFromText(afterPlate, AMOUNT_RE);

    // 同一行に金額が不足している場合のみ、次行を参照（別車番行になったら停止）
    if (amounts.length < 2) {
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
        const nxt = lines[j]!;
        if (hasPlate(nxt)) break; // 次の車両行 → 停止
        amounts.push(...amountsFromText(nxt, AMOUNT_RE));
        if (amounts.length >= 2) break;
      }
    }

    if (amounts.length === 0) continue;

    let laborFee = 0;
    let partsFee = 0;
    let commonExpense = 0;
    let totalAmount = amounts[amounts.length - 1] ?? 0;

    if (colOrder.length > 0) {
      colOrder.forEach((col, idx) => {
        const val = amounts[idx] ?? 0;
        if (col === "labor") laborFee = val;
        else if (col === "parts") partsFee = val;
        else if (col === "expense") commonExpense = val;
        else if (col === "total") totalAmount = val;
      });
    } else {
      if (billType === "部品代") {
        partsFee = amounts.length >= 2 ? (amounts[amounts.length - 2] ?? 0) : totalAmount;
      } else if (billType === "整備費") {
        laborFee = amounts.length >= 2 ? (amounts[amounts.length - 2] ?? 0) : totalAmount;
      } else {
        if (amounts.length >= 4) {
          laborFee = amounts[0] ?? 0; partsFee = amounts[1] ?? 0; commonExpense = amounts[2] ?? 0;
        } else if (amounts.length === 3) {
          laborFee = amounts[0] ?? 0; partsFee = amounts[1] ?? 0;
        } else if (amounts.length === 2) {
          laborFee = amounts[0] ?? 0;
        }
      }
    }

    const descMatch = afterPlate.match(/^[\s　]*([^\d¥￥,，\s　]{2,20})/);
    const workDescription = descMatch?.[1]?.trim() ?? "";

    const lineTax = inferTaxCategoryFromText(text, line);
    results.push(
      finalizeVehicleEntry({
        vehicleNumber: cleanPlateNumber(vehicleNumber),
        workDescription,
        laborFee,
        partsFee,
        commonExpense,
        totalAmount,
        taxCategory:
          commonExpense > 0 && laborFee + partsFee === 0
            ? "exempt"
            : lineTax !== "ex_tax"
              ? lineTax
              : defaultTax,
      }),
    );
  }

  return results;
}

/** テキストからカンマ区切り金額を抽出 */
function amountsFromText(s: string, re: RegExp, min = 500): number[] {
  re.lastIndex = 0;
  return [...s.matchAll(re)]
    .map((m) => parseAmount(m[0]))
    .filter((n) => n >= min);
}

// ---------------------------------------------------------------------------
// 三菱ふそう（近畿ふそう）専用パーサー
// ---------------------------------------------------------------------------

/**
 * 三菱ふそう請求書の車両番号 + 請求金額（税抜）を抽出。
 *
 * 対応例:
 *  - "京都101あ1234  25,000"
 *  - "車両番号 京都-10-あ-1234  請求金額（税抜） 25,000"
 *  - "京都 10 あ 600   17,500"
 */
function parseFusoVehicleTable(text: string): ParsedVehicleEntry[] {
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  const results: ParsedVehicleEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineClean = line.replace(/^車両番号\s*/, "");
    if (/合計|小計|御請求|請求総額/.test(lineClean) && !DETAIL_PLATE_RE.test(lineClean)) {
      continue;
    }

    const pm = pickBestPlateMatch(lineClean, DETAIL_PLATE_RE);
    if (!pm) continue;

    const vehicle = cleanPlateNumber(
      `${pm[1] ?? ""}${pm[2]}${pm[3] ?? ""}${pm[4]}`,
    );
    if (!isLenientPlateCandidate(vehicle)) continue;

    const after = lineClean.slice((pm.index ?? 0) + pm[0].length);
    const labeled = extractLabeledAmountsFromLine(after || lineClean);
    let amounts = amountsFromLineText(after);

    if (amounts.length === 0) {
      for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
        const nxt = lines[j]!.replace(/^車両番号\s*/, "");
        if (DETAIL_PLATE_RE.test(nxt)) break;
        if (/税抜|請求金額|金額|消費税/.test(nxt) || amounts.length === 0) {
          amounts.push(...amountsFromLineText(nxt));
        }
        if (amounts.length > 0) break;
      }
    }

    const labor = labeled.labor || amounts[0] || 0;
    const parts = labeled.parts || 0;
    const common = labeled.common || 0;
    const explicitTax = labeled.consumptionTax;
    const fallbackAmt = amounts[amounts.length - 1] ?? 0;

    if (labor + parts + common + fallbackAmt <= 0 && explicitTax === undefined) continue;

    const exTax = labor + parts + common > 0 ? labor + parts + common : fallbackAmt;
    let taxAmt = explicitTax;
    if (taxAmt === undefined && amounts.length >= 2) {
      const second = amounts[1]!;
      if (second > 0 && second <= exTax) taxAmt = second;
    }

    results.push(
      finalizeVehicleEntry({
        vehicleNumber: vehicle,
        workDescription: after.replace(LINE_AMOUNT_RE, "").trim().slice(0, 40),
        laborFee: labor || exTax,
        partsFee: parts,
        commonExpense: common,
        consumptionTax: taxAmt,
        maintenanceType: inferMaintenanceTypeFromText(lineClean),
        totalAmount: exTax + (taxAmt ?? 0),
        taxCategory: inferTaxCategoryFromText(text, lineClean),
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// 超緩和パーサー（3〜4桁数字塊を車番候補として強制抽出）
// ---------------------------------------------------------------------------

/**
 * OCR ブレが激しい場合の最終手段。
 * 「3桁〜4桁の数字の塊」を車番の分類番号として拾い、
 * 同一行・次行から金額を引っ張る。
 */
function parseVehicleTableUltraLoose(
  text: string,
  billType: BillType,
  defaultTax: VehicleRowTaxCategory = "ex_tax",
): ParsedVehicleEntry[] {
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  const results: ParsedVehicleEntry[] = [];
  const AMT = /[¥￥]?\s*[1-9]\d{0,2}(?:,\d{3})+|\b[1-9]\d{3,6}\b/g;

  // 超緩い車番: 地域(任意) + 2〜4桁分類 + かな+連番 or 連番のみ
  const ULTRA_SRC =
    "([一-龠々]{2,6})?[\\s　]*(\\d{2,4})(?:[\\s　]*([あ-ん])[\\s　]*(\\d{1,4})|[\\s　]+(\\d{1,4}))?";
  const ULTRA = new RegExp(ULTRA_SRC, "g");
  const ULTRA_LINE = new RegExp(ULTRA_SRC); // test用（g なし）

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^(?:合計|小計|消費税|御請求|請求総額|車番|技術料|部品代)/.test(line)) continue;

    ULTRA.lastIndex = 0;
    let match: RegExpExecArray | null;
    let prevIdx = -1;
    while ((match = ULTRA.exec(line)) !== null) {
      if (match.index === prevIdx && match[0].length === 0) {
        ULTRA.lastIndex++;
        continue;
      }
      prevIdx = match.index;

      const region = match[1] ?? "";
      const cls = match[2]!;
      const kana = match[3] ?? "";
      const serial = match[4] ?? match[5] ?? "";

      // 分類番号が100未満 or 4桁のみで連番なし → 金額の可能性が高いのでスキップ
      const clsNum = Number(cls);
      if (clsNum < 10 || (cls.length === 4 && !serial && !kana && !region)) continue;
      if (!serial && !kana && clsNum > 999) continue;

      const vehicleNumber = serial
        ? `${region}${cls}${kana}${serial}`
        : `${region}${cls}${kana}`;

      const after = line.slice((match.index ?? 0) + match[0].length);
      let amounts = amountsFromText(after, AMT, 500);

      if (amounts.length === 0) {
        for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
          const nxt = lines[j]!;
          if (ULTRA_LINE.test(nxt)) break;
          amounts.push(...amountsFromText(nxt, AMT, 500));
          if (amounts.length > 0) break;
        }
      }

      if (amounts.length === 0) continue;

      const totalAmount = amounts[amounts.length - 1] ?? 0;
      let laborFee = 0;
      let partsFee = 0;
      const feeA = amounts.length >= 2 ? (amounts[amounts.length - 2] ?? 0) : totalAmount;

      if (billType === "部品代") partsFee = feeA;
      else if (billType === "整備費" || billType === "一括") laborFee = feeA;
      else laborFee = amounts[0] ?? totalAmount;

      const plate = cleanPlateNumber(vehicleNumber);
      if (!isLenientPlateCandidate(plate)) continue;

      results.push(
        finalizeVehicleEntry({
          vehicleNumber: plate,
          workDescription: "",
          laborFee,
          partsFee,
          commonExpense: 0,
          totalAmount,
          taxCategory: defaultTax,
        }),
      );
    }
  }

  return results;
}

/**
 * フォールバック: カンマなし金額も許容する緩いパターンで再スキャン。
 * AMOUNT_RE でヒットしなかった請求書（例: 税込金額がカンマなし）向け。
 */
function parseVehicleTableFallback(
  text: string,
  billType: BillType,
  defaultTax: VehicleRowTaxCategory = "ex_tax",
): ParsedVehicleEntry[] {
  const results: ParsedVehicleEntry[] = [];
  const LOOSE_PLATE = /(\d{2,3})\s*([あ-ん])\s*(\d{1,4})/g;
  // フォールバックでは5桁以上の数字も金額として認識
  const LOOSE_AMT = /[1-9]\d{0,2}(?:,\d{3})+|\b[1-9]\d{4,5}\b/g;

  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    LOOSE_PLATE.lastIndex = 0;
    const pm = LOOSE_PLATE.exec(block);
    if (!pm) continue;

    const vehicleNumber = `${pm[1]}${pm[2]}${pm[3]}`;
    const afterPlate = block.slice((pm.index ?? 0) + pm[0].length);
    const amounts = amountsFromText(afterPlate, LOOSE_AMT);
    if (amounts.length === 0) continue;

    const total = amounts[amounts.length - 1] ?? 0;
    const feeA = amounts.length >= 2 ? (amounts[amounts.length - 2] ?? 0) : total;
    results.push(
      finalizeVehicleEntry({
        vehicleNumber,
        workDescription: "",
        laborFee: billType === "部品代" ? 0 : feeA,
        partsFee: billType === "部品代" ? feeA : 0,
        commonExpense: 0,
        totalAmount: total,
        taxCategory: defaultTax,
      }),
    );
  }
  return results;
}

/** 車両別内訳から請求書ヘッダー金額を集計（税区分を考慮） */
export function computeBillTotalsFromVehicles(
  rows: ParsedVehicleEntry[],
): {
  maintenanceSubtotalExTax: number;
  expensesSubtotal: number;
  taxAmount: number;
  totalAmount: number;
} {
  let maintenanceExTax = 0;
  let expensesExTax = 0;
  let taxAmount = 0;
  let totalAmount = 0;

  for (const row of rows) {
    const labor = safeNumber(row.laborFee);
    const parts = safeNumber(row.partsFee);
    const common = safeNumber(row.commonExpense);
    const taxCat = row.taxCategory ?? "ex_tax";
    const tax =
      row.consumptionTax !== undefined && row.consumptionTax !== null
        ? safeNumber(row.consumptionTax)
        : suggestRowConsumptionTax(labor, parts, common, taxCat);

    maintenanceExTax += labor + parts;
    expensesExTax += common;
    taxAmount += tax;
    totalAmount += labor + parts + common + tax;
  }

  return {
    maintenanceSubtotalExTax: safeNumber(maintenanceExTax),
    expensesSubtotal: safeNumber(expensesExTax),
    taxAmount: safeNumber(taxAmount),
    totalAmount: safeNumber(totalAmount),
  };
}

/** ParsedVehicleEntry[] を VehicleExpenseRecord[] に変換 */
export function buildVehicleExpenseRecords(
  entries: ParsedVehicleEntry[] | null | undefined,
  parentBill: VehicleMaintenanceBill,
): VehicleExpenseRecord[] {
  const safeEntries = Array.isArray(entries) ? entries : [];
  return safeEntries.map((e) => ({
    id: crypto.randomUUID(),
    billingMonth: parentBill.billingMonth,
    vendorName: parentBill.vendorName,
    billType: parentBill.billType,
    vehicleNumber: e.vehicleNumber,
    workDescription: e.workDescription,
    laborFee: e.laborFee,
    partsFee: e.partsFee,
    commonExpense: e.commonExpense,
    consumptionTax:
      e.consumptionTax ??
      suggestRowConsumptionTax(
        e.laborFee,
        e.partsFee,
        e.commonExpense,
        e.taxCategory ?? "ex_tax",
      ),
    maintenanceType: e.maintenanceType ?? inferMaintenanceTypeFromText(e.workDescription),
    totalAmount: computeVehicleRowTotal(e),
    parentBillId: parentBill.id,
    createdAt: new Date().toISOString(),
    sourceFileName: parentBill.sourceFileName,
  }));
}

/**
 * 請求書テキストを貼り付けたものから各フィールドを自動抽出する。
 *
 * 処理方針:
 *  ① 各行を「最初のコロン（：or:）」で「キー」と「値」に分割
 *  ② キーを正規表現でフィールドに対応付け
 *  ③ 値を専用パーサー（日付・金額）で解析
 *
 * コロンのない行でも、金額パターン（数字）を含む行から補完的に取得する。
 */
export function parseBillText(text: string): Partial<ParsedBillText> {
  const detected = detectVendorAndBillType(text);
  return safeParseStep("parseBillText", () => parseBillTextInner(text), {
    rawText: text,
    vendorName: detected.vendorName,
    billType: detected.billType,
  });
}

function parseBillTextInner(text: string): Partial<ParsedBillText> {
  const result: Partial<ParsedBillText> = { rawText: text };

  // OCR テキストを正規化してから解析
  const normalized = normalizeOcrText(text);
  const aggregated = extractAggregatedTaxFromText(text);

  // 業者名と種別を先行して自動検出（正規化後テキストを使用）
  const detected = detectVendorAndBillType(normalized);
  if (detected.vendorName) result.vendorName = detected.vendorName;
  result.billType = detected.billType;

  const lines = normalized
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // ── コロン区切りでキーと値に分割 ──────────────────────────────────
    // 全角・半角両方のコロンを検索し、最初に出てきたコロンで分割する
    const colonIdx = findFirstColon(line);

    if (colonIdx >= 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      // 請求元（業者名）
      if (!result.vendorName && /請求元/.test(key)) {
        result.vendorName = val.replace(/\s+/g, "");
        continue;
      }

      // 請求先
      if (!result.clientName && /請求先/.test(key)) {
        result.clientName = val.replace(/\s+/g, "");
        continue;
      }

      // 請求対象月（対象期間の開始月を優先して抽出）
      if (!result.billingMonth && /(?:請求対象月|対象月|請求月|請求書月)/.test(key)) {
        // 行全体から期間パターン（R8.5.1 〜 R8.5.31 など）を探す
        const periodStart = extractPeriodStartMonth(val);
        result.billingMonth = periodStart ?? parseJapaneseBillingMonth(val) ?? "";
        continue;
      }

      // 発行日
      if (!result.issueDate && /(?:請求年月日|発行日|請求日|年月日)/.test(key)) {
        result.issueDate = parseJapaneseDate(val) ?? "";
        continue;
      }

      // 御請求総額
      if (!result.totalAmount && /(?:御請求|ご請求|請求総額|総請求|合計金額)/.test(key)) {
        const n = parseAmount(val);
        if (n > 0) result.totalAmount = n;
        continue;
      }

      // 整備費（税抜）
      if (
        !result.maintenanceSubtotalExTax &&
        /(?:今回売上金額|売上金額|本体価格|税抜|小計|整備費用)/.test(key) &&
        !/税込|消費税/.test(key)
      ) {
        const n = parseAmount(val);
        if (n > 0) result.maintenanceSubtotalExTax = n;
        continue;
      }

      // 消費税
      if (
        !result.taxAmount &&
        /(?:消費税|地方消費税)/.test(key) &&
        !/税抜|税込|本体/.test(key)
      ) {
        const n = parseAmount(val);
        if (n > 0) result.taxAmount = n;
        continue;
      }

      // 諸費用小計
      if (
        !result.expensesSubtotal &&
        /諸費用/.test(key) &&
        !/消費税|税込/.test(key)
      ) {
        const n = parseAmount(val);
        if (n > 0) result.expensesSubtotal = n;
        continue;
      }
    }

    // ── コロンのない行: 金額パターンや日付パターンを補完的に補捉 ──────
    // （例: "¥333,431" だけの行、"333,431円" だけの行）
    if (!result.totalAmount) {
      const m = line.match(/合計[^\d]*([0-9,，０-９]+)円?/);
      if (m) {
        const n = parseAmount(m[1]!);
        if (n > 0) result.totalAmount = n;
      }
    }

    // ── OCR テキスト特有: "御請求総額 333431" のようにスペース区切りのキー行 ──
    if (!result.totalAmount && /御請求|ご請求|請求総額/.test(line)) {
      const m = line.match(OCR_AMT_RE);
      if (m) { const n = parseAmount(m[0]); if (n > 0) result.totalAmount = n; }
    }
    if (
      /消費税|地方消費税/.test(line) &&
      colonIdx < 0 &&
      !/税抜|税込|本体/.test(line)
    ) {
      OCR_AMT_RE.lastIndex = 0;
      const m = line.match(OCR_AMT_RE);
      if (m) {
        const n = parseAmount(m[0]);
        if (n > 0) result.taxAmount = (result.taxAmount ?? 0) + n;
      }
    }
    if (
      /今回売上|売上金額|本体価格|税抜|小計/.test(line) &&
      colonIdx < 0 &&
      !/税込|消費税/.test(line)
    ) {
      OCR_AMT_RE.lastIndex = 0;
      const m = line.match(OCR_AMT_RE);
      if (m) {
        const n = parseAmount(m[0]);
        if (n > 0) {
          result.maintenanceSubtotalExTax =
            (result.maintenanceSubtotalExTax ?? 0) + n;
        }
      }
    }
    if (
      /諸費用/.test(line) &&
      colonIdx < 0 &&
      !/消費税|税込|請求小計/.test(line)
    ) {
      OCR_AMT_RE.lastIndex = 0;
      const m = line.match(OCR_AMT_RE);
      if (m) {
        const n = parseAmount(m[0]);
        if (n > 0) result.expensesSubtotal = n;
      }
    }

    // ── OCR: 元号日付パターン（コロンなし行）──────────────────────
    if (!result.issueDate && /[RrHhSs]\d{1,2}[./年]\d{1,2}[./月]\d{1,2}/.test(line)) {
      const d = parseJapaneseDate(line);
      if (d) result.issueDate = d;
    }
    // 請求月: "YYYY年MM月" などコロンなしで出現
    if (!result.billingMonth) {
      const bm = line.match(/(\d{4})年(\d{1,2})月/);
      if (bm && Number(bm[1]) > 2000) {
        result.billingMonth = `${bm[1]}-${String(Number(bm[2]!)).padStart(2, "0")}`;
      }
    }
  }

  const merged: Partial<ParsedBillText> = {
    ...result,
    totalAmount: result.totalAmount || aggregated.totalAmount,
    maintenanceSubtotalExTax:
      result.maintenanceSubtotalExTax || aggregated.maintenanceSubtotalExTax,
    taxAmount: result.taxAmount || aggregated.taxAmount,
    expensesSubtotal: result.expensesSubtotal || aggregated.expensesSubtotal,
  };

  return resolveBillTaxBreakdown(merged);
}

// ---------------------------------------------------------------------------
// レコード生成
// ---------------------------------------------------------------------------

/** パース結果から VehicleMaintenanceBill オブジェクトを生成 */
export function buildMaintenanceBill(
  parsed: Partial<ParsedBillText>,
  override: Partial<
    Pick<
      VehicleMaintenanceBill,
      | "memo"
      | "sourceFileName"
      | "billType"
      | "id"
      | "createdAt"
      | "ocrOriginalData"
      | "editedData"
    >
  > = {},
): VehicleMaintenanceBill {
  return {
    id: override.id ?? crypto.randomUUID(),
    vendorName: parsed.vendorName ?? "",
    clientName: parsed.clientName ?? "",
    billingMonth: parsed.billingMonth ?? "",
    issueDate: parsed.issueDate ?? "",
    billType: override.billType ?? parsed.billType ?? "その他",
    totalAmount: parsed.totalAmount ?? 0,
    maintenanceSubtotalExTax: parsed.maintenanceSubtotalExTax ?? 0,
    taxAmount: parsed.taxAmount ?? 0,
    expensesSubtotal: parsed.expensesSubtotal ?? 0,
    memo: override.memo ?? "",
    sourceFileName: override.sourceFileName ?? "",
    createdAt: override.createdAt ?? new Date().toISOString(),
    ocrOriginalData: override.ocrOriginalData,
    editedData: override.editedData,
  };
}

// ---------------------------------------------------------------------------
// フォーマット
// ---------------------------------------------------------------------------

/** "2026-05" → "2026年5月度" */
export function formatBillingMonth(ym: string): string {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${y}年${Number(m)}月度`;
}

/** "YYYY-MM-DD" → "2026年6月2日" */
export function formatJapaneseDate(date: string): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  if (!y || !m) return date;
  return d ? `${y}年${Number(m)}月${Number(d)}日` : `${y}年${Number(m)}月`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" を返すゼロ埋め関数 */
function pad4(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 行の中から最初のコロン（全角 U+FF1A または半角 U+003A）の位置を返す。
 * 見つからなければ -1。
 */
function findFirstColon(line: string): number {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === 0xff1a /* ： */ || c === 0x003a /* : */) return i;
  }
  return -1;
}

/**
 * 対象期間文字列（例: "R8.5.1 〜 R8.5.31" / "R8.5.1～R8.5.31"）から
 * 開始月を抽出して "YYYY-MM" で返す。
 */
function extractPeriodStartMonth(text: string): string | null {
  // "R8.5.1" や "R8.5.1〜" などの最初の元号日付を探す
  const m = text.match(/([RrHhSs])(\d{1,2})[./](\d{1,2})[./]\d/);
  if (!m) return null;
  const offset = ERA_OFFSET[m[1]!.toUpperCase()] ?? ERA_OFFSET[m[1]!];
  if (offset == null) return null;
  const year = offset + Number(m[2]!);
  const month = Number(m[3]!);
  return `${year}-${String(month).padStart(2, "0")}`;
}
