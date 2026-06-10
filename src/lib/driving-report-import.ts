import { cleanupImportedJobMasterNoise } from "./job-master-cleanup";
import { datesMatch, driverNamesMatch } from "./import-match-keys";
import {
  recordIdsForTouchedDayKeys,
  touchRecordDay,
} from "./import-history-keys";
import {
  registerImportHistory,
  stampImportHistoryOnRecords,
} from "./import-history";
import { mergeImportedRecordPreservingManual } from "./record-manual-override";
import { recomputeAllReportStatuses } from "./report-status";
import { consolidateDailyRecordsByDriverDay } from "./record-consolidate";
import {
  parseAllDrivingReportsFromSheet,
  parsedReportToDailyRecord,
  type ParsedDrivingReport,
} from "./driving-report-parser";
import { sheetRowsFromArrayBuffer } from "./spreadsheet-read";
import type { DailyRecord, MasterData } from "./types";

export type ImportFileResult = {
  fileName: string;
  ok: boolean;
  /** 1ファイル内の全ドライバー分 */
  parsed: ParsedDrivingReport[];
  records: DailyRecord[];
  error?: string;
};

export type ImportBatchResult = {
  files: ImportFileResult[];
  records: DailyRecord[];
  masters: MasterData;
  importedCount: number;
  skippedCount: number;
  messages: string[];
  /** プレビュー用：今回取り込んだ全レコード */
  importedRecordIds: string[];
};

export async function parseDrivingReportFile(
  file: File,
): Promise<ImportFileResult> {
  try {
    const buffer = await file.arrayBuffer();
    const rows = await sheetRowsFromArrayBuffer(buffer, file.name);
    if (rows.length === 0) {
      return {
        fileName: file.name,
        ok: false,
        parsed: [],
        records: [],
        error: "ファイルが空です",
      };
    }

    const parsedList = parseAllDrivingReportsFromSheet(rows, file.name);
    if (parsedList.length === 0) {
      return {
        fileName: file.name,
        ok: false,
        parsed: [],
        records: [],
        error: "日報ブロックを検出できませんでした",
      };
    }

    const records: DailyRecord[] = [];
    const errors: string[] = [];

    for (const parsed of parsedList) {
      if (!parsed.date || !parsed.driverName) {
        errors.push(
          `${parsed.driverName || "運転手不明"}: 日付または運転手が不足`,
        );
        continue;
      }
      records.push(parsedReportToDailyRecord(parsed));
    }

    if (records.length === 0) {
      return {
        fileName: file.name,
        ok: false,
        parsed: parsedList,
        records: [],
        error: errors.join(" / ") || "有効な日報がありません",
      };
    }

    return {
      fileName: file.name,
      ok: true,
      parsed: parsedList,
      records,
    };
  } catch (e) {
    return {
      fileName: file.name,
      ok: false,
      parsed: [],
      records: [],
      error: e instanceof Error ? e.message : "ファイルの読み込みに失敗しました",
    };
  }
}

export function mergeImportedRecords(
  existingRecords: DailyRecord[],
  existingMasters: MasterData,
  fileResults: ImportFileResult[],
): ImportBatchResult {
  let records = [...existingRecords];
  let masters = { ...existingMasters };
  const messages: string[] = [];
  const importedRecordIds: string[] = [];
  const touchedDayKeys = new Set<string>();
  let importedCount = 0;
  let skippedCount = 0;

  for (const result of fileResults) {
    if (!result.ok || result.records.length === 0) {
      skippedCount += 1;
      messages.push(
        `× ${result.fileName}: ${result.error ?? "取り込み不可"}`,
      );
      continue;
    }

    if (result.parsed.length > 1) {
      messages.push(
        `ℹ ${result.fileName}: ${result.parsed.length} 名分の日報を検出`,
      );
    }

    for (const record of result.records) {
      touchRecordDay(touchedDayKeys, record.date, record.driverName);

      const dupIndex = records.findIndex(
        (r) =>
          datesMatch(r.date, record.date) &&
          driverNamesMatch(r.driverName, record.driverName),
      );

      const kmNote =
        record.reportedDistanceKm != null
          ? ` / 走行 ${record.reportedDistanceKm}km`
          : "";

      if (dupIndex >= 0) {
        const existing = records[dupIndex]!;
        const id = existing.id;
        records[dupIndex] = mergeImportedRecordPreservingManual(existing, record);
        importedRecordIds.push(id);
        messages.push(
          `↻ ${result.fileName}: ${record.date} ${record.driverName} を更新（業務 ${record.trips.length} 件${kmNote}）`,
        );
      } else {
        records = [record, ...records];
        importedRecordIds.push(record.id);
        messages.push(
          `✓ ${result.fileName}: ${record.date} ${record.driverName}（業務 ${record.trips.length} 件${kmNote}）`,
        );
      }

      importedCount += 1;
    }

    for (const parsed of result.parsed) {
      for (const w of parsed.warnings) {
        const who = parsed.driverName ? `${parsed.driverName}: ` : "";
        messages.push(`  ⚠ ${result.fileName} ${who}${w}`);
      }
    }
  }

  const consolidated = consolidateDailyRecordsByDriverDay(records);
  const finalRecords = recomputeAllReportStatuses(consolidated);

  // 運転日報はマスタ（業務名・荷主）を一切更新しない。誤登録の除去のみ。
  const cleaned = cleanupImportedJobMasterNoise(masters, {
    records: finalRecords,
  });
  if (cleaned.removed.length > 0) {
    masters = cleaned.masters;
    messages.push(
      `ℹ 業務名マスタから日報由来の誤登録を ${cleaned.removed.length} 件除去しました`,
    );
  }

  const totalParsed = fileResults.reduce(
    (n, f) => n + (f.parsed?.length ?? 0),
    0,
  );
  const fileNames =
    fileResults.map((f) => f.fileName).join(", ") || "（ファイル名不明）";

  const entry = registerImportHistory({
    importType: "dailyReport",
    fileName: fileNames,
    recordCount: totalParsed,
    successCount: importedCount,
    errorCount: Math.max(0, skippedCount + (totalParsed - importedCount)),
    affectedRecordIds: recordIdsForTouchedDayKeys(
      finalRecords,
      touchedDayKeys,
    ),
    affectedDayKeys: [...touchedDayKeys],
  });

  const stampedRecords = stampImportHistoryOnRecords(finalRecords, entry);

  return {
    files: fileResults,
    records: stampedRecords,
    masters,
    importedCount,
    skippedCount,
    messages,
    importedRecordIds,
  };
}

export async function importDrivingReportFiles(
  files: File[],
  existingRecords: DailyRecord[],
  existingMasters: MasterData,
): Promise<ImportBatchResult> {
  const targets = files.filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));

  const results = await Promise.all(
    targets.map((file) => parseDrivingReportFile(file)),
  );

  return mergeImportedRecords(existingRecords, existingMasters, results);
}
