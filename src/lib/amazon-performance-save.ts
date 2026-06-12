/**
 * Amazon実績インポートのクラウド経費テーブル保存
 * ※ DailyRecord / saveRecords は一切触らない
 * ※ FileMakerスケジュールへの書き込みも行わない
 * ※ 確定ボタン（commitAmazonPerformanceToDatabase）時のみ Firestore へ書く
 */

import {
  amazonExpenseLegacyMatchKey,
  amazonExpenseMatchKey,
  buildAmazonExpenseFromReviewRow,
  findExistingAmazonExpense,
  indexAmazonExpensesByMatchKey,
  isSameAmazonExpenseContent,
} from "./amazon-performance-expense-build";
import { registerImportHistory } from "./import-history";
import type {
  AmazonMergeReviewRow,
  AmazonMergeSummary,
} from "./amazon-performance-merge";
import {
  batchUpsertAmazonPerformanceExpenses,
  loadAmazonPerformanceExpensesForMonths,
} from "@/lib/db";
import { getFirestoreWriteStats } from "@/services/firestore-read-trace";
import type { AmazonPerformanceExpenseRecord, DailyRecord } from "./types";

export const AMAZON_SAVE_SUCCESS_MESSAGE =
  "Amazon実績を経費にインプットしました";

export const AMAZON_SAVE_ERROR_PREFIX = "保存エラー";

export type AmazonPerformancePreviewResult = {
  /** 照合用のみ（Firestore records へは保存しない） */
  nextRecords: DailyRecord[];
  reviewRows: AmazonMergeReviewRow[];
  summary: AmazonMergeSummary;
  affectedRecordIds: string[];
  messages: string[];
  importedCount: number;
};

export type AmazonPerformanceCommitResult = {
  updateCount: number;
  insertCount: number;
  skippedUnchanged: number;
  savedCount: number;
  expenseIds: string[];
  batchCommits: number;
  messages: string[];
};

function formatSaveError(detail: string): string {
  return `${AMAZON_SAVE_ERROR_PREFIX}：${detail}`;
}

function billingMonthsFromReview(rows: AmazonMergeReviewRow[]): string[] {
  const months = new Set<string>();
  for (const row of rows) {
    const m = row.date.match(/^(\d{4}-\d{2})/);
    if (m) months.add(`${m[1]}-${m[2]}`);
  }
  return [...months];
}

type PlannedWrite = {
  payload: AmazonPerformanceExpenseRecord;
  kind: "insert" | "update";
};

function registerExpenseInIndex(
  existingByKey: Map<string, AmazonPerformanceExpenseRecord>,
  record: AmazonPerformanceExpenseRecord,
): void {
  existingByKey.set(amazonExpenseMatchKey(record), record);
  existingByKey.set(amazonExpenseLegacyMatchKey(record), record);
}

function planAmazonExpenseWrites(
  reviewRows: AmazonMergeReviewRow[],
  fileName: string,
  existingByKey: Map<string, AmazonPerformanceExpenseRecord>,
): { toWrite: PlannedWrite[]; skippedUnchanged: number; errors: string[] } {
  const toWrite: PlannedWrite[] = [];
  let skippedUnchanged = 0;
  const errors: string[] = [];

  for (const row of reviewRows) {
    try {
      const matched = findExistingAmazonExpense(existingByKey, row);
      const payload = buildAmazonExpenseFromReviewRow(
        row,
        fileName,
        matched?.id,
      );

      if (matched) {
        payload.createdAt = matched.createdAt;
        payload.updatedAt = new Date().toISOString();
        if (isSameAmazonExpenseContent(matched, payload)) {
          skippedUnchanged++;
          continue;
        }
        toWrite.push({ payload, kind: "update" });
        registerExpenseInIndex(existingByKey, payload);
      } else {
        toWrite.push({ payload, kind: "insert" });
        registerExpenseInIndex(existingByKey, payload);
      }
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "不明なエラー";
      errors.push(`${row.date} ${row.driverName}: ${detail}`);
    }
  }

  return { toWrite, skippedUnchanged, errors };
}

/** 確定時のみ: プレビュー行を amazonPerformanceExpenses へバッチ保存 */
export async function commitAmazonPerformanceToDatabase(
  preview: AmazonPerformancePreviewResult,
  fileName: string,
): Promise<AmazonPerformanceCommitResult> {
  if (preview.reviewRows.length === 0) {
    throw new Error(formatSaveError("保存対象の行がありません"));
  }

  const parsedRowCount = preview.reviewRows.length;
  console.log(`Amazon import parsed rows: ${parsedRowCount}`);

  try {
    const targetMonths = billingMonthsFromReview(preview.reviewRows);
    const existingPool = await loadAmazonPerformanceExpensesForMonths(
      targetMonths,
    );
    console.log(`Amazon existing records loaded: ${existingPool.length}`);

    const existingByKey = indexAmazonExpensesByMatchKey(existingPool);
    const { toWrite, skippedUnchanged, errors } = planAmazonExpenseWrites(
      preview.reviewRows,
      fileName,
      existingByKey,
    );

    const insertCount = toWrite.filter((w) => w.kind === "insert").length;
    const updateCount = toWrite.filter((w) => w.kind === "update").length;

    console.log(`Amazon writes planned: ${toWrite.length}`);
    console.log(`Amazon skipped unchanged: ${skippedUnchanged}`);
    console.log(
      `Amazon planned breakdown: insert ${insertCount} / update ${updateCount}`,
    );

    if (errors.length > 0) {
      throw new Error(
        errors.slice(0, 3).join(" / ") +
          (errors.length > 3 ? ` 他${errors.length - 3}件` : ""),
      );
    }

    let batchCommits = 0;
    if (toWrite.length > 0) {
      const deduped = new Map<string, AmazonPerformanceExpenseRecord>();
      for (const { payload } of toWrite) {
        deduped.set(payload.id, payload);
      }
      const payloads = [...deduped.values()];
      const batchResult = await batchUpsertAmazonPerformanceExpenses(payloads);
      batchCommits = batchResult.batchCommits;
      console.log(`Amazon batch commits: ${batchCommits}`);
    } else {
      console.log("Amazon batch commits: 0");
    }

    const writeStats = getFirestoreWriteStats();
    const writeTotal = Object.values(writeStats).reduce((sum, n) => sum + n, 0);
    console.log(`Firestore write count: ${writeTotal}`);

    const expenseIds = toWrite.map((w) => w.payload.id);

    try {
      registerImportHistory({
        importType: "amazonPerformance",
        fileName,
        recordCount: preview.importedCount,
        successCount: preview.summary.total,
        errorCount: 0,
        affectedRecordIds: expenseIds,
        affectedDayKeys: preview.reviewRows.map(
          (row) => `${row.date}|${row.driverName}`,
        ),
      });
    } catch {
      // 履歴保存失敗は本保存の成功を妨げない
    }

    return {
      updateCount,
      insertCount,
      skippedUnchanged,
      savedCount: toWrite.length,
      expenseIds,
      batchCommits,
      messages: [
        ...preview.messages,
        `経費テーブル保存: 新規 ${insertCount} 件 / 更新 ${updateCount} 件 / スキップ ${skippedUnchanged} 件`,
      ],
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith(AMAZON_SAVE_ERROR_PREFIX)) {
        throw error;
      }
      throw new Error(formatSaveError(error.message));
    }
    throw new Error(formatSaveError("不明なエラー"));
  }
}
