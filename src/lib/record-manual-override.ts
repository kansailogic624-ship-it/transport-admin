import type { DailyRecord, DailyReportStatus } from "./types";

/** 画面からの手動変更をマーク */
export function withReportStatusManual(
  record: DailyRecord,
  reportStatus: DailyReportStatus,
): DailyRecord {
  return {
    ...record,
    reportStatus,
    reportStatusManualOverride: true,
  };
}

export function withClockInManual(
  record: DailyRecord,
  clockIn: string,
): DailyRecord {
  return {
    ...record,
    clockIn,
    clockInManualOverride: true,
  };
}

export function withClockOutManual(
  record: DailyRecord,
  clockOut: string,
): DailyRecord {
  return {
    ...record,
    clockOut,
    clockOutManualOverride: true,
  };
}

/** 手動入力フォームからの保存用 */
export function withManualAttendanceFromForm(
  record: DailyRecord,
  patch: {
    clockIn: string;
    clockOut: string;
    rollCallTime: string;
    rollCallEndTime: string;
    reportStatus: DailyReportStatus;
    isPartner: boolean;
  },
): DailyRecord {
  const rollCallEndTime = patch.rollCallEndTime.trim() || undefined;
  if (patch.isPartner) {
    return {
      ...record,
      clockIn: patch.clockIn,
      clockOut: patch.clockOut,
      rollCallTime: patch.rollCallTime,
      rollCallEndTime,
      reportStatus: "not_required",
    };
  }
  return {
    ...record,
    clockIn: patch.clockIn,
    clockOut: patch.clockOut,
    rollCallTime: patch.rollCallTime,
    rollCallEndTime,
    reportStatus: patch.reportStatus,
    clockInManualOverride: true,
    clockOutManualOverride: true,
    reportStatusManualOverride: true,
  };
}

/** インポート結果を既存レコードにマージ（手動上書き保護） */
export function mergeImportedRecordPreservingManual(
  existing: DailyRecord,
  imported: DailyRecord,
): DailyRecord {
  return {
    ...imported,
    id: existing.id,
    createdAt: existing.createdAt,
    clockIn: existing.clockInManualOverride
      ? existing.clockIn
      : imported.clockIn || existing.clockIn,
    clockOut: existing.clockOutManualOverride
      ? existing.clockOut
      : imported.clockOut || existing.clockOut,
    rollCallTime: existing.clockInManualOverride
      ? existing.rollCallTime
      : imported.rollCallTime || existing.rollCallTime,
    reportStatus: existing.reportStatusManualOverride
      ? existing.reportStatus
      : imported.reportStatus,
    reportStatusManualOverride: existing.reportStatusManualOverride,
    clockInManualOverride: existing.clockInManualOverride,
    clockOutManualOverride: existing.clockOutManualOverride,
  };
}

/** 点呼記録簿の時刻を既存レコードへ（手動上書き保護）
 *
 * - clockIn / clockOut は空文字以外の値があれば上書き
 * - rollCallTime は「業務前点呼（clockIn あり）」の場合のみ更新する。
 *   夜勤翌朝の業務後点呼（clockIn なし・clockOut のみ）は既存の rollCallTime を維持。
 */
export function applyRollCallTimesPreservingManual(
  record: DailyRecord,
  times: {
    clockIn: string;
    clockOut: string;
    rollCallTime: string;
  },
): Pick<DailyRecord, "clockIn" | "clockOut" | "rollCallTime"> {
  // rollCallTime は出発前点呼（clockIn あり）の場合のみ更新する
  const isPreRollCall = Boolean(times.clockIn);
  return {
    clockIn: record.clockInManualOverride
      ? record.clockIn
      : times.clockIn || record.clockIn,
    clockOut: record.clockOutManualOverride
      ? record.clockOut
      : times.clockOut || record.clockOut,
    rollCallTime: record.clockInManualOverride
      ? record.rollCallTime
      : isPreRollCall
        ? times.rollCallTime || record.rollCallTime
        : record.rollCallTime, // 業務後点呼のみの場合は既存値を保持
  };
}
