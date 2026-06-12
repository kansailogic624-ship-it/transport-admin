import type { FmEmployeeScheduleStagingRecord, FmScheduleWarningCode } from "./types";
import { getActionableWarnings } from "./warning-tracking";

export type FmWarningEditTarget = {
  recordId: string;
  flag: FmScheduleWarningCode;
  sourceRowNumber: number;
  employeeName: string;
  jobName: string;
};

/** 修正画面の「前の警告 / 次の警告」ナビ用キュー */
export function buildFmWarningEditQueue(
  records: FmEmployeeScheduleStagingRecord[],
): FmWarningEditTarget[] {
  const targets: FmWarningEditTarget[] = [];

  const sorted = [...records].sort(
    (a, b) => a.sourceRowNumber - b.sourceRowNumber,
  );

  for (const record of sorted) {
    const flags = getActionableWarnings(record);
    for (const flag of flags) {
      targets.push({
        recordId: record.id,
        flag,
        sourceRowNumber: record.sourceRowNumber,
        employeeName:
          record.employeeNameCanonical?.trim() || record.employeeNameOriginal,
        jobName: record.jobNameCanonical?.trim() || record.jobNameOriginal,
      });
    }
  }

  return targets;
}

export function findWarningEditIndex(
  queue: FmWarningEditTarget[],
  recordId: string,
  flag?: FmScheduleWarningCode,
): number {
  if (flag) {
    const idx = queue.findIndex(
      (t) => t.recordId === recordId && t.flag === flag,
    );
    if (idx >= 0) return idx;
  }
  return queue.findIndex((t) => t.recordId === recordId);
}

export function getAdjacentWarningTarget(
  queue: FmWarningEditTarget[],
  currentIndex: number,
  direction: "prev" | "next",
): FmWarningEditTarget | null {
  const nextIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= queue.length) return null;
  return queue[nextIndex] ?? null;
}
