import { preprocessImportFile } from "@/lib/import-preprocessor";
import type { PreprocessSourceType } from "@/lib/import-preprocessor/types";
import type { MasterData } from "@/lib/types";
import {
  compareComparableRows,
  preprocessedRecordsToComparableRows,
} from "./adapters";
import { runOldImportPipeline } from "./old-pipeline";
import type { ImportCompareReport } from "./types";

const PIPELINE_META: Record<
  PreprocessSourceType,
  { oldFile: string; newFile: string }
> = {
  roll_call: {
    oldFile: "src/lib/roll-call-import.ts",
    newFile: "src/lib/import-preprocessor/parsers/roll-call-parser.ts",
  },
  filemaker_dispatch: {
    oldFile: "src/lib/fusion-import.ts",
    newFile: "src/lib/import-preprocessor/parsers/filemaker-dispatch-parser.ts",
  },
  filemaker_employee_schedule: {
    oldFile: "(新規・旧パイプラインなし)",
    newFile:
      "src/lib/import-preprocessor/parsers/filemaker-employee-schedule-parser.ts",
  },
  driving_report: {
    oldFile: "src/lib/fusion-import.ts",
    newFile: "src/lib/import-preprocessor/parsers/driving-report-parser.ts",
  },
  amazon: {
    oldFile: "src/lib/amazon-performance-import.ts",
    newFile: "src/lib/import-preprocessor/parsers/amazon-parser.ts",
  },
  vehicle_expense: {
    oldFile: "(日次入力に直接取込なし)",
    newFile: "src/lib/import-preprocessor/parsers/vehicle-expense-parser.ts",
  },
  fuel: {
    oldFile: "(日次入力に直接取込なし)",
    newFile: "src/lib/import-preprocessor/parsers/vehicle-expense-parser.ts",
  },
  toll: {
    oldFile: "(日次入力に直接取込なし)",
    newFile: "src/lib/import-preprocessor/parsers/vehicle-expense-parser.ts",
  },
  other: {
    oldFile: "(なし)",
    newFile: "src/lib/import-preprocessor/parsers/vehicle-expense-parser.ts",
  },
};

/**
 * 同一ファイルで旧/新パイプラインをメモリ上比較
 * 差分がある場合は console.table で出力
 */
export async function compareImportPipelines(
  file: File,
  sourceType: PreprocessSourceType,
  masters?: MasterData | null,
): Promise<ImportCompareReport> {
  const oldResult = await runOldImportPipeline(file, sourceType, masters ?? undefined);
  const newResult = await preprocessImportFile(sourceType, file, masters);
  const newRows = preprocessedRecordsToComparableRows(newResult.records, "new");

  const { matchedKeys, oldOnlyKeys, newOnlyKeys, fieldDiffs } =
    compareComparableRows(oldResult.rows, newRows);

  const meta = PIPELINE_META[sourceType];

  const report: ImportCompareReport = {
    sourceType,
    fileName: file.name,
    oldFunction: oldResult.functionName,
    newFunction: "preprocessImportFile",
    oldCount: oldResult.rows.length,
    newCount: newRows.length,
    matchedKeys,
    oldOnlyKeys,
    newOnlyKeys,
    fieldDiffs,
    oldRows: oldResult.rows,
    newRows,
    notes: [
      ...oldResult.notes,
      `新: ${meta.newFile}`,
      `新レコード数: ${newResult.totalRows} / 警告: ${newResult.warningRows} / エラー: ${newResult.errorRows}`,
    ],
  };

  if (sourceType === "filemaker_dispatch") {
    logFmAggregateCompare(oldResult.rows, newRows);
  }

  logImportCompareReport(report);
  return report;
}

function logFmAggregateCompare(
  oldRows: import("./types").ComparableImportRow[],
  newRows: import("./types").ComparableImportRow[],
): void {
  const sum = (rows: import("./types").ComparableImportRow[]) => ({
    sales: rows.reduce((a, r) => a + r.sales, 0),
    tollFee: rows.reduce((a, r) => a + r.tollFee, 0),
    own: rows.filter((r) => r.operationType === "own").length,
    partner: rows.filter((r) => r.operationType === "partner").length,
    unknown: rows.filter((r) => r.operationType === "unknown").length,
  });

  const oldAgg = sum(oldRows);
  const newAgg = sum(newRows);

  console.log("--- FM集計比較（件数は粒度差のため参考） ---");
  console.table([
    { 項目: "売上合計", 旧: oldAgg.sales, 新: newAgg.sales, 一致: oldAgg.sales === newAgg.sales },
    { 項目: "高速代合計", 旧: oldAgg.tollFee, 新: newAgg.tollFee, 一致: oldAgg.tollFee === newAgg.tollFee },
    { 項目: "自社件数", 旧: oldAgg.own, 新: newAgg.own, 一致: oldAgg.own === newAgg.own },
    { 項目: "傭車件数", 旧: oldAgg.partner, 新: newAgg.partner, 一致: oldAgg.partner === newAgg.partner },
    { 項目: "判定不明", 旧: oldAgg.unknown, 新: newAgg.unknown, 一致: oldAgg.unknown === newAgg.unknown },
  ]);
}

export function logImportCompareReport(report: ImportCompareReport): void {
  console.log("=== 取込パイプライン比較 ===");
  console.log({
    データ種別: report.sourceType,
    ファイル: report.fileName,
    旧処理: report.oldFunction,
    新処理: report.newFunction,
    旧件数: report.oldCount,
    新件数: report.newCount,
    一致キー数: report.matchedKeys,
    旧のみ: report.oldOnlyKeys.length,
    新のみ: report.newOnlyKeys.length,
    フィールド差分: report.fieldDiffs.length,
  });

  if (report.notes.length > 0) {
    console.log("notes:", report.notes);
  }

  if (report.oldOnlyKeys.length > 0) {
    console.log("--- 旧のみのキー ---");
    console.table(report.oldOnlyKeys.map((key) => ({ matchKey: key })));
  }

  if (report.newOnlyKeys.length > 0) {
    console.log("--- 新のみのキー ---");
    console.table(report.newOnlyKeys.map((key) => ({ matchKey: key })));
  }

  if (report.fieldDiffs.length > 0) {
    console.log("--- フィールド差分 ---");
    console.table(report.fieldDiffs);
  } else if (
    report.oldCount === report.newCount &&
    report.oldOnlyKeys.length === 0 &&
    report.newOnlyKeys.length === 0
  ) {
    console.log("✓ 件数・キー・比較フィールドは一致しました");
  }
}
