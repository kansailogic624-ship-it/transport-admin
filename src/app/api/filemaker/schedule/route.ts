/**
 * FileMaker スケジュール取得 API（GET のみ・保存時は呼ばない）
 */

import { NextResponse } from "next/server";
import {
  FILEMAKER_SCHEDULE_LAYOUT,
  isFileMakerScheduleApiConfigured,
  resolveFileMakerScheduleLayout,
} from "@/lib/filemaker-schedule-config";
import { fetchFileMakerScheduleRecords } from "@/lib/filemaker-schedule-api";

export async function GET() {
  try {
    if (!isFileMakerScheduleApiConfigured()) {
      return NextResponse.json({
        ok: true,
        configured: false,
        layout: FILEMAKER_SCHEDULE_LAYOUT,
        records: [],
      });
    }

    const layout = resolveFileMakerScheduleLayout();
    const records = await fetchFileMakerScheduleRecords({ layout });

    return NextResponse.json({
      ok: true,
      configured: true,
      layout,
      records,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "FileMakerスケジュール取得エラー";
    console.error("[api/filemaker/schedule]", detail, error);
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        layout: resolveFileMakerScheduleLayout(),
        records: [],
        error: detail,
      },
      { status: 200 },
    );
  }
}
