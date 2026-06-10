/**
 * 車両整備請求書テキスト解析ユーティリティ（全面書き直し版）
 *
 * 設計方針：
 *  1. 行ごとに「キー：値」に分割 → キーをパターンマッチ → 値を個別パーサーで解析
 *  2. 元号（R/H/S + 令和/平成/昭和）→ 西暦への自動変換
 *  3. 金額：カンマ・円・¥・スペースを除去して数値抽出
 *  4. 失敗しても残りフィールドに影響しない（行ごとに独立）
 */

import { parseCurrencyInput, safeNumber } from "./currency-format";
import type { BillType, VehicleExpenseRecord, VehicleMaintenanceBill } from "./types";

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

/** 車番として妥当かの簡易チェック */
export function isPlausiblePlate(plate: string): boolean {
  const v = cleanPlateNumber(plate);
  if (!v || v.length < 4) return false;
  if (PLATE_NOISE_WORDS.test(v)) return false;
  if (!/\d{2,}/.test(v)) return false;
  // 地域+分類番号 or 分類+かな+連番 のどちらか
  if (/^[一-龠々]{2,6}\d{2,3}[あ-ん]?\d{1,4}$/.test(v)) return true;
  if (/^\d{2,3}[あ-ん]\d{1,4}$/.test(v)) return true;
  if (/^\d{2,3}[あ-ん]?\d{3,4}$/.test(v)) return true;
  return false;
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
  /** 行合計（円） */
  totalAmount: number;
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
export function parseVehicleTable(
  text: string,
  billType: BillType,
): ParsedVehicleEntry[] {
  const normalized = normalizeOcrText(text);
  const fixed = fixOcrPlateChars(normalized);
  const compact = fixed.replace(/\s/g, "");

  const isFuso = /三菱ふそう|近畿ふそう|ミツビシフソウ/.test(compact);

  const core = parseVehicleTableCore(fixed, billType);
  const fuso = isFuso ? parseFusoVehicleTable(fixed) : [];
  const existingKeys = new Set(
    [...core, ...fuso].map((e) => normalizePlateKey(e.vehicleNumber)),
  );

  const ultra = parseVehicleTableUltraLoose(fixed, billType).filter((e) => {
    const plate = cleanPlateNumber(e.vehicleNumber);
    if (!isPlausiblePlate(plate)) return false;
    const key = normalizePlateKey(plate);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });

  const all = [...core, ...fuso, ...ultra];
  if (all.length === 0) all.push(...parseVehicleTableFallback(fixed, billType));

  return mergeVehicleEntries(all);
}

/** 複数パスで得た車両行をマージ（緩い車番キーで重複排除、情報量の多い方を優先） */
function mergeVehicleEntries(entries: ParsedVehicleEntry[]): ParsedVehicleEntry[] {
  const map = new Map<string, ParsedVehicleEntry>();
  for (const e of entries) {
    const plate = cleanPlateNumber(e.vehicleNumber);
    if (!plate || !isPlausiblePlate(plate)) continue;
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

    results.push({
      vehicleNumber: cleanPlateNumber(vehicleNumber),
      workDescription,
      laborFee,
      partsFee,
      commonExpense,
      totalAmount,
    });
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

  const PLATE = /([一-龠々]{2,6})?\s*(\d{1,3})\s*([あ-ん]?)\s*(\d{1,4})/;
  const AMT = /[¥￥]?\s*[1-9]\d{0,2}(?:,\d{3})+|\b[1-9]\d{3,6}\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineClean = line.replace(/^車両番号\s*/, "");
    if (/合計|小計|消費税|御請求|請求総額/.test(lineClean) && !PLATE.test(lineClean)) continue;

    const m = PLATE.exec(lineClean);
    if (!m || !m[2]) continue;

    const region = m[1] ?? "";
    const kana = m[3] ?? "";
    const vehicleNumber = `${region}${m[2]}${kana}${m[4]}`;
    if (vehicleNumber.replace(/\d/g, "").length === 0 && !region) continue;

    const after = lineClean.slice((m.index ?? 0) + m[0].length);
    let amounts = amountsFromText(after, AMT, 500);

    // 税抜金額が次行にある場合
    if (amounts.length === 0) {
      for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
        const nxt = lines[j]!.replace(/^車両番号\s*/, "");
        if (PLATE.test(nxt)) break;
        if (/税抜|請求金額|金額/.test(nxt) || amounts.length === 0) {
          amounts.push(...amountsFromText(nxt, AMT, 500));
        }
        if (amounts.length > 0) break;
      }
    }

    if (amounts.length === 0) continue;

    const totalAmount = amounts[amounts.length - 1] ?? 0;
    const laborFee = amounts.length >= 2 ? (amounts[0] ?? 0) : totalAmount;

    const plate = cleanPlateNumber(vehicleNumber);
    if (!isPlausiblePlate(plate)) continue;

    results.push({
      vehicleNumber: plate,
      workDescription: "",
      laborFee,
      partsFee: 0,
      commonExpense: 0,
      totalAmount,
    });
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
      if (!isPlausiblePlate(plate)) continue;

      results.push({
        vehicleNumber: plate,
        workDescription: "",
        laborFee,
        partsFee,
        commonExpense: 0,
        totalAmount,
      });
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
    results.push({
      vehicleNumber,
      workDescription: "",
      laborFee: billType === "部品代" ? 0 : feeA,
      partsFee: billType === "部品代" ? feeA : 0,
      commonExpense: 0,
      totalAmount: total,
    });
  }
  return results;
}

/** 車両別内訳から請求書ヘッダー金額を集計 */
export function computeBillTotalsFromVehicles(
  rows: ParsedVehicleEntry[],
): {
  maintenanceSubtotalExTax: number;
  expensesSubtotal: number;
  taxAmount: number;
  totalAmount: number;
} {
  const labor = rows.reduce((s, r) => s + safeNumber(r.laborFee), 0);
  const parts = rows.reduce((s, r) => s + safeNumber(r.partsFee), 0);
  const common = rows.reduce((s, r) => s + safeNumber(r.commonExpense), 0);
  const lineTotals = rows.reduce((s, r) => {
    const laborP = safeNumber(r.laborFee);
    const partsP = safeNumber(r.partsFee);
    const commonP = safeNumber(r.commonExpense);
    const t = safeNumber(r.totalAmount) > 0
      ? safeNumber(r.totalAmount)
      : laborP + partsP + commonP;
    return s + t;
  }, 0);
  const maintenance = labor + parts;
  const tax = Math.max(0, lineTotals - maintenance - common);
  return {
    maintenanceSubtotalExTax: safeNumber(maintenance),
    expensesSubtotal: safeNumber(common),
    taxAmount: safeNumber(tax),
    totalAmount: safeNumber(lineTotals),
  };
}

/** ParsedVehicleEntry[] を VehicleExpenseRecord[] に変換 */
export function buildVehicleExpenseRecords(
  entries: ParsedVehicleEntry[],
  parentBill: VehicleMaintenanceBill,
): VehicleExpenseRecord[] {
  return entries.map((e) => ({
    id: crypto.randomUUID(),
    billingMonth: parentBill.billingMonth,
    vendorName: parentBill.vendorName,
    billType: parentBill.billType,
    vehicleNumber: e.vehicleNumber,
    workDescription: e.workDescription,
    laborFee: e.laborFee,
    partsFee: e.partsFee,
    commonExpense: e.commonExpense,
    totalAmount: e.totalAmount,
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
  const result: Partial<ParsedBillText> = { rawText: text };

  // OCR テキストを正規化してから解析
  const normalized = normalizeOcrText(text);

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

      // 整備費（税抜）- "今回売上金額（税抜）" や "整備費用請求小計" など
      if (
        !result.maintenanceSubtotalExTax &&
        /(?:今回売上金額|売上金額|整備費用)/.test(key)
      ) {
        const n = parseAmount(val);
        if (n > 0) result.maintenanceSubtotalExTax = n;
        continue;
      }

      // 消費税
      if (!result.taxAmount && /消費税/.test(key)) {
        const n = parseAmount(val);
        if (n > 0) result.taxAmount = n;
        continue;
      }

      // 諸費用小計
      if (!result.expensesSubtotal && /諸費用/.test(key)) {
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
    // ※ \d{1,3}(?:,\d{3})+ は "26,031" のような2桁先頭もヒット
    const OCR_AMT_RE = /[1-9]\d{0,2}(?:,\d{3})+|\b\d{4,7}\b/;
    if (!result.totalAmount && /御請求|ご請求|請求総額/.test(line)) {
      const m = line.match(OCR_AMT_RE);
      if (m) { const n = parseAmount(m[0]); if (n > 0) result.totalAmount = n; }
    }
    if (!result.taxAmount && /消費税/.test(line) && colonIdx < 0) {
      const m = line.match(OCR_AMT_RE);
      if (m) { const n = parseAmount(m[0]); if (n > 0) result.taxAmount = n; }
    }
    if (!result.maintenanceSubtotalExTax && /今回売上|売上金額|整備費/.test(line) && colonIdx < 0) {
      const m = line.match(OCR_AMT_RE);
      if (m) { const n = parseAmount(m[0]); if (n > 0) result.maintenanceSubtotalExTax = n; }
    }
    if (!result.expensesSubtotal && /諸費用/.test(line) && colonIdx < 0) {
      const m = line.match(OCR_AMT_RE);
      if (m) { const n = parseAmount(m[0]); if (n > 0) result.expensesSubtotal = n; }
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

  return result;
}

// ---------------------------------------------------------------------------
// レコード生成
// ---------------------------------------------------------------------------

/** パース結果から VehicleMaintenanceBill オブジェクトを生成 */
export function buildMaintenanceBill(
  parsed: Partial<ParsedBillText>,
  override: Partial<Pick<VehicleMaintenanceBill, "memo" | "sourceFileName" | "billType">>,
): VehicleMaintenanceBill {
  return {
    id: crypto.randomUUID(),
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
    createdAt: new Date().toISOString(),
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
