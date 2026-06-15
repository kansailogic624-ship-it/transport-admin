import { allSheetMatricesFromArrayBuffer } from "@/lib/spreadsheet-read";
import {
  buildShigaDeliveryPreprocessResult,
  processShigaDeliverySheets,
} from "../shiga-delivery/build-result";
import type { PreprocessResult } from "../types";

export async function parseShigaDeliveryPreprocessorFile(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<PreprocessResult> {
  const createdAt = new Date().toISOString();
  const sheets = await allSheetMatricesFromArrayBuffer(buffer, fileName);
  const shigaSheets = sheets.filter((s) => s.sheetName.includes("滋賀"));
  const targetSheets = shigaSheets.length > 0 ? shigaSheets : sheets;

  const {
    records,
    daySummaries,
    skippedRowCount,
    missingDateCount,
    excludedNonIsoDateRowCount,
    parseWarnings,
    totalRow,
  } = processShigaDeliverySheets(targetSheets, fileName);

  return buildShigaDeliveryPreprocessResult({
    fileName,
    records,
    daySummaries,
    skippedRowCount,
    missingDateCount,
    excludedNonIsoDateRowCount,
    parseWarnings,
    totalRow,
    createdAt,
  });
}
