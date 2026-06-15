/**
 * 滋賀店配 × FM社員スケジュール 実データ調査
 * npx tsx scripts/audit-shiga-fm-mapping.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { parseEmployeeMasterSheet } from "../src/lib/employee-master-parser";
import { parseJobMasterSheet } from "../src/lib/job-master-parser";
import { parseVehicleMasterSheet } from "../src/lib/vehicle-master-parser";
import { allSheetMatricesFromArrayBuffer } from "../src/lib/spreadsheet-read";
import { processFmEmployeeScheduleSheets } from "../src/lib/import-preprocessor/fm-employee-schedule/build-result";
import { SHIGA_DELIVERY_COURSES } from "../src/lib/import-preprocessor/shiga-delivery/course-definitions";
import type { FmEmployeeScheduleStagingRecord } from "../src/lib/import-preprocessor/fm-employee-schedule/types";
import { DEFAULT_MASTERS } from "../src/lib/types";

const BASE =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理";
const SCHEDULE = path.join(
  BASE,
  "ファイルメーカー日時売上",
  "20260501-20260531.xlsx",
);

function loadXlsxRows(filePath: string): unknown[][] {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

function normalize(s: string): string {
  return s.replace(/\u3000/g, " ").trim();
}

const SHIGA_JOB_PATTERNS = [
  /滋賀/,
  /地区/,
  /店配/,
  /守山/,
  /長浜/,
  /彦根/,
  /草津/,
  /大津/,
  /堅田/,
  /今津/,
  /近江/,
  /水口/,
];

const SHIPPER_PATTERNS = [/ジョーシン/i, /ｼﾞｮｰｼﾝ/, /JOISHIN/i, /ジョウシン/];

const VENDOR_PATTERNS = [/エフエー/, /ＦＡ/, /FA/, /411089/];

function guessCourseId(jobName: string): string | null {
  const j = normalize(jobName);
  for (const course of SHIGA_DELIVERY_COURSES) {
    if (j.includes(course.courseName)) return course.courseId;
    if (course.courseId === "SHIGA_04" && /守山/.test(j)) return course.courseId;
  }
  if (/①|１|1/.test(j) && /滋賀|地区/.test(j)) return "SHIGA_01";
  if (/②|２|2/.test(j) && /滋賀|地区/.test(j)) return "SHIGA_02";
  if (/③|３|3/.test(j) && /滋賀|地区/.test(j)) return "SHIGA_03";
  if (/④|４|4/.test(j) && /滋賀|地区/.test(j)) return "SHIGA_04";
  return null;
}

function isShigaCandidate(r: FmEmployeeScheduleStagingRecord): boolean {
  const shipper = normalize(r.shipperNameOriginal);
  const job = normalize(r.jobNameOriginal);
  const employee = normalize(r.employeeNameOriginal);
  const partner = normalize(r.partnerNameOriginal ?? "");
  const note = normalize(r.personalNote);

  if (SHIPPER_PATTERNS.some((p) => p.test(shipper))) return true;
  if (SHIGA_JOB_PATTERNS.some((p) => p.test(job))) return true;
  if (VENDOR_PATTERNS.some((p) => p.test(employee) || p.test(partner))) {
    if (SHIGA_JOB_PATTERNS.some((p) => p.test(job)) || SHIPPER_PATTERNS.some((p) => p.test(shipper)))
      return true;
  }
  if (/滋賀/.test(note)) return true;
  return false;
}

function vendorDisplay(r: FmEmployeeScheduleStagingRecord): string {
  const parts: string[] = [];
  if (r.partnerNameOriginal) parts.push(`partner=${r.partnerNameOriginal}`);
  if (r.isPartnerLikeRow) parts.push("(partnerRow)");
  if (VENDOR_PATTERNS.some((p) => p.test(r.employeeNameOriginal))) {
    parts.push(`employee=${r.employeeNameOriginal}`);
  }
  if (parts.length === 0) parts.push(`employee=${r.employeeNameOriginal}`);
  return parts.join(" / ");
}

const JOSHIN_COURSE_MAP: Record<string, string | null> = {
  "Joshin①": "SHIGA_01",
  "Joshin②": "SHIGA_02",
  "Joshin③": "SHIGA_03",
  "Joshin④": "SHIGA_04",
  "Joshin⑤": null,
  "Joshin⑥": null,
  "Joshin⑦": null,
  "Joshin⑧": null,
  "Joshin⑨": null,
};

async function main() {
  const employees = parseEmployeeMasterSheet(
    loadXlsxRows(path.join(BASE, "社員マスタ.xlsx")),
  ).employees;
  const vehicles = parseVehicleMasterSheet(
    loadXlsxRows(path.join(BASE, "車両マスタ.xlsx")),
  ).vehicles;
  const jobs = parseJobMasterSheet(
    loadXlsxRows(path.join(BASE, "業務マスタ.xlsx")),
  ).jobs;

  const shigaJobsFromMaster = jobs.filter(
    (j) =>
      SHIGA_JOB_PATTERNS.some((p) => p.test(j.jobName)) ||
      SHIPPER_PATTERNS.some((p) => p.test(j.shipperName)),
  );

  const buf = fs.readFileSync(SCHEDULE);
  const sheets = await allSheetMatricesFromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    path.basename(SCHEDULE),
  );
  const { records } = processFmEmployeeScheduleSheets(
    sheets,
    path.basename(SCHEDULE),
    {
      ...DEFAULT_MASTERS,
      drivers: employees.filter((e) => e.activeFlag === 1).map((e) => e.name),
      vehicles: vehicles.map((v) => v.plateNumber || v.vehicleCode),
      shippers: [...new Set(jobs.map((j) => j.shipperName))],
      shipperJobs: Object.fromEntries(
        [...new Set(jobs.map((j) => j.shipperName))].map((s) => [
          s,
          jobs.filter((j) => j.shipperName === s).map((j) => j.jobName),
        ]),
      ),
    },
    { employees, vehicles, jobs },
  );

  const candidates = records.filter(isShigaCandidate);
  const revenueCandidates = candidates.filter((r) => r.isRevenueRow);

  const jobNames = new Map<string, number>();
  const shipperNames = new Map<string, number>();
  const vendorFields = {
    partnerNameOriginal: 0,
    employeeAsVendor: 0,
    partnerLikeRow: 0,
    personalNoteVendor: 0,
  };

  for (const r of revenueCandidates) {
    const job = normalize(r.jobNameOriginal);
    const shipper = normalize(r.shipperNameOriginal);
    jobNames.set(job, (jobNames.get(job) ?? 0) + 1);
    shipperNames.set(shipper, (shipperNames.get(shipper) ?? 0) + 1);
    if (r.partnerNameOriginal) vendorFields.partnerNameOriginal++;
    if (r.isPartnerLikeRow) vendorFields.partnerLikeRow++;
    if (VENDOR_PATTERNS.some((p) => p.test(r.employeeNameOriginal)))
      vendorFields.employeeAsVendor++;
    if (VENDOR_PATTERNS.some((p) => p.test(r.personalNote)))
      vendorFields.personalNoteVendor++;
  }

  console.log("=== FM実データ確認結果 ===");
  console.log("schedule:", SCHEDULE);
  console.log("totalRecords:", records.length);
  console.log("shigaCandidates:", candidates.length);
  console.log("revenueCandidates:", revenueCandidates.length);

  console.log("\n--- 業務マスタ（滋賀・ジョーシン関連）---");
  for (const j of shigaJobsFromMaster) {
    console.log(`  荷主=${j.shipperName} / 業務=${j.jobName}`);
  }

  console.log("\n--- FM業務名一覧（候補行・売上あり）---");
  for (const [name, count] of [...jobNames.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x ${name} → courseId=${guessCourseId(name) ?? "?"}`);
  }

  console.log("\n--- FM荷主名一覧（候補行・売上あり）---");
  for (const [name, count] of [...shipperNames.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x ${name}`);
  }

  console.log("\n--- 業者名フィールド出現 ---");
  console.log(JSON.stringify(vendorFields, null, 2));

  const faTruckRows = records.filter(
    (r) =>
      normalize(r.shipperNameOriginal) === "FAトラック" &&
      r.isRevenueRow &&
      (r.revenueAmount ?? 0) > 0,
  );

  console.log("\n--- FAトラック（滋賀店配本命）業務名一覧 ---");
  const faJobs = new Map<string, number>();
  for (const r of faTruckRows) {
    const job = normalize(r.jobNameOriginal);
    faJobs.set(job, (faJobs.get(job) ?? 0) + 1);
  }
  for (const [name, count] of [...faJobs.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${count}x ${name} → courseId=${JOSHIN_COURSE_MAP[name] ?? "対象外"}`,
    );
  }

  console.log("\n--- サンプル10件（FAトラック × Joshin系）---");
  const seen = new Set<string>();
  const samples: FmEmployeeScheduleStagingRecord[] = [];
  for (const r of faTruckRows) {
    if (!/^Joshin/.test(r.jobNameOriginal)) continue;
    const key = `${r.businessDate}|${r.jobNameOriginal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push(r);
    if (samples.length >= 10) break;
  }

  for (const r of samples) {
    const vehicle =
      r.vehicleNumberOriginal.trim() ||
      r.vehicleNumberFilled?.trim() ||
      "—";
    console.log(
      JSON.stringify({
        date: r.businessDate,
        shipper: r.shipperNameOriginal,
        job: r.jobNameOriginal,
        vendorField: "shipperNameOriginal",
        vendor: r.shipperNameOriginal,
        revenue: r.revenueAmount,
        vehicle,
        employee: r.employeeNameOriginal,
        courseId: JOSHIN_COURSE_MAP[r.jobNameOriginal] ?? null,
        partnerNameOriginal: r.partnerNameOriginal,
        isPartnerLikeRow: r.isPartnerLikeRow,
        personalNote: r.personalNote || null,
      }),
    );
  }

  // Also search raw rows for 滋賀 in job column without filter
  const rawRows = sheets[0]?.rows ?? [];
  const rawJobHits = new Set<string>();
  const rawShipperHits = new Set<string>();
  for (const row of rawRows) {
    const shipper = normalize(String(row[1] ?? ""));
    const job = normalize(String(row[2] ?? ""));
    if (SHIGA_JOB_PATTERNS.some((p) => p.test(job))) {
      rawJobHits.add(`${shipper} | ${job}`);
    }
    if (SHIPPER_PATTERNS.some((p) => p.test(shipper))) {
      rawShipperHits.add(shipper);
    }
  }
  console.log("\n--- 生データ業務名ヒット（荷主|業務）---");
  for (const hit of [...rawJobHits].sort()) console.log(`  ${hit}`);
  console.log("\n--- 生データ荷主名ヒット ---");
  for (const hit of [...rawShipperHits].sort()) console.log(`  ${hit}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
