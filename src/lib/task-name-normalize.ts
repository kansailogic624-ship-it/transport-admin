import type { TripEntry } from "./types";

/** 丸数字 ①〜⑳ */
const CIRCLED_NUMBERS_RE = /[\u2460-\u2473]+$/u;

/** 末尾の台数区別（1〜2桁・全半角・任意の区切り） */
const TRAILING_UNIT_DIGITS_RE =
  /[\s\-－ー−‐‑–—]*[0-9０-９]{1,2}$/u;

/**
 * 集計用：業務名末尾の台数区別（①②、1、２ 等）を除去してベース業務名にする。
 * 入力・表示フェーズでは元の業務名をそのまま使うこと。
 */
export function getCleanTaskName(raw: string): string {
  let name = (raw ?? "").trim();
  if (!name) return "";

  name = name.replace(CIRCLED_NUMBERS_RE, "");
  name = name.replace(TRAILING_UNIT_DIGITS_RE, "");

  const cleaned = name.trim();
  return cleaned || (raw ?? "").trim();
}

/** 集計キー用：クレンジング後の業務名（空なら fallback） */
export function normalizeJobNameForAggregation(
  raw: string,
  fallback = "（業務未設定）",
): string {
  const cleaned = getCleanTaskName(raw);
  return cleaned || (raw ?? "").trim() || fallback;
}

/** trip から集計用の業務ラベルを取得（表示名は変更しない） */
export function tripJobLabelForAggregation(trip: TripEntry): string {
  return (
    trip.jobName.trim() ||
    trip.linkedDispatchName?.trim() ||
    trip.shipperName.trim() ||
    ""
  );
}
