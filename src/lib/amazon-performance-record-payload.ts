/**
 * Amazon実績のクラウド経費テーブル用ペイロード整形
 */

/** 金額を Firestore 保存用の整数文字列へ（NaN・負数を吸収） */
export function sanitizeAmazonMoneyField(value: unknown): string {
  if (value == null || value === "") return "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "0";
    return String(Math.max(0, Math.round(value)));
  }
  const text = String(value).replace(/,/g, "").trim();
  if (!text) return "0";
  const n = Number(text);
  if (!Number.isFinite(n)) return "0";
  return String(Math.max(0, Math.round(n)));
}

function sanitizeTextField(value: unknown, maxLen = 500): string {
  const text = String(value ?? "")
    .replace(/\u0000/g, "")
    .trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

/** 傭車独自情報を備考へ集約 */
export function buildPartnerAmazonMemoFallback(input: {
  companyName: string;
  payment: unknown;
  diff: unknown;
  revenue?: unknown;
  routeLabel?: string;
  memo?: string;
}): string {
  const parts: string[] = [];
  const company = sanitizeTextField(input.companyName, 80);
  const payment = sanitizeAmazonMoneyField(input.payment);
  const diff = sanitizeAmazonMoneyField(input.diff);
  const revenue = input.revenue != null ? sanitizeAmazonMoneyField(input.revenue) : "";

  if (company) parts.push(`会社名：${company}`);
  if (revenue && revenue !== "0") parts.push(`売上：${revenue}円`);
  if (payment !== "0") parts.push(`支払：${payment}円`);
  if (diff !== "0") parts.push(`差異：${diff}円`);
  const route = sanitizeTextField(input.routeLabel, 60);
  if (route) parts.push(`便名：${route}`);

  const base = sanitizeTextField(input.memo, 300);
  const summary = parts.join("、");
  if (base && summary) return `${summary}／${base}`;
  return summary || base;
}
