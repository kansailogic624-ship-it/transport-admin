import { parseFileMakerDispatchSheet } from "../src/lib/filemaker-dispatch-parser";
import {
  detectDayStatusFromText,
  isAttendanceScheduleRow,
} from "../src/lib/schedule-day-status";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(isAttendanceScheduleRow("勤怠用", "休み"), "勤怠用+休み");
assert(detectDayStatusFromText("休み", "勤怠用") === "公休", "休み→公休");
assert(detectDayStatusFromText("有給", "勤怠用") === "有給", "有給");

const rows = [
  ["実売上", "荷主", "業務名", "車両番号", "社員名", "出庫時間"],
  ["", "勤怠用", "休み", "", "岩淵 綾太", ""],
  [50000, "エフピコ", "選別ロング", "91-44", "川本 剛士", "08:00:00"],
  ["", "勤怠用", "有給", "", "石田 和也", ""],
];

const parsed = parseFileMakerDispatchSheet(rows, "20260530.xlsx");
const attendance = parsed.filter((d) => d.isAttendanceRow);

assert(attendance.length === 2, `attendance rows: ${attendance.length}`);
assert(
  attendance.some((d) => d.driverName === "岩淵綾太" && d.dayStatus === "公休"),
  "岩淵 公休",
);
assert(
  attendance.some((d) => d.driverName === "石田和也" && d.dayStatus === "有給"),
  "石田 有給",
);
assert(
  parsed.some((d) => d.driverName === "川本剛士" && d.date === "2026-05-30"),
  "work row date from filename",
);
assert(attendance.every((d) => d.date === "2026-05-30"), "date from filename");
assert(attendance.every((d) => !d.revenue), "no revenue");

console.log("test-attendance-parser: OK");
