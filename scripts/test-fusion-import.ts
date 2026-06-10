/**
 * npm run test:fusion
 * 引数: See-Drive日報xlsx FM配車xlsx
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { decodeBufferForJapaneseCsv } from "../src/lib/encoding-detect";
import { parseFileMakerDispatchSheet } from "../src/lib/filemaker-dispatch-parser";
import { fuseDispatchesWithReports } from "../src/lib/fusion-import";
import { parseAllDrivingReportsFromSheet } from "../src/lib/driving-report-parser";
import { buildMonthlySummary } from "../src/lib/monthly-aggregate";
import { DEFAULT_MASTERS } from "../src/lib/types";
import { recordDailyKm } from "../src/lib/trip-utils";

function loadRows(filePath: string): unknown[][] {
  const buf = fs.readFileSync(filePath);
  const isCsv = /\.csv$/i.test(filePath);
  let wb;
  if (isCsv) {
    const { text } = decodeBufferForJapaneseCsv(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    wb = XLSX.read(text, { type: "string", cellDates: false, raw: false });
  } else {
    wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
  }
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

const fmPath =
  process.argv[3] ??
  "C:/Users/大西本社/OneDrive/デスクトップ/20260530.xlsx";
const seePath =
  process.argv[2] ??
  "C:/Users/大西本社/OneDrive/デスクトップ/運転日報20260530--20260605100923.xlsx";

if (!fs.existsSync(fmPath)) {
  console.error("FM file not found:", fmPath);
  process.exit(1);
}
if (!fs.existsSync(seePath)) {
  console.error("See-Drive file not found:", seePath);
  process.exit(1);
}

const dispatches = parseFileMakerDispatchSheet(loadRows(fmPath), path.basename(fmPath));
const seeRows = loadRows(seePath);
const allReports = parseAllDrivingReportsFromSheet(seeRows, "see.xlsx");
console.log("See-Drive drivers in file:", allReports.length);
const report = allReports.find((r) => r.driverName.includes("寺田")) ?? allReports[0];
if (!report) {
  console.error("No reports parsed");
  process.exit(1);
}

console.log("FM rows parsed:", dispatches.length);
console.log("See-Drive report trips:", report.trips.length);

const result = fuseDispatchesWithReports(
  dispatches,
  [report],
  [],
  DEFAULT_MASTERS,
);

const teradaRecords = result.records.filter((r) => r.driverName === "寺田恵昇");
const may30 = teradaRecords.find((r) => r.date === "2026-05-30");

if (!may30) {
  console.error("No fused record for 寺田 2026-05-30", result.messages);
  process.exit(1);
}

const summary = buildMonthlySummary(result.records, "2026-05", DEFAULT_MASTERS);
void summary;
const dayKm = recordDailyKm(may30);

console.log("\n融合結果（寺田 5/30）:");
console.log("  trips:", may30.trips.length);
may30.trips.forEach((t, i) => {
  console.log(
    `  [${i + 1}]`,
    t.jobName,
    t.shipperName,
    t.revenue,
    t.vehicleNumber,
    t.reportSourceLabel ?? "",
  );
});
console.log("  reportedKm:", may30.reportedDistanceKm, "dayKm:", dayKm);
console.log("  fusionOptions:", may30.fusionDispatchOptions?.length);
console.log("  isFusionDraft:", may30.isFusionDraft);

const longTrip = may30.trips.find((t) => t.jobName.includes("三木小野"));
const tripCountOk = may30.trips.length === report.trips.length && report.trips.length === 3;
const ok =
  may30.date === "2026-05-30" &&
  may30.reportedDistanceKm === 220 &&
  dayKm === 220 &&
  tripCountOk &&
  longTrip != null &&
  longTrip.vehicleNumber === "34-88" &&
  longTrip.shipperName === "エフピコ" &&
  longTrip.revenue === "39350" &&
  (may30.fusionDispatchOptions?.length ?? 0) > 0;

console.log(
  ok
    ? "\n✓ FUSION OK (all report trips preserved)"
    : `\n✗ FUSION FAILED (expected ${report.trips.length} trips, got ${may30.trips.length})`,
);
process.exit(ok ? 0 : 1);
