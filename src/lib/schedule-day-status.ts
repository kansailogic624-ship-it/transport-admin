import type { DailyRecord } from "./types";

export type DayStatus = "公休" | "有給";

export const ATTENDANCE_SHIPPER = "勤怠用";

const PAID_LEAVE_RE = /有給|有休/;
const PUBLIC_HOLIDAY_RE = /公休|休み/;

/** B列が「勤怠用」、または C列に休日キーワードを含む勤怠行か */
export function isAttendanceScheduleRow(
  shipperName?: string,
  jobName?: string,
): boolean {
  const shipper = (shipperName ?? "").trim();
  const job = (jobName ?? "").trim();
  if (shipper === ATTENDANCE_SHIPPER) return true;
  return detectDayStatusFromText(job, shipper) !== undefined;
}

/** 業務名・荷主名から休日ステータスを検出（有給を優先） */
export function detectDayStatusFromText(
  ...texts: (string | undefined)[]
): DayStatus | undefined {
  const normalized = texts
    .map((t) => (t ?? "").trim())
    .filter((t) => t.length > 0);
  if (normalized.length === 0) return undefined;

  const combined = normalized.join(" ");
  if (PAID_LEAVE_RE.test(combined)) return "有給";

  for (const text of normalized) {
    if (PUBLIC_HOLIDAY_RE.test(text)) return "公休";
    if (text === "公" || /(?:^|[\s　（(【])公(?:[\s　）)】]|$)/.test(text)) {
      return "公休";
    }
  }

  return undefined;
}

export function recordHasDayStatus(record: DailyRecord): boolean {
  return record.dayStatus === "公休" || record.dayStatus === "有給";
}

export function dayStatusBadgeClass(status: DayStatus): string {
  if (status === "有給") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-gray-200 bg-gray-100 text-gray-700";
}
