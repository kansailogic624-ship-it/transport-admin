/**
 * 点呼記録簿 前処理パーサー（既存 roll-call-parser を流用）
 */

import { decodeCsvBufferShiftJis } from "@/lib/encoding-detect";
import {
  isCsvExportFormat,
  mergeRollCallEntries,
  parseCsvTextToMatrix,
  parseRollCallCsvExport,
  parseRollCallSheet,
  type ParsedRollCallEntry,
} from "@/lib/roll-call-parser";
import { allSheetMatricesFromArrayBuffer } from "@/lib/spreadsheet-read";
import {
  normalizeDriverForPreprocess,
  normalizeVehicleForPreprocess,
} from "../normalize";
import {
  defaultAmountFields,
  finalizePreprocessResult,
} from "./preprocess-common";
import type {
  PreprocessedRecord,
  PreprocessNormalizeContext,
  PreprocessResult,
} from "../types";

async function parseRollCallEntriesFromBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<{ entries: ParsedRollCallEntry[]; parseWarnings: string[] }> {
  const entries: ParsedRollCallEntry[] = [];
  const parseWarnings: string[] = [];

  if (/\.csv$/i.test(fileName)) {
    const text = decodeCsvBufferShiftJis(buffer);
    const rows = parseCsvTextToMatrix(text);
    if (rows.length === 0) return { entries, parseWarnings };
    const { entries: parsed, warnings } = isCsvExportFormat(rows)
      ? parseRollCallCsvExport(rows)
      : parseRollCallSheet(rows, fileName);
    entries.push(...parsed);
    parseWarnings.push(...warnings);
    return { entries, parseWarnings };
  }

  const sheets = await allSheetMatricesFromArrayBuffer(buffer, fileName);
  for (const { sheetName, rows } of sheets) {
    if (rows.length === 0) continue;
    const { entries: parsed, warnings } = parseRollCallSheet(rows, sheetName);
    entries.push(...parsed);
    for (const w of warnings) {
      parseWarnings.push(`${sheetName}: ${w}`);
    }
  }

  return { entries, parseWarnings };
}

function entryToRecord(
  entry: ParsedRollCallEntry,
  sourceFileName: string,
  sourceRowNumber: number,
  ctx?: PreprocessNormalizeContext,
): PreprocessedRecord {
  const driver = normalizeDriverForPreprocess(entry.driverName, ctx);
  const vehicle = normalizeVehicleForPreprocess(entry.vehicleNumber);

  return {
    id: crypto.randomUUID(),
    sourceType: "roll_call",
    sourceFileName,
    sourceRowNumber,
    businessDate: entry.date,
    driverNameOriginal: entry.driverName,
    driverNameNormalized: driver.normalized,
    vehicleNoOriginal: entry.vehicleNumber,
    vehicleNoNormalized: vehicle.normalized || vehicle.display,
    shipperNameOriginal: "",
    shipperNameNormalized: "",
    jobNameOriginal: "",
    jobNameNormalized: "",
    routeNameOriginal: "",
    routeNameNormalized: "",
    companyOriginal: "",
    companyNormalized: "",
    operationType: "own",
    ...defaultAmountFields(),
    workStartTime: entry.clockIn,
    workEndTime: entry.clockOut,
    warnings: [],
    errors: [],
    warningStatus: "pending",
    isManuallyEdited: false,
    raw: { ...entry },
  };
}

export async function parseRollCallPreprocessorFile(
  buffer: ArrayBuffer,
  fileName: string,
  ctx?: PreprocessNormalizeContext,
): Promise<PreprocessResult> {
  const createdAt = new Date().toISOString();
  const { entries: rawEntries, parseWarnings } =
    await parseRollCallEntriesFromBuffer(buffer, fileName);
  const entries = mergeRollCallEntries(rawEntries);

  const records = entries.map((entry, index) =>
    entryToRecord(entry, fileName, index + 1, ctx),
  );

  return finalizePreprocessResult({
    sourceType: "roll_call",
    sourceFileName: fileName,
    totalRows: records.length,
    records,
    warnings: parseWarnings.map((message) => ({
      code: "PARSE_WARNING",
      message,
    })),
    errors: records.length === 0 ? [{ code: "NO_ROWS", message: "点呼行を読み取れませんでした" }] : [],
    createdAt,
  });
}
