/**
 * 前処理済みJSON → 本体取込（設計用型）
 * ※ 確定保存はこのモジュール経由のみ（将来実装）
 */

import type { PreprocessExportJson } from "@/lib/import-preprocessor/types";

export type PreprocessedJsonImportPreview = {
  payload: PreprocessExportJson;
  fileName: string;
  recordCount: number;
  exportableCount: number;
  sourceLabel: string;
};

export type PreprocessedJsonImportDiff = {
  /** 新規追加候補 */
  newRecords: number;
  /** 更新候補（同一キー既存あり） */
  updateCandidates: number;
  /** スキップ（エラー行等） */
  skipped: number;
};

export type PreprocessedJsonImportState = {
  preview: PreprocessedJsonImportPreview | null;
  diff: PreprocessedJsonImportDiff | null;
  parseError: string | null;
};
