/**
 * ブラウザから FileMaker スケジュールを安全に取得（GET のみ）
 */

import { dailyRecordsFromFileMakerApiRecords } from "./filemaker-schedule-to-records";
import type { DailyRecord, MasterData } from "./types";

export type FileMakerScheduleLoadResult = {
  records: DailyRecord[];
  source: "filemaker" | "firestore";
  layout?: string;
  error?: string;
};

type ScheduleApiResponse = {
  ok?: boolean;
  configured?: boolean;
  layout?: string;
  records?: { recordId: string; fieldData: Record<string, unknown> }[];
  error?: string;
};

/**
 * Amazon実績プレビュー用の FM スケジュール読込。
 * 失敗時は空配列を返し、呼び出し元で Firestore records にフォールバックする。
 */
export async function loadFileMakerScheduleForAmazonMerge(
  masters: MasterData,
): Promise<FileMakerScheduleLoadResult> {
  try {
    const res = await fetch("/api/filemaker/schedule", {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = `HTTP ${res.status}`;
      console.error("[Amazon実績] FileMakerスケジュール取得失敗:", detail);
      return { records: [], source: "firestore", error: detail };
    }

    const json = (await res.json()) as ScheduleApiResponse;

    if (!json.configured) {
      return { records: [], source: "firestore", layout: json.layout };
    }

    if (!json.ok || json.error) {
      console.error(
        "[Amazon実績] FileMakerスケジュール取得エラー:",
        json.error ?? "不明",
        `(layout: ${json.layout ?? "—"})`,
      );
      return {
        records: [],
        source: "firestore",
        layout: json.layout,
        error: json.error,
      };
    }

    const apiRecords = json.records ?? [];
    if (apiRecords.length === 0) {
      return {
        records: [],
        source: "firestore",
        layout: json.layout,
      };
    }

    const dailyRecords = dailyRecordsFromFileMakerApiRecords(apiRecords, masters);
    return {
      records: dailyRecords,
      source: "filemaker",
      layout: json.layout,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "FileMakerスケジュール取得例外";
    console.error("[Amazon実績] FileMakerスケジュール取得例外:", error);
    return { records: [], source: "firestore", error: detail };
  }
}
