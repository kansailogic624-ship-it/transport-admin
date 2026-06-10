/**
 * タイムカード空欄時の誤引継ぎ防止テスト
 * npx tsx scripts/test-timecard-import.ts
 */
import { parseFileMakerDispatchSheet } from "../src/lib/filemaker-dispatch-parser";
import { normalizeDriverName } from "../src/lib/driving-report-parser";

const header = [
  "実売上",
  "荷主",
  "業務名",
  "車番",
  "社員名",
  "出勤",
  "退勤",
  "日付",
];

const rows = [
  header,
  [
    "",
    "勤怠用",
    "休み",
    "",
    "他ドライバー",
    "22:36:00",
    "10:45:00",
    "2026/05/10",
  ],
  [
    "",
    "勤怠用",
    "休み",
    "",
    "堀川昭人",
    "",
    "",
    "2026/05/10",
  ],
];

const parsed = parseFileMakerDispatchSheet(rows, "test.xlsx");
const other = parsed.find(
  (d) => normalizeDriverName(d.driverName) === normalizeDriverName("他ドライバー"),
);
const horikawa = parsed.find(
  (d) => normalizeDriverName(d.driverName) === normalizeDriverName("堀川昭人"),
);

if (!other?.timecardIn || !other.timecardOut) {
  throw new Error("other driver should keep timecard");
}
if (horikawa?.timecardIn || horikawa?.timecardOut) {
  throw new Error(
    `horikawa should have no timecard, got ${horikawa?.timecardIn} / ${horikawa?.timecardOut}`,
  );
}

console.log("OK timecard isolation");
