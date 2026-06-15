/**
 * 滋賀店配 × FM突合テスト（Phase B）
 * npx tsx scripts/test-shiga-fm-reconciliation.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { parseEmployeeMasterSheet } from "../src/lib/employee-master-parser";
import { parseJobMasterSheet } from "../src/lib/job-master-parser";
import { parseVehicleMasterSheet } from "../src/lib/vehicle-master-parser";
import { allSheetMatricesFromArrayBuffer } from "../src/lib/spreadsheet-read";
import { buildShigaFmReconciliationResult } from "../src/lib/import-preprocessor/shiga-fm-reconciliation/build-result";
import { SHIGA_FM_EMPLOYEE_PAYMENT_NOTE } from "../src/lib/import-preprocessor/shiga-fm-reconciliation/cost-classifier";
import {
  buildShigaDeliveryPreprocessResult,
  processShigaDeliverySheets,
} from "../src/lib/import-preprocessor/shiga-delivery/build-result";
import {
  buildFmEmployeeSchedulePreprocessResult,
  processFmEmployeeScheduleSheets,
} from "../src/lib/import-preprocessor/fm-employee-schedule/build-result";
import { calcContractAmounts } from "../src/lib/shiga-fm/contract-calc";
import {
  TEST_BILLING_SHIPPER_ID,
  buildTestBillingContracts,
  buildTestPaymentContracts,
} from "./test-fixtures/shiga-fm-contract-fixtures";
import {
  buildEmployeeNameSet,
  isOwnEmployeeRow,
} from "../src/lib/import-preprocessor/shiga-fm-reconciliation/cost-classifier";
import { DEFAULT_MASTERS } from "../src/lib/types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const BASE =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理";
const FM = path.join(BASE, "ファイルメーカー日時売上", "20260501-20260531.xlsx");
const SHIGA =
  "C:/Users/大西本社/カンロジ Dropbox/カンロジ チーム フォルダ/3.飼鳥BOX/ｼﾞｮｰｼﾝ/滋賀店配データ入力sheet/2026年/滋賀店配データー入力sheet【2026年05月度】.xlsx";

function loadXlsxRows(filePath: string): unknown[][] {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

async function loadFixtures() {
  const employees = parseEmployeeMasterSheet(
    loadXlsxRows(path.join(BASE, "社員マスタ.xlsx")),
  ).employees;
  const vehicles = parseVehicleMasterSheet(
    loadXlsxRows(path.join(BASE, "車両マスタ.xlsx")),
  ).vehicles;
  const jobs = parseJobMasterSheet(
    loadXlsxRows(path.join(BASE, "業務マスタ.xlsx")),
  ).jobs;
  const masters = {
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
  };
  const ledger = { employees, vehicles, jobs };
  const employeeNames = employees
    .filter((e) => e.activeFlag === 1)
    .map((e) => e.name);
  const paymentContracts = buildTestPaymentContracts();
  const billingContracts = buildTestBillingContracts();

  const fmBuf = fs.readFileSync(FM);
  const fmSheets = await allSheetMatricesFromArrayBuffer(
    fmBuf.buffer.slice(fmBuf.byteOffset, fmBuf.byteOffset + fmBuf.byteLength),
    path.basename(FM),
  );
  const fmProcessed = buildFmEmployeeSchedulePreprocessResult({
    fileName: path.basename(FM),
    ...processFmEmployeeScheduleSheets(
      fmSheets,
      path.basename(FM),
      masters,
      ledger,
    ),
    createdAt: new Date().toISOString(),
  });

  const shigaWb = XLSX.readFile(SHIGA, { cellDates: false });
  const shigaRows = XLSX.utils.sheet_to_json(
    shigaWb.Sheets["滋賀_"]!,
    { header: 1, defval: "", raw: true },
  ) as unknown[][];
  const shigaProcessed = buildShigaDeliveryPreprocessResult({
    fileName: path.basename(SHIGA),
    ...processShigaDeliverySheets(
      [{ sheetName: "滋賀_", rows: shigaRows }],
      path.basename(SHIGA),
    ),
    createdAt: new Date().toISOString(),
  });

  return {
    shigaProcessed,
    fmProcessed,
    employeeNames,
    paymentContracts,
    billingContracts,
  };
}

async function testBoth() {
  const { shigaProcessed, fmProcessed, employeeNames, paymentContracts, billingContracts } =
    await loadFixtures();

  const result = buildShigaFmReconciliationResult({
    shigaResult: shigaProcessed,
    fmResult: fmProcessed,
    paymentContracts,
    billingContracts,
    billingShipperId: TEST_BILLING_SHIPPER_ID,
    employeeNames,
  });

  assert(result.inputMode === "both", `inputMode ${result.inputMode}`);
  assert(result.rows.length > 0, "rows > 0");
  assert(result.totals.grossProfitAvailable, "grossProfitAvailable");
  assert(
    result.rows.every((r) => (r.reconcileIssues?.length ?? 0) > 0),
    "all rows enriched with reconcileIssues",
  );

  const may1_01 = result.rows.find(
    (r) =>
      r.businessDate === "2026-05-01" &&
      r.courseId === "SHIGA_01" &&
      r.slotIndex === 1,
  );
  assert(may1_01?.status === "matched", `may1 SHIGA_01 ${may1_01?.status}`);
  assert(may1_01?.costCategory === "employee", "may1 employee category");
  assert(may1_01?.paymentAmount === 0, "may1 payment 0");
  assert(may1_01?.salesAmount === 37450, "may1 sales");
  assert(
    may1_01?.grossProfitAmount === may1_01?.salesAmount,
    "may1 gross = sales",
  );
  assert(
    may1_01?.notes.includes(SHIGA_FM_EMPLOYEE_PAYMENT_NOTE),
    "may1 employee note",
  );

  const may1_02 = result.rows.find(
    (r) =>
      r.businessDate === "2026-05-01" &&
      r.courseId === "SHIGA_02" &&
      r.slotIndex === 1,
  );
  assert(may1_02?.costCategory === "employee", "may1_02 employee (松本)");
  assert(may1_02?.paymentAmount === 0, "may1_02 payment 0");
  assert(
    may1_02?.notes.includes(SHIGA_FM_EMPLOYEE_PAYMENT_NOTE),
    "may1_02 employee note",
  );

  const junseiContract = paymentContracts.find((c) => c.partnerName === "潤生輸送")!;
  const junseiCalc = calcContractAmounts(junseiContract, billingContracts[0]!, {
    overtimeHours: 0,
    tollAmount: 0,
  });
  assert(junseiCalc.invoiceAmount === 26_950, "潤生 invoice");
  assert(junseiCalc.paymentAmount === 27_500, "潤生 payment");
  assert(junseiCalc.grossProfitAmount === -550, "潤生 profit");

  const junseiSlot = result.rows.find(
    (r) =>
      r.courseId === "SHIGA_02" &&
      r.costCategory === "partner" &&
      r.paymentParty.includes("潤生"),
  );
  if (junseiSlot) {
    assert(junseiSlot.paymentAmount === 27_500, `junsei slot payment ${junseiSlot.paymentAmount}`);
    console.log("潤生スロット検出", {
      date: junseiSlot.businessDate,
      sales: junseiSlot.salesAmount,
      payment: junseiSlot.paymentAmount,
      profit: junseiSlot.grossProfitAmount,
    });
  } else {
    console.log("OK: 5月データに非社員のSHIGA_02行なし（契約計算は単体検証済み）");
  }

  const may1_04_slots = result.rows.filter(
    (r) => r.businessDate === "2026-05-01" && r.courseId === "SHIGA_04",
  );
  assert(may1_04_slots.length >= 2, `may1_04 slots ${may1_04_slots.length}`);
  assert(
    may1_04_slots.some((r) => r.jobName === "Joshin④"),
    "may1_04 has Joshin④",
  );
  assert(
    may1_04_slots.some((r) => r.jobName === "Joshin⑤"),
    "may1_04 has Joshin⑤",
  );

  const shiga04Record = shigaProcessed.shigaDeliveryRecords?.find(
    (r) => r.businessDate === "2026-05-01" && r.courseId === "SHIGA_04",
  );
  if (shiga04Record && shiga04Record.unitCount > may1_04_slots.filter((r) => r.fmRecords.length > 0).length) {
    assert(
      may1_04_slots.some((r) => r.status === "fm_shortage"),
      "SHIGA_04 fm_shortage slot when FM count < unitCount",
    );
    assert(result.totals.fmShortageCount > 0, "fm_shortage total > 0");
  }

  const may1_03 = result.rows.filter(
    (r) => r.businessDate === "2026-05-01" && r.courseId === "SHIGA_03",
  );
  assert(may1_03.length > 0, "may1 SHIGA_03 rows exist");
  assert(
    may1_03.every((r) => r.status === "fm_shortage"),
    `may1 SHIGA_03 fm_shortage slots: ${may1_03.map((r) => r.status).join(",")}`,
  );
  assert(
    may1_03.every((r) =>
      r.reconcileIssues?.some((i) => i.code === "requires_manual_input"),
    ),
    "may1 SHIGA_03 reconcileIssues",
  );

  assert(result.totals.employeeProfitTotal > 0, "employee profit > 0");

  console.log("OK both", {
    rows: result.rows.length,
    matched: result.totals.matchedCount,
    fmShortage: result.totals.fmShortageCount,
    unregistered: result.totals.unregisteredCount,
    diagnostics: result.diagnostics,
    shigaOnly: result.totals.shigaOnlyCount,
    fmOnly: result.totals.fmOnlyCount,
    mismatch: result.totals.amountMismatchCount,
    employeeProfit: result.totals.employeeProfitTotal,
    partnerProfit: result.totals.partnerProfitTotal,
    grossProfit: result.totals.totalGrossProfit,
    rate: result.totals.grossProfitRate,
  });
}

async function testAprilDiagnostics() {
  const BASE =
    "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理";
  const FM = path.join(
    BASE,
    "ファイルメーカー日時売上",
    "20260401-20260430.xlsx",
  );
  const SHIGA =
    "C:/Users/大西本社/カンロジ Dropbox/カンロジ チーム フォルダ/3.飼鳥BOX/ｼﾞｮｰｼﾝ/滋賀店配データ入力sheet/2026年/滋賀店配データー入力sheet【2026年04月度】.xlsx";
  if (!fs.existsSync(FM) || !fs.existsSync(SHIGA)) {
    console.log("SKIP april diagnostics: fixture files not found");
    return;
  }

  const employees = parseEmployeeMasterSheet(
    loadXlsxRows(path.join(BASE, "社員マスタ.xlsx")),
  ).employees;
  const vehicles = parseVehicleMasterSheet(
    loadXlsxRows(path.join(BASE, "車両マスタ.xlsx")),
  ).vehicles;
  const jobs = parseJobMasterSheet(
    loadXlsxRows(path.join(BASE, "業務マスタ.xlsx")),
  ).jobs;
  const masters = {
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
  };
  const ledger = { employees, vehicles, jobs };
  const employeeNames = employees
    .filter((e) => e.activeFlag === 1)
    .map((e) => e.name);
  const paymentContracts = buildTestPaymentContracts();
  const billingContracts = buildTestBillingContracts();

  const fmBuf = fs.readFileSync(FM);
  const fmSheets = await allSheetMatricesFromArrayBuffer(
    fmBuf.buffer.slice(fmBuf.byteOffset, fmBuf.byteOffset + fmBuf.byteLength),
    path.basename(FM),
  );
  const fmProcessed = buildFmEmployeeSchedulePreprocessResult({
    fileName: path.basename(FM),
    ...processFmEmployeeScheduleSheets(
      fmSheets,
      path.basename(FM),
      masters,
      ledger,
    ),
    createdAt: new Date().toISOString(),
  });

  const shigaWb = XLSX.readFile(SHIGA, { cellDates: false });
  const shigaRows = XLSX.utils.sheet_to_json(
    shigaWb.Sheets["滋賀_"]!,
    { header: 1, defval: "", raw: true },
  ) as unknown[][];
  const shigaProcessed = buildShigaDeliveryPreprocessResult({
    fileName: path.basename(SHIGA),
    ...processShigaDeliverySheets(
      [{ sheetName: "滋賀_", rows: shigaRows }],
      path.basename(SHIGA),
    ),
    createdAt: new Date().toISOString(),
  });

  assert(
    !shigaProcessed.shigaDeliveryRecords?.some((r) => r.businessDate === "合計"),
    "april: no 合計 businessDate",
  );
  assert(
    (shigaProcessed.shigaDeliveryTotals?.excludedNonIsoDateRowCount ?? 0) >= 4,
    "april: excluded total row courses",
  );

  const result = buildShigaFmReconciliationResult({
    shigaResult: shigaProcessed,
    fmResult: fmProcessed,
    paymentContracts,
    billingContracts,
    billingShipperId: TEST_BILLING_SHIPPER_ID,
    employeeNames,
  });
  const d = result.diagnostics!;
  assert(d.excludedTotalRowCount >= 4, "april excludedTotalRowCount");
  assert(d.employeeCount >= 70, `april employee ${d.employeeCount}`);
  assert(
    result.rows.every((r) => r.businessDate !== "合計"),
    "april: no 合計 in reconcile rows",
  );
  assert(
    result.totals.unregisteredCount === 0,
    `april unregistered should be 0, got ${result.totals.unregisteredCount}`,
  );
  assert(
    result.totals.fmShortageCount < 140,
    `april fm_shortage reduced from 140 to ${result.totals.fmShortageCount}`,
  );

  const targets = ["古屋", "松本", "藤好", "新久保"];
  for (const t of targets) {
    const matched = result.rows.filter(
      (r) =>
        r.costCategory === "employee" &&
        r.fmRecords.some((f) => f.employeeNameOriginal.includes(t)),
    );
    assert(matched.length > 0, `april employee match for ${t}`);
  }

  console.log("OK april diagnostics", d, {
    fmShortage: result.totals.fmShortageCount,
    matched: result.totals.matchedCount,
  });
}

function testEmployeeNameNormalization() {
  const set = buildEmployeeNameSet(["古屋雅仁", "松本裕樹", "新久保　拓海"]);
  assert(set.has("古屋雅仁"), "furuya normalized");
  assert(set.has("松本裕樹"), "matsumoto normalized");
  assert(set.has("新久保拓海"), "shinkubo normalized");

  const fmRow = {
    isPartnerLikeRow: false,
    isRevenueRow: true,
    isAttendanceOnlyRow: false,
    employeeCanonicalId: null,
    aliasStatus: { employee: "unresolved" as const },
    employeeNameOriginal: "古屋 雅仁",
    employeeNameCanonical: null,
  };
  assert(isOwnEmployeeRow(fmRow as never, set), "space variant matches");
  console.log("OK employee name normalization");
}

async function testShigaOnly() {
  const { shigaProcessed } = await loadFixtures();

  const result = buildShigaFmReconciliationResult({
    shigaResult: shigaProcessed,
  });

  assert(result.inputMode === "shiga_only", `inputMode ${result.inputMode}`);
  assert(result.rows.length > 0, "rows > 0");
  assert(
    result.rows.every((r) => r.status === "shiga_only"),
    "all shiga_only",
  );
  assert(!result.totals.grossProfitAvailable, "no gross profit");
  assert(result.totals.totalPayment > 0, "payment total > 0");
  assert(result.totals.totalSales === 0, "sales total 0");
  assert(result.totals.totalGrossProfit === 0, "gross profit 0");
  assert(result.totals.grossProfitRate === null, "rate null");
  assert(
    result.notices.some((n) => n.includes("FMスケジュール未取込")),
    "fm notice",
  );
  assert(result.shigaPreview != null, "shiga preview");
  assert(result.shigaPreview!.payTotal > 0, "preview pay total");

  console.log("OK shiga_only", {
    rows: result.rows.length,
    payTotal: result.totals.totalPayment,
    previewPay: result.shigaPreview?.payTotal,
  });
}

async function testFmOnly() {
  const { fmProcessed, employeeNames, paymentContracts, billingContracts } =
    await loadFixtures();

  const result = buildShigaFmReconciliationResult({
    fmResult: fmProcessed,
    paymentContracts,
    billingContracts,
    billingShipperId: TEST_BILLING_SHIPPER_ID,
    employeeNames,
  });

  assert(result.inputMode === "fm_only", `inputMode ${result.inputMode}`);
  assert(result.rows.length > 0, "rows > 0");
  assert(
    result.rows.every(
      (r) => r.status === "fm_only" || r.status === "mapping_failed",
    ),
    "all fm_only or mapping_failed",
  );
  assert(!result.totals.grossProfitAvailable, "no gross profit");
  assert(result.totals.totalSales > 0, "sales total > 0");
  assert(result.totals.totalPayment === 0, "payment total 0");
  assert(result.totals.totalGrossProfit === 0, "gross profit 0");
  assert(result.totals.grossProfitRate === null, "rate null");
  assert(
    result.notices.some((n) => n.includes("滋賀店配未取込")),
    "shiga notice",
  );
  assert(result.fmPreview != null, "fm preview");
  assert(result.fmPreview!.salesTotal > 0, "preview sales total");

  console.log("OK fm_only", {
    rows: result.rows.length,
    salesTotal: result.totals.totalSales,
    previewSales: result.fmPreview?.salesTotal,
    employees: result.fmPreview?.employeeCount,
  });
}

async function testNeither() {
  let threw = false;
  try {
    buildShigaFmReconciliationResult({});
  } catch {
    threw = true;
  }
  assert(threw, "should throw when neither file");
  console.log("OK neither throws");
}

async function main() {
  testEmployeeNameNormalization();
  await testBoth();
  await testAprilDiagnostics();
  await testShigaOnly();
  await testFmOnly();
  await testNeither();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
