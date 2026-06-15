const ISO_BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 営業日として有効な YYYY-MM-DD 形式か */
export function isIsoBusinessDate(value: string): boolean {
  return ISO_BUSINESS_DATE_RE.test(value.trim());
}

/** 社員名照合用: 半角・全角スペースを除去 */
export function normalizePersonName(name: string): string {
  return name.replace(/[\s\u3000]+/g, "").trim();
}

export function parseExcelDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + value * 86_400_000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const text = String(value).trim();
  if (!text) return "";
  const slash = text.match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (slash) {
    return `${slash[1]}-${String(slash[2]).padStart(2, "0")}-${String(slash[3]).padStart(2, "0")}`;
  }
  return text;
}

export function formatDisplayDate(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}/${m[2]}/${m[3]}`;
}
