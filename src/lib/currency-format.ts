/**
 * 金額表示・入力の共通ユーティリティ
 * - 3桁カンマ区切り
 * - NaN / null / undefined の安全なフォールバック（0）
 */

/** 任意の値を安全な数値に変換（NaN → 0） */
export function safeNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 金額文字列から数値を抽出（カンマ・円・¥・全角数字対応、NaN → 0） */
export function parseCurrencyInput(raw: string): number {
  if (!raw?.trim()) return 0;
  const normalized = raw.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  const digits = normalized.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

/** 3桁カンマ区切り（円記号なし）例: 333,431 */
export function formatNumber(value: unknown): string {
  const n = safeNumber(value);
  return n.toLocaleString("ja-JP");
}

/** 円表示（3桁カンマ付き）例: ¥333,431 */
export function formatYen(value: unknown, opts?: { zeroAsDash?: boolean }): string {
  const n = safeNumber(value);
  if (opts?.zeroAsDash && n === 0) return "—";
  return `¥${n.toLocaleString("ja-JP")}`;
}

/** 0・空・NaN は「—」、それ以外は ¥カンマ付き（一覧表示向け） */
export function formatYenOrDash(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  const n = safeNumber(value);
  if (n <= 0) return "—";
  return formatYen(n);
}

/** 入力欄用: 数値をカンマ付き文字列に（0は空文字） */
export function formatCurrencyInputValue(value: unknown): string {
  const n = safeNumber(value);
  if (n === 0) return "";
  return formatNumber(n);
}
