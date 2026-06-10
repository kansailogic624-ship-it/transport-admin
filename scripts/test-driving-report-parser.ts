/**
 * See-Drive 日報（Excel/CSV）の解析テスト
 * npm run test:driving-report
 */
import * as fs from "node:fs";
import * as XLSX from "xlsx";
import { buildMonthlySummary } from "../src/lib/monthly-aggregate";
import { DEFAULT_MASTERS } from "../src/lib/types";
import {
  normalizeDriverName,
  parseDrivingReportSheet,
  parseReportDateFromRow1,
  parseTimeCell,
  parsedReportToDailyRecord,
} from "../src/lib/driving-report-parser";
import { recordDailyKm } from "../src/lib/trip-utils";

const samplePath =
  process.argv[2] ??
  "C:/Users/大西本社/OneDrive/デスクトップ/運転日報20260530--20260605100923.xlsx";

function loadRowsFromFile(path: string): unknown[][] {
  const buf = fs.readFileSync(path);
  const isCsv = /\.csv$/i.test(path);
  const wb = XLSX.read(buf, {
    type: "buffer",
    cellDates: false,
    ...(isCsv ? { codepage: 932 } : {}),
  });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

function loadRowsFromXlsxAsCsv(path: string): unknown[][] {
  const wb = XLSX.readFile(path);
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]!]!);
  const wb2 = XLSX.read(csv, { type: "string" });
  const ws = wb2.Sheets[wb2.SheetNames[0]!];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

if (!fs.existsSync(samplePath)) {
  console.error("File not found:", samplePath);
  process.exit(1);
}

const rowsXlsx = loadRowsFromFile(samplePath);
const rowsCsv = loadRowsFromXlsxAsCsv(samplePath);

for (const [label, rows] of [
  ["xlsx", rowsXlsx],
  ["csv", rowsCsv],
] as const) {
  const parsed = parseDrivingReportSheet(rows, `${label}-sample`);
  const record = parsedReportToDailyRecord(parsed);
  const dayKm = recordDailyKm(record);
  const summary = buildMonthlySummary([record], "2026-05", DEFAULT_MASTERS);

  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(parsed, null, 2));
  console.log("recordDailyKm:", dayKm);
  console.log("monthly totalKm:", summary.totalKm);

  const ok =
    parsed.date === "2026-05-30" &&
    parsed.driverName === "寺田恵昇" &&
    parsed.vehicleNumber === "34-88" &&
    parsed.clockIn === "00:15" &&
    parsed.clockOut === "10:09" &&
    parsed.distanceKm === 220 &&
    dayKm === 220 &&
    summary.totalKm === 220 &&
    record.trips[0]?.startMeter === "" &&
    record.trips[0]?.endMeter === "";

  console.log(ok ? "✓ PASS" : "✗ FAIL");
  if (!ok) process.exit(1);
}

console.log("\nparseTimeCell 0:15 ->", parseTimeCell("0:15"));
console.log("parseTimeCell 00:15:00 ->", parseTimeCell("00:15:00"));
console.log("driver:", normalizeDriverName("寺田　恵昇"));
console.log("date:", parseReportDateFromRow1(rowsCsv[0] ?? []));
console.log("\n✓ ALL CHECKS PASSED");
