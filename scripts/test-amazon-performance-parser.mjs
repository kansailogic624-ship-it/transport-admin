import { readFileSync } from "fs";
import XLSX from "xlsx";
import {
  formatAmazonPerformanceDisplayDate,
  normalizeAmazonPerformanceDate,
  parseAmazonPerformanceSheet,
} from "../src/lib/amazon-performance-parser.ts";
import { excelSerialToIsoDate } from "../src/lib/import-match-keys.ts";

const xlsxPath =
  "C:/Users/大西本社/OneDrive/デスクトップ/経営/Amazon実績.xlsx";
const wb = XLSX.read(readFileSync(xlsxPath), { type: "buffer" });
const sheet = wb.Sheets["Sheet1"];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

// タイトル・集計・空行を混ぜた壊れやすい行列でも落ちないこと
const noisy = [
  ["Amazon実績", null, undefined],
  [null, "", 31, 1643000],
  ["日付", "曜日", "名前", "会社名", "便名", "売上", "支払", "差異", "人件費", "備考"],
  [45819, 45819, "藤野", "K-CARGO", "1マン", 32000, 28000, 4000, 0, ""],
  [undefined, undefined, undefined],
  ["合計", "", "", "", "", 100, 0, 0, 0, ""],
  [45820, 45820, null, "SMT", "2マン", 55000, 50000, 5000, 0, ""],
  [45821, 45821, "牧本", undefined, "2マン", 55000, 50000, 5000, 0, ""],
];

let parsed = parseAmazonPerformanceSheet(noisy);
if (parsed.length !== 2) {
  console.error("FAIL noisy parse count", parsed.length, parsed);
  process.exit(1);
}

parsed = parseAmazonPerformanceSheet(rows);
console.log("xlsx rows:", parsed.length);
if (parsed.length < 100) {
  console.error("FAIL: expected 100+ rows from real file");
  process.exit(1);
}

const bad = parseAmazonPerformanceSheet([
  ["日付", "名前", "会社名"],
  [undefined, undefined, undefined],
  ["", "", ""],
]);
if (bad.length !== 0) {
  console.error("FAIL: bad rows should be empty", bad);
  process.exit(1);
}

const iso45819 = excelSerialToIsoDate(45819);
if (iso45819 !== "2025-06-01") {
  console.error("FAIL: 45819 expected 2025-06-01 got", iso45819);
  process.exit(1);
}
if (normalizeAmazonPerformanceDate("45819") !== "2025-06-01") {
  console.error("FAIL: string serial normalize");
  process.exit(1);
}
if (formatAmazonPerformanceDisplayDate("45819") !== "2025/06/01") {
  console.error("FAIL: display format", formatAmazonPerformanceDisplayDate("45819"));
  process.exit(1);
}

console.log("OK", { iso45819, display: formatAmazonPerformanceDisplayDate("45819") });
