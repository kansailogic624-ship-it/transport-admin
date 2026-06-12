/**
 * npm run test:job-master
 */
import * as fs from "node:fs";
import * as XLSX from "xlsx";
import { parseJobMasterSheet } from "../src/lib/job-master-parser";

const defaultPath =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/業務マスタ.xlsx";

const filePath = process.argv[2] ?? defaultPath;

if (!fs.existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
const ws = wb.Sheets[wb.SheetNames[0]!]!;
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

const { jobs, warnings } = parseJobMasterSheet(rows);

console.log("parsed", jobs.length, "jobs");
if (jobs[0]) {
  console.log("sample", JSON.stringify(jobs[0], null, 2));
}
if (warnings.length > 0) {
  console.log("warnings", warnings);
}

if (jobs.length < 1) {
  process.exit(1);
}
