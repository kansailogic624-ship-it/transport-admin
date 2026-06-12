import type { PreprocessNormalizeContext, PreprocessResult } from "../types";
import { emptyStubResult } from "./driving-report-parser";

export async function parseVehicleExpensePreprocessorFile(
  _buffer: ArrayBuffer,
  fileName: string,
  _ctx?: PreprocessNormalizeContext,
): Promise<PreprocessResult> {
  return emptyStubResult(
    "vehicle_expense",
    fileName,
    "車両経費の前処理は準備中です",
  );
}

export async function parseFuelPreprocessorFile(
  _buffer: ArrayBuffer,
  fileName: string,
  _ctx?: PreprocessNormalizeContext,
): Promise<PreprocessResult> {
  return emptyStubResult("fuel", fileName, "燃料費の前処理は準備中です");
}

export async function parseTollPreprocessorFile(
  _buffer: ArrayBuffer,
  fileName: string,
  _ctx?: PreprocessNormalizeContext,
): Promise<PreprocessResult> {
  return emptyStubResult("toll", fileName, "高速代の前処理は準備中です");
}

export async function parseOtherPreprocessorFile(
  _buffer: ArrayBuffer,
  fileName: string,
  _ctx?: PreprocessNormalizeContext,
): Promise<PreprocessResult> {
  return emptyStubResult("other", fileName, "その他データの前処理は準備中です");
}
