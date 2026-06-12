/**
 * FM社員スケジュール Excel 前処理パーサー
 */

import type { AliasLedgerSources } from "@/lib/alias-engine";
import { allSheetMatricesFromArrayBuffer } from "@/lib/spreadsheet-read";
import type { MasterData } from "@/lib/types";
import {
  buildFmEmployeeSchedulePreprocessResult,
  processFmEmployeeScheduleSheets,
} from "../fm-employee-schedule/build-result";
import { loadFmReviewDecisionRules } from "../fm-employee-schedule/review-decision";
import type { PreprocessNormalizeContext, PreprocessResult } from "../types";

export async function parseFilemakerEmployeeSchedulePreprocessorFile(
  buffer: ArrayBuffer,
  fileName: string,
  _ctx?: PreprocessNormalizeContext,
  masters?: MasterData | null,
  ledger?: AliasLedgerSources | null,
): Promise<PreprocessResult> {
  const createdAt = new Date().toISOString();
  const sheets = await allSheetMatricesFromArrayBuffer(buffer, fileName);
  const reviewDecisionRules =
    typeof window !== "undefined" ? loadFmReviewDecisionRules() : [];

  const { records, daySummaries, operationSummaries, fmScheduleTotals, parseWarnings } =
    processFmEmployeeScheduleSheets(sheets, fileName, masters, ledger, {
      reviewDecisionRules,
    });

  return buildFmEmployeeSchedulePreprocessResult({
    fileName,
    records,
    daySummaries,
    operationSummaries,
    fmScheduleTotals,
    parseWarnings,
    createdAt,
    reviewDecisionRules,
  });
}
