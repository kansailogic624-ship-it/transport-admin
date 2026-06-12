/**
 * FM社員スケジュール前処理 実データ監査
 * npx tsx scripts/audit-fm-employee-schedule.ts [xlsxPath]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDoc, getDocs, getFirestore } from "firebase/firestore";
import { PRESIDENT_EMAIL } from "../src/lib/auth-access";
import { parseEmployeeMasterSheet } from "../src/lib/employee-master-parser";
import { parseJobMasterSheet } from "../src/lib/job-master-parser";
import { parseVehicleMasterSheet } from "../src/lib/vehicle-master-parser";
import { allSheetMatricesFromArrayBuffer } from "../src/lib/spreadsheet-read";
import { processFmEmployeeScheduleSheets } from "../src/lib/import-preprocessor/fm-employee-schedule/build-result";
import type { FmEmployeeScheduleStagingRecord } from "../src/lib/import-preprocessor/fm-employee-schedule/types";
import {
  userEmployeeDetailsPath,
  userJobsPath,
  userMastersPath,
  userVehiclesPath,
} from "../src/services/firestore-paths";
import type {
  EmployeeDetail,
  JobDetail,
  MasterData,
  VehicleDetail,
} from "../src/lib/types";
import { DEFAULT_MASTERS } from "../src/lib/types";

const DEFAULT_SCHEDULE =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/ファイルメーカー日時売上/20260501-20260531.xlsx";
const BASE_DIR =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadXlsxRows(filePath: string): unknown[][] {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

async function tryLoadFromFirestore(): Promise<{
  masters: MasterData;
  employees: EmployeeDetail[];
  vehicles: VehicleDetail[];
  jobs: JobDetail[];
  source: string;
} | null> {
  const password = process.env.IMPORT_FIREBASE_PASSWORD;
  if (!password) return null;

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  };

  if (getApps().length === 0) initializeApp(firebaseConfig);
  const auth = getAuth();
  const cred = await signInWithEmailAndPassword(
    auth,
    process.env.IMPORT_FIREBASE_EMAIL ?? PRESIDENT_EMAIL,
    password,
  );
  const uid = cred.user.uid;
  const db = getFirestore();

  const mastersSnap = await getDoc(doc(db, userMastersPath(uid)));
  const masters = (mastersSnap.data()?.masters as MasterData) ?? DEFAULT_MASTERS;

  const employees = (
    await getDocs(collection(db, userEmployeeDetailsPath(uid)))
  ).docs.map((d) => ({ ...d.data(), id: d.id }) as EmployeeDetail);

  const vehicles = (await getDocs(collection(db, userVehiclesPath(uid)))).docs.map(
    (d) => ({ ...d.data(), id: d.id }) as VehicleDetail,
  );

  const jobs = (await getDocs(collection(db, userJobsPath(uid)))).docs.map(
    (d) => ({ ...d.data(), id: d.id }) as JobDetail,
  );

  return { masters, employees, vehicles, jobs, source: "Firestore" };
}

function loadFromLocalMasters(): {
  masters: MasterData;
  employees: EmployeeDetail[];
  vehicles: VehicleDetail[];
  jobs: JobDetail[];
  source: string;
} {
  const employees = parseEmployeeMasterSheet(
    loadXlsxRows(path.join(BASE_DIR, "社員マスタ.xlsx")),
  ).employees;
  const vehicles = parseVehicleMasterSheet(
    loadXlsxRows(path.join(BASE_DIR, "車両マスタ.xlsx")),
  ).vehicles;
  const jobs = parseJobMasterSheet(
    loadXlsxRows(path.join(BASE_DIR, "業務マスタ.xlsx")),
  ).jobs;

  const drivers = employees
    .filter((e) => e.activeFlag === 1)
    .map((e) => e.name);
  const shipperSet = new Set<string>();
  const shipperJobs: Record<string, string[]> = {};
  for (const job of jobs) {
    shipperSet.add(job.shipperName);
    const list = shipperJobs[job.shipperName] ?? [];
    if (!list.includes(job.jobName)) list.push(job.jobName);
    shipperJobs[job.shipperName] = list;
  }

  const masters: MasterData = {
    ...DEFAULT_MASTERS,
    drivers,
    vehicles: vehicles.map((v) => v.plateNumber || v.vehicleCode),
    shippers: [...shipperSet],
    shipperJobs,
  };

  return {
    masters,
    employees,
    vehicles,
    jobs,
    source: "ローカルマスタxlsx",
  };
}

function distinctUnresolved(
  records: FmEmployeeScheduleStagingRecord[],
  field: "employee" | "shipper" | "job" | "vehicle",
  getOriginal: (r: FmEmployeeScheduleStagingRecord) => string,
  skip?: (r: FmEmployeeScheduleStagingRecord) => boolean,
): string[] {
  const seen = new Set<string>();
  for (const r of records) {
    if (skip?.(r)) continue;
    const orig = getOriginal(r).trim();
    if (!orig) continue;
    if (r.aliasStatus[field] === "unresolved") seen.add(orig);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "ja"));
}

function printSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const schedulePath = process.argv[2] ?? DEFAULT_SCHEDULE;
  if (!fs.existsSync(schedulePath)) {
    throw new Error(`ファイルが見つかりません: ${schedulePath}`);
  }

  const ctx =
    (await tryLoadFromFirestore()) ?? loadFromLocalMasters();
  console.log(`マスタ源: ${ctx.source}`);
  console.log(
    `台帳: 社員${ctx.employees.length} / 車両${ctx.vehicles.length} / 業務${ctx.jobs.length}`,
  );
  console.log(`対象ファイル: ${schedulePath}`);

  const buffer = fs.readFileSync(schedulePath);
  const sheets = await allSheetMatricesFromArrayBuffer(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    path.basename(schedulePath),
  );

  const { records, operationSummaries, fmScheduleTotals } =
    processFmEmployeeScheduleSheets(
      sheets,
      path.basename(schedulePath),
      ctx.masters,
      {
        employees: ctx.employees,
        vehicles: ctx.vehicles,
        jobs: ctx.jobs,
      },
    );

  const recon = fmScheduleTotals.revenueReconciliation;
  const workRecords = records.filter((r) => !r.isAttendanceOnlyRow);

  printSection("1. 未解決社員");
  const unresolvedEmployees = distinctUnresolved(
    records,
    "employee",
    (r) => r.employeeNameOriginal,
    (r) => r.isPartnerLikeRow,
  );
  console.log(`件数: ${unresolvedEmployees.length}`);
  if (unresolvedEmployees.length) {
    console.log(unresolvedEmployees.join(" / "));
  } else {
    console.log("OK — 未解決社員なし");
  }

  printSection("2. 未解決車両");
  const unresolvedVehicles = distinctUnresolved(
    records,
    "vehicle",
    (r) =>
      r.vehicleNumberOriginal.trim() || r.vehicleNumberFilled?.trim() || "",
  );
  console.log(`件数: ${unresolvedVehicles.length}`);
  if (unresolvedVehicles.length) {
    console.log(unresolvedVehicles.join(" / "));
  } else {
    console.log("OK — 未解決車両なし");
  }

  printSection("3. 未解決荷主・業務");
  const unresolvedShippers = distinctUnresolved(
    records,
    "shipper",
    (r) => r.shipperNameOriginal,
    (r) => r.isAttendanceOnlyRow,
  );
  const unresolvedJobs = distinctUnresolved(
    records,
    "job",
    (r) => r.jobNameOriginal,
    (r) => r.isAttendanceOnlyRow,
  );
  console.log(`未解決荷主: ${unresolvedShippers.length}`);
  if (unresolvedShippers.length) console.log(unresolvedShippers.join(" / "));
  console.log(`未解決業務: ${unresolvedJobs.length}`);
  if (unresolvedJobs.length) console.log(unresolvedJobs.join(" / "));
  if (!unresolvedShippers.length && !unresolvedJobs.length) {
    console.log("OK — 未解決荷主・業務なし");
  }

  printSection("4. 2マン判定");
  const jointOps = operationSummaries.filter((o) => o.isJointOperation);
  console.log(`2マン運行数: ${jointOps.length} / 全運行 ${operationSummaries.length}`);
  const suspiciousJoint = jointOps.filter((o) => o.jointOperationMemberCount >= 4);
  if (suspiciousJoint.length) {
    console.log(`注意: メンバー4名以上の運行 ${suspiciousJoint.length} 件`);
    for (const op of suspiciousJoint.slice(0, 10)) {
      console.log(
        `  ${op.businessDate} ${op.shipperNameCanonical}/${op.jobNameCanonical} メンバー${op.jointOperationMemberCount}`,
      );
    }
  }
  const soloLikeJoint = jointOps.filter((o) => {
    const names = o.jointOperationMembers.map(
      (m) => m.employeeNameCanonical ?? m.employeeNameOriginal,
    );
    return new Set(names).size < names.length;
  });
  if (soloLikeJoint.length) {
    console.log(`注意: 同一社員重複の2マン ${soloLikeJoint.length} 件`);
  }
  console.log("2マン運行サンプル（先頭10件）:");
  for (const op of jointOps.slice(0, 10)) {
    const members = op.jointOperationMembers
      .map((m) => m.employeeNameCanonical ?? m.employeeNameOriginal)
      .join("、");
    console.log(
      `  ${op.businessDate} | ${op.shipperNameCanonical} / ${op.jobNameCanonical} / ${op.vehicleNumberCanonical} | ${members} | 会社¥${op.operationRevenueAmount ?? 0}`,
    );
  }

  printSection("5. Amazon HB②（2026-05-01）");
  const isAmazonHb2 = (r: FmEmployeeScheduleStagingRecord) =>
    r.jobNameOriginal === "Amazon HB②" ||
    r.jobNameCanonical === "Amazon HB②";
  const amazonHb2Rows = workRecords.filter(
    (r) => r.businessDate === "2026-05-01" && isAmazonHb2(r),
  );
  const amazonHb2Sum = amazonHb2Rows.reduce(
    (s, r) => s + (r.revenueAmount ?? 0),
    0,
  );
  const amazonHb2Joint = operationSummaries.find(
    (o) => o.businessDate === "2026-05-01" && o.jobNameCanonical === "Amazon HB②",
  );
  console.log(`Amazon HB② 行数: ${amazonHb2Rows.length}`);
  for (const r of amazonHb2Rows) {
    console.log(
      `  ${r.employeeNameOriginal} | 車両:${r.vehicleNumberOriginal || r.vehicleNumberFilled || "—"} | 社員売上¥${r.revenueAmount ?? 0} | 共同:${r.isJointOperation}`,
    );
  }
  console.log(`Amazon HB② 社員売上合計: ¥${amazonHb2Sum.toLocaleString()}`);
  console.log(
    `Amazon HB② 会社売上(jointJobKey): ¥${(amazonHb2Joint?.operationRevenueAmount ?? 0).toLocaleString()}`,
  );
  if (amazonHb2Sum === 53000 && (amazonHb2Joint?.operationRevenueAmount ?? 0) === 53000) {
    console.log("OK — Amazon HB② 会社売上 ¥53,000 / 社員各 ¥26,500");
  }

  printSection("6. 車両補完");
  const filled = records.filter((r) =>
    r.infoFlags.includes("VEHICLE_FILLED_FROM_EMPLOYEE_DAY"),
  );
  const jointFilled = records.filter((r) =>
    r.infoFlags.includes("VEHICLE_FILLED_FROM_JOINT_JOB"),
  );
  console.log(`社員日補完行数: ${filled.length}`);
  console.log(`共同作業補完行数: ${jointFilled.length}`);
  for (const r of filled.slice(0, 15)) {
    console.log(
      `  行${r.sourceRowNumber} ${r.employeeNameOriginal} | 補完 ${r.vehicleNumberFilled} → ${r.vehicleNumberCanonical} (元行${r.vehicleNumberFilledFromRowNumber})`,
    );
  }
  const multiVehicleDays = records.filter((r) =>
    r.warningFlags.includes("MULTIPLE_VEHICLES_SAME_DAY"),
  );
  const uniqueDays = new Set(multiVehicleDays.map((r) => r.employeeDayKey));
  console.log(`同一社員日で複数車両警告: ${uniqueDays.size} 社員日`);

  printSection("7. 勤怠・休み・有給行の売上集計");
  const attendanceRows = records.filter((r) => r.isAttendanceOnlyRow);
  const holidayRows = records.filter((r) => r.isHolidayRow);
  const attendanceInCompany = attendanceRows.filter((r) => r.countsForCompanyRevenue);
  const attendanceInShare = attendanceRows.reduce(
    (s, r) => s + r.employeeRevenueShareAmount,
    0,
  );
  const attendanceRawRevenue = attendanceRows.reduce(
    (s, r) => s + (r.revenueAmount ?? 0),
    0,
  );
  console.log(`勤怠行: ${attendanceRows.length} / 休暇行: ${holidayRows.length}`);
  console.log(
    `勤怠行の会社計上フラグtrue: ${attendanceInCompany.length} (期待0)`,
  );
  console.log(
    `勤怠行の按分売上合計: ¥${attendanceInShare} / 原文売上: ¥${attendanceRawRevenue} (期待0)`,
  );
  if (
    attendanceInCompany.length === 0 &&
    attendanceInShare === 0 &&
    attendanceRawRevenue === 0
  ) {
    console.log("OK — 勤怠・休み行は売上集計に含まれていない");
  }

  printSection("8. Excel原文 vs 会社売上");
  const excelTotal = recon.excelOriginalTotal;
  const companyTotal = recon.companyTotal;
  const gap = excelTotal - companyTotal;
  console.log(`Excel原文売上合計: ¥${excelTotal.toLocaleString()}`);
  console.log(`会社売上合計: ¥${companyTotal.toLocaleString()}`);
  console.log(`社員別売上合計: ¥${recon.employeeShareTotal.toLocaleString()}`);
  console.log(`差額: ¥${gap.toLocaleString()}`);
  if (gap === 0) {
    console.log("OK — Excel原文と会社売上が一致");
  }

  printSection("傭車・外注ラベル / 退職者休み行");
  const partnerRows = records.filter((r) => r.isPartnerLikeRow);
  const partnerRevenueInShare = partnerRows.reduce(
    (s, r) => s + r.employeeRevenueShareAmount,
    0,
  );
  const partnerCompanyRevenue = partnerRows.reduce(
    (s, r) => s + (r.revenueAmount ?? 0),
    0,
  );
  const partnerLaborRows = partnerRows.filter((r) => r.countsForLaborTime).length;
  console.log(`外注ラベル行: ${partnerRows.length}`);
  console.log(`社員按分合計: ¥${partnerRevenueInShare} (期待0)`);
  console.log(`会社売上計上: ¥${partnerCompanyRevenue.toLocaleString()}`);
  console.log(`労働時間計上行: ${partnerLaborRows} (期待0)`);

  const inactiveHoliday = records.filter(
    (r) =>
      r.resolvedInactiveEmployee &&
      (r.isHolidayRow || r.isAttendanceOnlyRow),
  );
  console.log(`退職者休み・勤怠行: ${inactiveHoliday.length}`);
  if (inactiveHoliday.length) {
    const sample = inactiveHoliday[0]!;
    console.log(
      `  サンプル: ${sample.businessDate} ${sample.employeeNameOriginal} flags=${sample.infoFlags.join(",")}`,
    );
  }

  printSection("同乗教育の可能性（要確認運行）");
  const rideAlongRows = records.filter((r) =>
    r.warningFlags.includes("POSSIBLE_RIDE_ALONG_TRAINING"),
  );
  const reviewOps = operationSummaries.filter((o) => o.requiresHumanReview);
  console.log(`要確認運行: ${reviewOps.length} / 同乗教育警告行: ${rideAlongRows.length}`);
  for (const op of reviewOps.slice(0, 15)) {
    const opRows = records.filter((r) => r.jointJobKey === op.jointJobKey);
    const members = opRows
      .map((r) => r.employeeNameOriginal)
      .join("、");
    console.log(
      `  ${op.businessDate} ${op.shipperNameCanonical}/${op.jobNameCanonical} | 行${opRows.length} | ${members} | 会社¥${op.operationRevenueAmount ?? 0}`,
    );
  }

  printSection("検算・総合");
  console.log(`検算一致: ${recon.isBalanced ? "YES" : "NO"}`);
  if (!recon.isBalanced) {
    console.log(recon.mismatchReasons.join(" / "));
  }
  console.log(`読込行: ${records.length} / 業務行: ${workRecords.length}`);
  console.log(
    `警告行: ${fmScheduleTotals.warningRowCount} / 2マン: ${fmScheduleTotals.jointOperationCount}`,
  );

  const issues: string[] = [];
  if (unresolvedEmployees.length) issues.push("未解決社員あり");
  if (unresolvedVehicles.length) issues.push("未解決車両あり");
  if (unresolvedShippers.length) issues.push("未解決荷主あり");
  if (unresolvedJobs.length) issues.push("未解決業務あり");
  if (attendanceInCompany.length || attendanceInShare > 0) {
    issues.push("勤怠行が売上に混入");
  }
  if (!recon.isBalanced) issues.push("売上検算不一致");
  if (amazonHb2Sum !== 53000) issues.push("Amazon HB② 会社売上が ¥53,000 でない");

  printSection("総合判定");
  if (issues.length === 0) {
    console.log("PASS — 実データ監査で重大な問題は検出されませんでした");
  } else {
    console.log("要確認:");
    for (const i of issues) console.log(`  - ${i}`);
  }

  const report = {
    schedulePath,
    masterSource: ctx.source,
    ledgerCounts: {
      employees: ctx.employees.length,
      vehicles: ctx.vehicles.length,
      jobs: ctx.jobs.length,
    },
    rowCounts: {
      total: records.length,
      work: workRecords.length,
      attendance: attendanceRows.length,
      holiday: holidayRows.length,
      warnings: fmScheduleTotals.warningRowCount,
    },
    unresolved: {
      employees: unresolvedEmployees,
      vehicles: unresolvedVehicles,
      shippers: unresolvedShippers,
      jobs: unresolvedJobs,
    },
    jointOperations: {
      count: jointOps.length,
      totalOperations: operationSummaries.length,
      suspiciousFourPlus: suspiciousJoint.length,
      duplicateMember: soloLikeJoint.length,
    },
    amazonHb2: {
      rowCount: amazonHb2Rows.length,
      employeeRevenueSum: amazonHb2Sum,
      companyRevenue: amazonHb2Joint?.operationRevenueAmount ?? 0,
      rows: amazonHb2Rows.map((r) => ({
        employee: r.employeeNameOriginal,
        revenue: r.revenueAmount,
        employeeShare: r.employeeRevenueShareAmount,
        vehicle: r.vehicleNumberOriginal || r.vehicleNumberFilled,
      })),
    },
    vehicleFill: {
      employeeDayFilledRows: filled.length,
      jointJobFilledRows: jointFilled.length,
      multiVehicleEmployeeDays: uniqueDays.size,
    },
    attendanceRevenue: {
      companyFlaggedRows: attendanceInCompany.length,
      shareTotal: attendanceInShare,
      rawRevenue: attendanceRawRevenue,
    },
    rideAlong: {
      reviewOperationCount: reviewOps.length,
      warningRowCount: rideAlongRows.length,
      operations: reviewOps.map((op) => ({
        businessDate: op.businessDate,
        shipper: op.shipperNameCanonical,
        job: op.jobNameCanonical,
        companyAmount: op.operationRevenueAmount,
        rowCount: op.rowCount,
      })),
    },
    revenue: {
      excelOriginalTotal: excelTotal,
      companyTotal,
      employeeShareTotal: recon.employeeShareTotal,
      gap,
      isBalanced: recon.isBalanced,
      mismatchReasons: recon.mismatchReasons,
    },
    verdict: issues.length === 0 ? "PASS" : "REVIEW",
    issues,
  };

  const jsonPath = path.join(process.cwd(), "scripts", "audit-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nJSONレポート: ${jsonPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
