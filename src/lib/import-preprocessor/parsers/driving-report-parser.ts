import type { PreprocessNormalizeContext, PreprocessResult } from "../types";

/** 運転日報 — 将来対応（スタブ） */
export async function parseDrivingReportPreprocessorFile(
  _buffer: ArrayBuffer,
  fileName: string,
  _ctx?: PreprocessNormalizeContext,
): Promise<PreprocessResult> {
  return emptyStubResult("driving_report", fileName, "運転日報の前処理は準備中です");
}

function emptyStubResult(
  sourceType: PreprocessResult["sourceType"],
  fileName: string,
  message: string,
): PreprocessResult {
  return {
    sourceType,
    sourceFileName: fileName,
    totalRows: 0,
    successRows: 0,
    warningRows: 0,
    errorRows: 1,
    duplicateRows: 0,
    records: [],
    warnings: [],
    errors: [{ code: "NOT_IMPLEMENTED", message }],
    createdAt: new Date().toISOString(),
  };
}

export { emptyStubResult };
