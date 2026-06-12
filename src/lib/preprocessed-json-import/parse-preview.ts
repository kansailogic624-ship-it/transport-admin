import { PREPROCESS_SOURCE_LABELS } from "@/lib/import-preprocessor/types";
import type { PreprocessExportJson } from "@/lib/import-preprocessor/types";
import { getExportableRecords } from "@/lib/import-preprocessor/warning-status";
import type {
  PreprocessedJsonImportDiff,
  PreprocessedJsonImportPreview,
} from "./types";

export function parsePreprocessedJsonFile(
  text: string,
  fileName: string,
): { preview: PreprocessedJsonImportPreview; diff: PreprocessedJsonImportDiff } {
  const payload = JSON.parse(text) as PreprocessExportJson;

  if (!payload.schemaVersion || !Array.isArray(payload.records)) {
    throw new Error("前処理済みJSONの形式が不正です");
  }

  const exportable = getExportableRecords(payload.records);

  const preview: PreprocessedJsonImportPreview = {
    payload,
    fileName,
    recordCount: payload.records.length,
    exportableCount: exportable.length,
    sourceLabel:
      PREPROCESS_SOURCE_LABELS[payload.sourceType] ?? payload.sourceType,
  };

  const diff: PreprocessedJsonImportDiff = {
    newRecords: exportable.length,
    updateCandidates: 0,
    skipped: payload.records.length - exportable.length,
  };

  return { preview, diff };
}
