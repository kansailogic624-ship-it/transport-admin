/**
 * Amazon実績: 自社組織名の名寄せ（カンロジ ↔ カンサイロジック）
 */

import type { DailyRecord } from "./types";

/** 自社の正式表示名（FM・Excel 名寄せ後の統一表記） */
export const OWN_COMPANY_CANONICAL_NAME = "カンサイロジック";

const OWN_COMPANY_MARKERS = [
  "カンロジ",
  "カンサイロジック",
  "カンサイロジ",
  "kanlogi",
  "kansailogic",
];

function safeStr(value: string | null | undefined): string {
  return value == null ? "" : String(value);
}

/** 会社名照合用（空白・全角英数・法人格を正規化） */
export function normalizeCompanyNameKey(raw: string): string {
  return raw
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[\s\u3000]/g, "")
    .replace(/^(株式会社|（株）|\(株\)|㈱)/, "")
    .replace(/(株式会社|（株）|\(株\)|㈱)$/, "")
    .toLowerCase();
}

/** Excel / FM 会社名が自社（カンサイロジック系）かどうか */
export function isOwnCompanyName(companyName: string | null | undefined): boolean {
  const n = normalizeCompanyNameKey(safeStr(companyName));
  if (!n) return false;
  return OWN_COMPANY_MARKERS.some((m) => n.includes(normalizeCompanyNameKey(m)));
}

/**
 * 自社組織名を内部・表示用の統一表記へ名寄せ。
 * カンロジ / カンサイロジック / 株式会社カンサイロジック → カンサイロジック
 */
export function normalizeOwnCompanyName(
  companyName: string | null | undefined,
): string {
  const raw = safeStr(companyName).trim();
  if (!raw) return "";
  if (isOwnCompanyName(raw)) return OWN_COMPANY_CANONICAL_NAME;
  return raw;
}

function isOwnFmRecord(record: DailyRecord): boolean {
  return record.operationType !== "partner";
}

/** FMレコードから統一会社名を推定（自社便はカンサイロジック） */
export function getRecordUnifiedCompanyName(record: DailyRecord): string {
  if (isOwnFmRecord(record)) return OWN_COMPANY_CANONICAL_NAME;
  const partner = record.trips.find((t) => t.partnerName.trim())?.partnerName;
  return partner?.trim() || "";
}

/** 自社同士の会社名が同一組織か（カンロジ ↔ カンサイロジック 等） */
export function ownCompaniesUnifiedMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!isOwnCompanyName(a) || !isOwnCompanyName(b)) return false;
  return normalizeOwnCompanyName(a) === normalizeOwnCompanyName(b);
}
