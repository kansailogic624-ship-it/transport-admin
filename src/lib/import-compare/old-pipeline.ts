/**
 * 旧取込パイプライン（Firestore 保存なし・メモリのみ）
 */

import { parseAmazonPerformanceBuffer } from "@/lib/amazon-performance-parser";
import { previewAmazonPerformanceFiles } from "@/lib/amazon-performance-import";
import { decodeCsvBufferShiftJis } from "@/lib/encoding-detect";
import {
  fuseDispatchesWithReports,
  parseFileMakerFiles,
  parseSeeDriveReportFiles,
} from "@/lib/fusion-import";
import {
  isCsvExportFormat,
  mergeRollCallEntries,
  parseCsvTextToMatrix,
  parseRollCallCsvExport,
  parseRollCallSheet,
} from "@/lib/roll-call-parser";
import { applyRollCallEntriesToRecords } from "@/lib/roll-call-import";
import { allSheetMatricesFromArrayBuffer } from "@/lib/spreadsheet-read";
import type { PreprocessSourceType } from "@/lib/import-preprocessor/types";
import type { DailyRecord, MasterData } from "@/lib/types";
import {
  dailyRecordsToComparableRows,
  preprocessedRecordsToComparableRows,
} from "./adapters";
import type { ComparableImportRow } from "./types";

const EMPTY_MASTERS: MasterData = {
  drivers: [],
  partners: [],
  vehicles: [],
  shippers: [],
  shipperJobs: {},
  employeeSalaries: {},
  defaultPartTimeDaily: 0,
  defaultDispatchDaily: 0,
  mappingRules: [],
  allocationExpenses: [],
};

async function parseRollCallEntriesFromFile(
  file: File,
): Promise<ReturnType<typeof mergeRollCallEntries>> {
  const buffer = await file.arrayBuffer();
  const fileName = file.name;
  const allEntries: Parameters<typeof mergeRollCallEntries>[0] = [];

  if (/\.csv$/i.test(fileName)) {
    const text = decodeCsvBufferShiftJis(buffer);
    const rows = parseCsvTextToMatrix(text);
    const { entries } = isCsvExportFormat(rows)
      ? parseRollCallCsvExport(rows)
      : parseRollCallSheet(rows, fileName);
    allEntries.push(...entries);
  } else {
    const sheets = await allSheetMatricesFromArrayBuffer(buffer, fileName);
    for (const { sheetName, rows } of sheets) {
      if (rows.length === 0) continue;
      const { entries } = parseRollCallSheet(rows, sheetName);
      allEntries.push(...entries);
    }
  }

  return mergeRollCallEntries(allEntries);
}

export async function runOldImportPipeline(
  file: File,
  sourceType: PreprocessSourceType,
  masters: MasterData = EMPTY_MASTERS,
): Promise<{ rows: ComparableImportRow[]; functionName: string; notes: string[] }> {
  const notes: string[] = [];

  switch (sourceType) {
    case "roll_call": {
      const entries = await parseRollCallEntriesFromFile(file);
      const { records } = applyRollCallEntriesToRecords(entries, [], masters);
      notes.push(
        "旧: 空の既存レコードに対して applyRollCallEntriesToRecords（夜勤跨ぎ・マスタ統合は未実行）",
      );
      return {
        rows: dailyRecordsToComparableRows(records, "old"),
        functionName: "importRollCallFiles → applyRollCallEntriesToRecords",
        notes,
      };
    }
    case "filemaker_dispatch": {
      const dispatches = await parseFileMakerFiles([file]);
      const result = fuseDispatchesWithReports(
        dispatches,
        [],
        [],
        masters,
        [],
      );
      notes.push(
        "旧: preprocessFmDispatches + fuseDispatchesWithReports（日次単位に集約・crew/tollFee 付与）",
      );
      return {
        rows: dailyRecordsToComparableRows(result.records, "old"),
        functionName: "importFusionBatch → fuseDispatchesWithReports (FMのみ)",
        notes,
      };
    }
    case "driving_report": {
      const { reports, errors } = await parseSeeDriveReportFiles([file]);
      for (const e of errors) notes.push(`旧パース: ${e}`);
      const result = fuseDispatchesWithReports(
        [],
        reports,
        [],
        masters,
        [],
      );
      notes.push("旧: buildFusedRecordFromReport（FM融合・学習ルール・trip生成）");
      return {
        rows: dailyRecordsToComparableRows(result.records, "old"),
        functionName: "importFusionBatch → fuseDispatchesWithReports (日報のみ)",
        notes,
      };
    }
    case "amazon": {
      const buffer = await file.arrayBuffer();
      const parsedRows = await parseAmazonPerformanceBuffer(buffer, file.name);
      notes.push(
        "旧(行単位): parseAmazonPerformanceBuffer — mergeAmazonPerformance は DailyRecord 合体のため別粒度",
      );
      const flatRows = parsedRows.map((row, index) => ({
        pipeline: "old" as const,
        rowIndex: index + 1,
        matchKey: `${row.date}|${row.driverName}|${row.routeLabel}|${row.revenue}`,
        date: row.date,
        driver: row.driverName,
        vehicle: "",
        shipper: "Amazon",
        job: row.routeLabel,
        route: row.routeLabel,
        sales: row.revenue,
        payment: row.payment,
        tollFee: 0,
        clockIn: "",
        clockOut: "",
        rollCallTime: "",
        warnings: "",
        errors: "",
        operationType: "",
        company: row.companyNameRaw || row.companyName,
      }));
      return {
        rows: flatRows,
        functionName: "previewAmazonPerformanceFiles → parseAmazonPerformanceBuffer",
        notes,
      };
    }
    default:
      return {
        rows: [],
        functionName: "(未対応)",
        notes: [`旧パイプライン未実装: ${sourceType}`],
      };
  }
}

/** Amazon 旧処理の合体後プレビュー行（参考用） */
export async function runOldAmazonMergePreview(
  file: File,
  masters: MasterData = EMPTY_MASTERS,
): Promise<DailyRecord[]> {
  const preview = await previewAmazonPerformanceFiles([file], [], masters);
  return preview.nextRecords;
}
