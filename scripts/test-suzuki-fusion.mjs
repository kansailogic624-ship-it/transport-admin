import * as fs from "node:fs";
import * as XLSX from "xlsx";
import { parseFileMakerDispatchSheet } from "../src/lib/filemaker-dispatch-parser.ts";
import { parseAllDrivingReportsFromSheet } from "../src/lib/driving-report-parser.ts";
import {
  buildFusedRecordFromReport,
  fuseDispatchesWithReports,
} from "../src/lib/fusion-import.ts";
import { DEFAULT_MASTERS } from "../src/lib/types.ts";

function load(p) {
  const buf = fs.readFileSync(p);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
}

const fmPath =
  "c:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/ファイルメーカー日時売上/20260501.xlsx";
const reportPath =
  "c:/Users/大西本社/AppData/Roaming/AXISSOFT/BizBrowser/root/sd-xls/運転日報20260501--20260609110930.xlsx";

const dispatches = parseFileMakerDispatchSheet(load(fmPath), "fm.xlsx");
const reports = parseAllDrivingReportsFromSheet(load(reportPath), "report.xlsx");
const suzuki = reports.find((r) => r.driverName.includes("鈴木"));
if (!suzuki) throw new Error("no suzuki");

console.log("report trips:", suzuki.trips.length);
console.log("meters:", suzuki.startMeter, suzuki.endMeter);

// 日報のみ（FMなし）→ 立ち寄り行数分に増殖しないことは FM あり時のみ。FMなしは30件OK
const reportOnly = buildFusedRecordFromReport(suzuki, [], [], []);
console.log("report-only trips:", reportOnly?.trips.length);

// 既存に日報30件がある状態から融合
const existing = reportOnly;
const fused = fuseDispatchesWithReports(dispatches, [suzuki], [existing], DEFAULT_MASTERS);
const rec = fused.records.find((r) => r.driverName.includes("鈴木"));
console.log("merge after report-only existing -> trips:", rec?.trips.length);
const t0 = rec?.trips[0];
console.log(
  " trip0:",
  t0?.jobName,
  t0?.revenue,
  "start=",
  t0?.startMeter,
  "end=",
  t0?.endMeter,
);

// クリーン融合
const clean = fuseDispatchesWithReports(dispatches, [suzuki], [], DEFAULT_MASTERS);
const rec2 = clean.records.find((r) => r.driverName.includes("鈴木"));
console.log("clean fusion trips:", rec2?.trips.length);
const t1 = rec2?.trips[0];
console.log(
  " trip0:",
  t1?.jobName,
  t1?.revenue,
  "start=",
  t1?.startMeter,
  "end=",
  t1?.endMeter,
);

if (rec2?.trips.length !== 1) {
  console.error("FAIL: expected 1 trip");
  process.exit(1);
}
if (t1?.startMeter !== "70892" || t1?.endMeter !== "70977") {
  console.error("FAIL: meter mismatch", t1?.startMeter, t1?.endMeter);
  process.exit(1);
}
const deliveryDrops = suzuki.trips.filter((t) => t.isDeliveryDrop).length;
console.log("delivery drops in report:", deliveryDrops);
console.log("trip0 dropCount:", t1?.dropCount);
if (t1?.dropCount !== deliveryDrops) {
  console.error(
    "FAIL: dropCount mismatch",
    t1?.dropCount,
    "expected",
    deliveryDrops,
  );
  process.exit(1);
}
if (rec?.trips.length !== 1) {
  console.error("FAIL: merge should collapse to 1 trip, got", rec?.trips.length);
  process.exit(1);
}
console.log("OK");
