import { readFileSync } from "fs";
import XLSX from "xlsx";
import { parseAmazonPerformanceSheet } from "../src/lib/amazon-performance-parser.ts";
import {
  normalizeOwnCompanyName,
  ownCompaniesUnifiedMatch,
  OWN_COMPANY_CANONICAL_NAME,
} from "../src/lib/amazon-own-company.ts";
import {
  findAmazonFmRecord,
  isOwnCompanyName,
  mergeAmazonPerformance,
} from "../src/lib/amazon-performance-merge.ts";
import { datesMatch, driverNamesMatch } from "../src/lib/import-match-keys.ts";

const path =
  "C:/Users/大西本社/OneDrive/デスクトップ/経営/Amazon実績.xlsx";
const wb = XLSX.read(readFileSync(path), { type: "buffer" });
const sheet = wb.Sheets["Sheet1"];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
const parsed = parseAmazonPerformanceSheet(rows);
console.log("parsed rows:", parsed.length);
if (parsed.length < 100) {
  console.error("FAIL: expected many rows");
  process.exit(1);
}

const sample = parsed.find(
  (r) => r.companyName === OWN_COMPANY_CANONICAL_NAME && r.driverName,
);
const partner = parsed.find((r) => r.companyName === "K-CARGO");
if (!sample || !partner) {
  console.error("FAIL: sample rows missing", { sample, partner });
  process.exit(1);
}
if (!isOwnCompanyName("カンロジ")) {
  console.error("FAIL: カンロジ should be own");
  process.exit(1);
}
if (!isOwnCompanyName(" カンサイロジック ")) {
  console.error("FAIL: カンサイロジック with spaces should be own");
  process.exit(1);
}
if (!isOwnCompanyName("株式会社カンサイロジック")) {
  console.error("FAIL: 株式会社カンサイロジック should be own");
  process.exit(1);
}
if (normalizeOwnCompanyName("カンロジ") !== OWN_COMPANY_CANONICAL_NAME) {
  console.error("FAIL: カンロジ should normalize to canonical");
  process.exit(1);
}
if (!ownCompaniesUnifiedMatch("カンロジ", "カンサイロジック")) {
  console.error("FAIL: カンロジ and カンサイロジック should unify");
  process.exit(1);
}
if (isOwnCompanyName("K-CARGO")) {
  console.error("FAIL: K-CARGO should not be own");
  process.exit(1);
}

const fmRecord = {
  id: "fm-1",
  date: sample.date,
  driverName: sample.driverName,
  operationType: "own",
  clockIn: "",
  clockOut: "",
  rollCallTime: "",
  reportStatus: "not_required",
  trips: [
    {
      id: "t1",
      runType: "own",
      vehicleNumber: "京都400あ600",
      shipperName: "Amazon",
      jobName: "Amazon HB②",
      revenue: "30000",
      tollFee: "",
      startMeter: "",
      endMeter: "",
      crew: [],
      partnerName: "",
      partnerFee: "",
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const hit = findAmazonFmRecord(
  [fmRecord],
  sample.date,
  sample.driverName,
  [],
  "カンロジ",
);
if (!hit) {
  console.error("FAIL: should find FM amazon record for カンロジ excel row");
  process.exit(1);
}

const kanlogiExcelRow = { ...sample, companyName: "カンロジ" };
const kanlogiMerge = mergeAmazonPerformance([kanlogiExcelRow], [fmRecord], {
  drivers: [],
  shippers: ["Amazon"],
  shipperJobs: {},
  partners: [],
  vehicles: [],
  employeeSalaries: {},
});
if (kanlogiMerge.summary.ownUpdate !== 1 || kanlogiMerge.summary.ownNew !== 0) {
  console.error("FAIL: カンロジ excel must merge into FM", kanlogiMerge.summary);
  process.exit(1);
}
if (kanlogiMerge.reviewRows[0]?.companyName !== OWN_COMPANY_CANONICAL_NAME) {
  console.error("FAIL: review company should be canonical", kanlogiMerge.reviewRows[0]);
  process.exit(1);
}

if (!driverNamesMatch("山崎", "山崎太郎")) {
  console.error("FAIL: fuzzy driver name 山崎 vs 山崎太郎");
  process.exit(1);
}
if (!driverNamesMatch("山崎 太郎", "山崎")) {
  console.error("FAIL: fuzzy driver name with spaces");
  process.exit(1);
}
if (!datesMatch(`${sample.date}T00:00:00.000Z`, sample.date)) {
  console.error("FAIL: ISO datetime date match", sample.date);
  process.exit(1);
}

const fmSurnameOnly = {
  ...fmRecord,
  id: "fm-surname",
  driverName: sample.driverName.slice(0, 2),
  trips: [
    {
      ...fmRecord.trips[0],
      shipperName: "ヤマト",
      jobName: "宅配",
    },
  ],
};
const hitSurname = findAmazonFmRecord(
  [fmSurnameOnly],
  sample.date,
  sample.driverName,
);
if (!hitSurname) {
  console.error("FAIL: should match FM record by surname only", {
    fm: fmSurnameOnly.driverName,
    excel: sample.driverName,
  });
  process.exit(1);
}

const mergedSurname = mergeAmazonPerformance([sample], [fmSurnameOnly], {
  drivers: [],
  shippers: ["Amazon"],
  shipperJobs: {},
  partners: [],
  vehicles: [],
  employeeSalaries: {},
});
if (mergedSurname.summary.ownUpdate !== 1 || mergedSurname.summary.ownNew !== 0) {
  console.error("FAIL: surname merge should update not create", mergedSurname.summary);
  process.exit(1);
}

const partnerOverlap = mergeAmazonPerformance([partner], [fmRecord], {
  drivers: [],
  shippers: ["Amazon"],
  shipperJobs: { Amazon: ["Amazon HB②"] },
  partners: [],
  vehicles: [],
  employeeSalaries: {},
});
if (
  partnerOverlap.summary.partnerNew !== 1 ||
  partnerOverlap.summary.ownUpdate !== 0
) {
  console.error("FAIL: partner row must not overwrite FM", partnerOverlap.summary);
  process.exit(1);
}
if (partnerOverlap.nextRecords.filter((r) => r.id === "fm-1").length !== 1) {
  console.error("FAIL: FM record should remain single");
  process.exit(1);
}

const merged = mergeAmazonPerformance([sample, partner], [fmRecord], {
  drivers: [],
  shippers: ["Amazon"],
  shipperJobs: { Amazon: ["Amazon HB②"] },
  partners: [],
  vehicles: [],
  employeeSalaries: {},
});
if (merged.summary.ownUpdate !== 1 || merged.summary.partnerNew !== 1) {
  console.error("FAIL: summary", merged.summary);
  process.exit(1);
}
const updated = merged.nextRecords.find((r) => r.id === "fm-1");
const trip = updated?.trips[0];
if (trip?.revenue !== String(sample.revenue)) {
  console.error("FAIL: revenue not updated", trip?.revenue, sample.revenue);
  process.exit(1);
}
console.log("OK", merged.summary);
