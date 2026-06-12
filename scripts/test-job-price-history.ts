/**
 * npm run test:job-price
 */
import * as fs from "node:fs";
import * as XLSX from "xlsx";
import {
  getJobPriceForDate,
  normalizeJobDetails,
  parsePriceRevisionNote,
} from "../src/lib/job-price-history";
import { parseJobMasterSheet } from "../src/lib/job-master-parser";

const defaultPath =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/業務マスタ.xlsx";

const sample = parsePriceRevisionNote("2023.05.01より改定 28000→28800");
console.log("revision parse", sample);
if (!sample || sample.newPrice !== 28800) {
  process.exit(1);
}

const filePath = process.argv[2] ?? defaultPath;
if (!fs.existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
const ws = wb.Sheets[wb.SheetNames[0]!]!;
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

const { jobs } = parseJobMasterSheet(rows);
const normalized = normalizeJobDetails(jobs);
const withHistory = normalized.filter((j) => j.priceHistory.length > 1);
console.log("jobs with multi history", withHistory.length);
if (withHistory[0]) {
  const job = withHistory[0];
  console.log("sample job", job.jobName, job.revenue, job.priceHistory);
  console.log(
    "price before revision",
    getJobPriceForDate(job, "2023-04-30"),
  );
  console.log(
    "price on revision",
    getJobPriceForDate(job, "2023-05-01"),
  );
}
