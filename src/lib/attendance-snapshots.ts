import type { DailyRecord } from "./types";

/** 編集開始時点の取込実績（比較表の参照用・編集中は固定） */
export type AttendanceSnapshots = {
  rollCallClockIn: string;
  rollCallClockOut: string;
  rollCallStart: string;
  rollCallEnd: string;
  timecardIn: string;
  timecardOut: string;
};

export function emptyAttendanceSnapshots(): AttendanceSnapshots {
  return {
    rollCallClockIn: "",
    rollCallClockOut: "",
    rollCallStart: "",
    rollCallEnd: "",
    timecardIn: "",
    timecardOut: "",
  };
}

export function attendanceSnapshotsFromRecord(
  record: DailyRecord,
): AttendanceSnapshots {
  return {
    rollCallClockIn: record.clockIn?.trim() || "",
    rollCallClockOut: record.clockOut?.trim() || "",
    rollCallStart:
      record.rollCallTime?.trim() ||
      (record.rollCallPreRecorded ? record.clockIn?.trim() || "" : ""),
    rollCallEnd:
      record.rollCallEndTime?.trim() ||
      (record.rollCallPostRecorded ? record.clockOut?.trim() || "" : ""),
    timecardIn: record.timecardIn?.trim() || "",
    timecardOut: record.timecardOut?.trim() || "",
  };
}
