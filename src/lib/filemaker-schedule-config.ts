/**
 * FileMaker Data API: スケジュール読み込み用レイアウト定数
 *
 * ※ Excel の Sheet1 名「Amazon実績」はレイアウト名ではありません。
 *    誤って Amazon実績 をレイアウトに指定すると
 *    Invalid Layout: "Amazon実績" is not a valid layout name になります。
 */

/** 山崎・木村さん等の配車データ取得に使用する正規レイアウト（FMスケジュール表） */
export const FILEMAKER_SCHEDULE_LAYOUT = "日時売上【スケジュール】";

/** レイアウト名として誤用されがちな別名（Excelシート名など） */
const INVALID_LAYOUT_ALIASES = new Set([
  "amazon実績",
  "amazon",
  "実績",
  "sheet1",
]);

function normalizeLayoutKey(name: string): string {
  return name.replace(/[\s\u3000]/g, "").toLowerCase();
}

/** 環境変数や呼び出し元の候補を正規レイアウトへ矯正 */
export function resolveFileMakerScheduleLayout(
  candidate?: string | null,
): string {
  const fromEnv = process.env.FILEMAKER_SCHEDULE_LAYOUT?.trim();
  const raw = (candidate ?? fromEnv ?? FILEMAKER_SCHEDULE_LAYOUT).trim();
  if (!raw) return FILEMAKER_SCHEDULE_LAYOUT;
  if (INVALID_LAYOUT_ALIASES.has(normalizeLayoutKey(raw))) {
    return FILEMAKER_SCHEDULE_LAYOUT;
  }
  return raw;
}

export function isFileMakerScheduleApiConfigured(): boolean {
  return Boolean(
    process.env.FILEMAKER_HOST?.trim() &&
      process.env.FILEMAKER_DATABASE?.trim() &&
      process.env.FILEMAKER_USERNAME?.trim() &&
      process.env.FILEMAKER_PASSWORD?.trim(),
  );
}
