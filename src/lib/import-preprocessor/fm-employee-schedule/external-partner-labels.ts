/**
 * 社員列に入る傭車・外注ラベルの判定ルール。
 * 将来 partner_alias_master / course_partner_rules へ移行する前提の設定配列。
 */

export type ExternalPartnerLabelRule = {
  id: string;
  /** 正規化キーに対する照合（先頭一致） */
  prefixKeys: string[];
  /** 出力 partnerNameOriginal（省略時は Excel 原文） */
  canonicalPartnerName?: string;
};

/** 正規化: NFKC + 空白除去 + 英字小文字化 */
export function normalizePartnerLabelKey(raw: string): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[\s\u3000]+/g, "")
    .toLowerCase();
}

export const externalPartnerLabelRules: ExternalPartnerLabelRule[] = [
  {
    id: "next-bread",
    prefixKeys: ["ネクストブレード", "ﾈｸｽﾄﾌﾞﾚｰﾄﾞ"],
    canonicalPartnerName: "ﾈｸｽﾄﾌﾞﾚｰﾄﾞ①",
  },
];

export type ExternalPartnerLabelMatch = {
  ruleId: string;
  partnerNameOriginal: string;
};

export function matchExternalPartnerLabel(
  employeeNameOriginal: string,
): ExternalPartnerLabelMatch | null {
  const trimmed = employeeNameOriginal.trim();
  if (!trimmed) return null;

  const key = normalizePartnerLabelKey(trimmed);
  if (!key) return null;

  for (const rule of externalPartnerLabelRules) {
    const matched = rule.prefixKeys.some((prefix) => {
      const normalizedPrefix = normalizePartnerLabelKey(prefix);
      return normalizedPrefix.length > 0 && key.startsWith(normalizedPrefix);
    });
    if (matched) {
      return {
        ruleId: rule.id,
        partnerNameOriginal: rule.canonicalPartnerName ?? trimmed,
      };
    }
  }

  return null;
}
