/**
 * FM配車 前処理パーサー（旧 fusion-import / fm-dispatch-merge ロジック再利用）
 */

import { parseFileMakerDispatchSheet } from "@/lib/filemaker-dispatch-parser";
import { allSheetMatricesFromArrayBuffer } from "@/lib/spreadsheet-read";
import type { MasterData } from "@/lib/types";
import {
  buildFmDispatchAmountTotals,
  processFmDispatchesForPreprocess,
} from "../fm-dispatch-preprocess";
import { finalizePreprocessResult } from "./preprocess-common";
import type {
  PreprocessNormalizeContext,
  PreprocessResult,
} from "../types";

export async function parseFilemakerDispatchPreprocessorFile(
  buffer: ArrayBuffer,
  fileName: string,
  ctx?: PreprocessNormalizeContext,
  masters?: MasterData | null,
): Promise<PreprocessResult> {
  const createdAt = new Date().toISOString();
  const sheets = await allSheetMatricesFromArrayBuffer(buffer, fileName);
  const dispatches: ReturnType<typeof parseFileMakerDispatchSheet> = [];

  for (const { rows } of sheets) {
    if (rows.length === 0) continue;
    dispatches.push(...parseFileMakerDispatchSheet(rows, fileName));
  }

  const { records, parseWarnings } = processFmDispatchesForPreprocess(
    dispatches,
    { ctx, masters },
  );

  const fmTotals = buildFmDispatchAmountTotals(records);

  return finalizePreprocessResult({
    sourceType: "filemaker_dispatch",
    sourceFileName: fileName,
    totalRows: records.length,
    records,
    fmTotals,
    warnings: parseWarnings.map((message) => ({
      code: "PARSE_WARNING",
      message,
    })),
    errors:
      records.length === 0
        ? [{ code: "NO_ROWS", message: "FM配車行を読み取れませんでした" }]
        : [],
    createdAt,
  });
}
