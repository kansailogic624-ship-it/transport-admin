import { isReportSubmissionMissing } from "./report-status";
import { isPartnerRecord, isPartnerTrip } from "./run-type";
import { parseRevenue, parseTollFee } from "./trip-utils";
import type { DailyRecord, TripEntry } from "./types";

export type AlertItem = {
  id: string;
  message: string;
};

/** タイムカードと点呼簿の乖離情報 */
export type TimecardDeviation = {
  /** 出勤乖離分（タイムカード − 点呼簿）。null = データ不足 */
  inDiff: number | null;
  /** 退勤乖離分（タイムカード − 点呼簿）。null = データ不足 */
  outDiff: number | null;
  /** 出勤乖離アラート（30分以上） */
  inAlert: boolean;
  /** 退勤乖離アラート（30分以上） */
  outAlert: boolean;
};

export const SCHEDULE_DEVIATION_ALERT_MINUTES = 30;

const TIMECARD_ALERT_THRESHOLD_MINUTES = SCHEDULE_DEVIATION_ALERT_MINUTES;

export function parseClockMinutes(time: string): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** @deprecated use parseClockMinutes */
const parseMinutes = parseClockMinutes;

/** 入力時刻とスケジュール予定の乖離（入力 − 予定。正 = 遅れ） */
export function calcActualVsScheduleDeviation(
  actual: string,
  scheduled: string | undefined,
): { diffMinutes: number | null; isAlert: boolean } {
  const actualMin = parseClockMinutes(actual);
  const schedMin = parseClockMinutes(scheduled ?? "");
  if (actualMin === null || schedMin === null) {
    return { diffMinutes: null, isAlert: false };
  }
  const diffMinutes = actualMin - schedMin;
  return {
    diffMinutes,
    isAlert: Math.abs(diffMinutes) >= SCHEDULE_DEVIATION_ALERT_MINUTES,
  };
}

export function formatScheduleDeviationLabel(diffMinutes: number): string {
  const sign = diffMinutes >= 0 ? "+" : "";
  return `乖離：${sign}${diffMinutes}分`;
}

/** 点呼記録簿 − タイムカード（正 = 点呼記録簿が遅い） */
export function calcTimecardVsRollCallDeviation(
  rollCall: string,
  timecard: string | undefined,
): { diffMinutes: number | null; isAlert: boolean } {
  const rollMin = parseClockMinutes(rollCall);
  const tcMin = parseClockMinutes(timecard ?? "");
  if (rollMin === null || tcMin === null) {
    return { diffMinutes: null, isAlert: false };
  }
  const diffMinutes = rollMin - tcMin;
  return {
    diffMinutes,
    isAlert: Math.abs(diffMinutes) >= SCHEDULE_DEVIATION_ALERT_MINUTES,
  };
}

export function formatDeviationMinutes(diffMinutes: number): string {
  const sign = diffMinutes >= 0 ? "+" : "";
  return `${sign}${diffMinutes}分`;
}

function tripDistanceKm(trip: TripEntry): number | null {
  const start = Number(trip.startMeter);
  const end = Number(trip.endMeter);
  if (trip.startMeter === "" || trip.endMeter === "") return null;
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return end - start;
}

export function getTripAlerts(trip: TripEntry, index: number): AlertItem[] {
  if (isPartnerTrip(trip)) return [];

  const alerts: AlertItem[] = [];
  const distance = tripDistanceKm(trip);
  const revenue = parseRevenue(trip.revenue);
  const toll = parseTollFee(trip.tollFee);

  if (toll > revenue) {
    alerts.push({
      id: `trip-toll-${trip.id}`,
      message: `業務${index + 1}: 警告：高速代が売上を超えています`,
    });
  }

  if (distance === null) return alerts;

  if (distance === 0 || distance > 400) {
    alerts.push({
      id: `trip-distance-${trip.id}`,
      message: `業務${index + 1}: 距離が異常です（${distance}km）`,
    });
  }
  return alerts;
}

/**
 * タイムカード（timecardIn/Out）と点呼簿（clockIn/Out）の乖離を計算する。
 * - 差が 30 分以上の場合にアラートフラグを立てる
 */
export function calcTimecardDeviation(record: DailyRecord): TimecardDeviation {
  const clockInMin = parseMinutes(record.clockIn);
  const clockOutMin = parseMinutes(record.clockOut);
  const tcInMin = parseMinutes(record.timecardIn ?? "");
  const tcOutMin = parseMinutes(record.timecardOut ?? "");

  const inDiff =
    tcInMin !== null && clockInMin !== null ? tcInMin - clockInMin : null;
  const outDiff =
    tcOutMin !== null && clockOutMin !== null ? tcOutMin - clockOutMin : null;

  return {
    inDiff,
    outDiff,
    inAlert:
      inDiff !== null &&
      Math.abs(inDiff) >= TIMECARD_ALERT_THRESHOLD_MINUTES,
    outAlert:
      outDiff !== null &&
      Math.abs(outDiff) >= TIMECARD_ALERT_THRESHOLD_MINUTES,
  };
}

export function getRecordAlerts(record: DailyRecord): AlertItem[] {
  if (isPartnerRecord(record)) return [];

  const alerts: AlertItem[] = [];

  if (isReportSubmissionMissing(record.reportStatus)) {
    alerts.push({
      id: "daily-report",
      message: "日報未提出",
    });
  }

  const clockIn = parseMinutes(record.clockIn);
  const rollCall = parseMinutes(record.rollCallTime);
  if (clockIn !== null && rollCall !== null) {
    const diff = Math.abs(rollCall - clockIn);
    if (diff > 15) {
      alerts.push({
        id: "roll-call-time",
        message: "点呼時間が不自然です（出勤との差が15分超）",
      });
    }
  }

  const tcDev = calcTimecardDeviation(record);
  if (tcDev.inAlert && tcDev.inDiff !== null) {
    alerts.push({
      id: "timecard-in-deviation",
      message: `タイムカード出勤が点呼簿と${Math.abs(tcDev.inDiff)}分乖離`,
    });
  }
  if (tcDev.outAlert && tcDev.outDiff !== null) {
    alerts.push({
      id: "timecard-out-deviation",
      message: `タイムカード退勤が点呼簿と${Math.abs(tcDev.outDiff)}分乖離`,
    });
  }

  record.trips.forEach((trip, index) => {
    alerts.push(...getTripAlerts(trip, index));
  });

  return alerts;
}
