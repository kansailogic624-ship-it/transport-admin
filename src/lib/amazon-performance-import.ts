/**
 * Amazon実績 xlsx インポート（プレビュー合体 + 経費テーブル保存）
 */

import { parseAmazonPerformanceBuffer } from "./amazon-performance-parser";
import { mergeAmazonPerformance } from "./amazon-performance-merge";
import {
  commitAmazonPerformanceToDatabase,
  type AmazonPerformanceCommitResult,
  type AmazonPerformancePreviewResult,
} from "./amazon-performance-save";
import type { DailyRecord, MasterData } from "./types";

export type {
  AmazonPerformanceCommitResult,
  AmazonPerformancePreviewResult,
};

/** ファイルを読み込み合体プレビューのみ（DB未保存・スケジュール未変更） */
export async function previewAmazonPerformanceFiles(
  files: File[],
  records: DailyRecord[],
  masters: MasterData,
): Promise<AmazonPerformancePreviewResult> {
  const messages: string[] = [];
  const allCsvRows = [];

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const rows = await parseAmazonPerformanceBuffer(buffer, file.name);
    if (rows.length === 0) {
      messages.push(`⚠ ${file.name}: Sheet1の実績行を読み取れませんでした`);
      continue;
    }
    allCsvRows.push(...rows);
    messages.push(`✓ ${file.name}: ${rows.length} 行`);
  }

  if (allCsvRows.length === 0) {
    return {
      nextRecords: records,
      messages,
      importedCount: 0,
      reviewRows: [],
      summary: {
        total: 0,
        ownUpdate: 0,
        ownNew: 0,
        partnerNew: 0,
        routeOneMan: 0,
        routeTwoMan: 0,
        routeOther: 0,
      },
      affectedRecordIds: [],
    };
  }

  const merged = mergeAmazonPerformance(allCsvRows, records, masters);

  messages.push(
    `合体プレビュー: 自社上書き ${merged.summary.ownUpdate} / 自社新規 ${merged.summary.ownNew} / 傭車新規 ${merged.summary.partnerNew}`,
  );
  messages.push(
    `便名集計: 1マン ${merged.summary.routeOneMan} / 2マン ${merged.summary.routeTwoMan}` +
      (merged.summary.routeOther > 0
        ? ` / その他 ${merged.summary.routeOther}`
        : ""),
  );
  messages.push("※保存時は経費・生産性管理テーブルへ書き込みます（スケジュールは変更しません）");

  return {
    nextRecords: merged.nextRecords,
    reviewRows: merged.reviewRows,
    summary: merged.summary,
    affectedRecordIds: merged.affectedRecordIds,
    messages,
    importedCount: merged.summary.total,
  };
}

/** プレビュー結果をクラウド経費テーブル（Firestore）へ保存（FM通信なし） */
export async function saveAmazonPerformancePreview(
  preview: AmazonPerformancePreviewResult,
  fileName: string,
): Promise<AmazonPerformanceCommitResult> {
  try {
    return await commitAmazonPerformanceToDatabase(preview, fileName);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("保存エラー：不明なエラー");
  }
}
