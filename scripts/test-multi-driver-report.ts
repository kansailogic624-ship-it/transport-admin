/**
 * 縦連結日報の全ドライバー抽出テスト
 * npm run test:multi-driver
 */
import * as fs from "node:fs";
import * as XLSX from "xlsx";
import {
  findDrivingReportBlockStarts,
  parseAllDrivingReportsFromSheet,
  type SheetMatrix,
} from "../src/lib/driving-report-parser";
import { decodeBufferForJapaneseCsv } from "../src/lib/encoding-detect";

const samplePath =
  process.argv[2] ??
  "C:/Users/大西本社/OneDrive/デスクトップ/運転日報20260530--20260605100923.xlsx";

function loadRows(path: string): unknown[][] {
  const buf = fs.readFileSync(path);
  const isCsv = /\.csv$/i.test(path);
  let wb;
  if (isCsv) {
    const { text, encoding } = decodeBufferForJapaneseCsv(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
    console.log("CSV encoding:", encoding);
    wb = XLSX.read(text, { type: "string", cellDates: false, raw: false });
  } else {
    wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
  }
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

/** 2人分縦連結の合成データ（実ファイルが1名分のみのときのロジック検証用） */
function buildSyntheticTwoDriverStack(base: SheetMatrix): SheetMatrix {
  const block2 = base.map((row) => {
    const copy = [...(row ?? [])];
    const joined = copy.map((c) => String(c)).join(" ");
    if (joined.includes("寺田")) {
      for (let i = 0; i < copy.length; i++) {
        if (String(copy[i]).includes("寺田")) {
          copy[i] = String(copy[i]).replace(/寺田\s*恵昇/g, "堀川 太郎");
        }
      }
    }
    if (joined.includes("34-88")) {
      for (let i = 0; i < copy.length; i++) {
        if (String(copy[i]).trim() === "34-88") copy[i] = "12-34";
      }
    }
    return copy;
  });

  return [...base, [], [], [], ...block2];
}

function runCheck(label: string, rows: SheetMatrix) {
  const starts = findDrivingReportBlockStarts(rows);
  const reports = parseAllDrivingReportsFromSheet(rows, label);

  console.log(`\n=== ${label} ===`);
  console.log("Total rows:", rows.length, "blocks:", starts.length);
  console.log("Drivers parsed:", reports.length);

  for (const r of reports) {
    const bad = /◆|ï¿½|縺/.test(
      `${r.driverName}${r.trips.map((t) => t.jobName + t.shipperName).join("")}`,
    );
    console.log(
      `  ${r.date} ${r.driverName} 車両:${r.vehicleNumber} km:${r.distanceKm} 業務:${r.trips.length}${bad ? " [MOJIBAKE]" : ""}`,
    );
    r.trips.forEach((t, i) => {
      console.log(`    ${i + 1}. ${t.shipperName} / ${t.jobName}`);
    });
  }

  return reports;
}

if (!fs.existsSync(samplePath)) {
  console.error("File not found:", samplePath);
  process.exit(1);
}

const rows = loadRows(samplePath);
const reports = runCheck("実ファイル", rows);

const synthetic = buildSyntheticTwoDriverStack(rows);
const synReports = runCheck("合成2名縦連結", synthetic);

const terada = reports.find((r) => r.driverName.includes("寺田"));
const teradaTripsOk = terada ? terada.trips.length === 3 : false;

const multiOk = synReports.length >= 2;
const hasHorikawa = synReports.some((r) => r.driverName.includes("堀川"));
const horikawa = synReports.find((r) => r.driverName.includes("堀川"));

const noMojibake = [...reports, ...synReports].every(
  (r) => !/◆|ï¿½|縺/.test(r.driverName),
);

const ok = teradaTripsOk && multiOk && hasHorikawa && noMojibake;

console.log(
  ok
    ? "\n✓ MULTI-DRIVER OK"
    : `\n✗ FAIL teradaTrips=${terada?.trips.length} synDrivers=${synReports.length} horikawa=${hasHorikawa}`,
);
process.exit(ok ? 0 : 1);
