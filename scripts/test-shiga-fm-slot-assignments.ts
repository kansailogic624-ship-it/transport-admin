/**
 * 未登録スロット手入力・再計算テスト
 * npx tsx scripts/test-shiga-fm-slot-assignments.ts
 */
import { applyAssignmentToRow } from "../src/lib/import-preprocessor/shiga-fm-reconciliation/apply-assignments";
import type { ShigaFmReconciliationRow } from "../src/lib/import-preprocessor/shiga-fm-reconciliation/types";
import type { ShigaFmSlotAssignment } from "../src/lib/import-preprocessor/shiga-fm-reconciliation/slot-assignment-types";
import { SHIGA_FM_EMPLOYEE_PAYMENT_NOTE } from "../src/lib/import-preprocessor/shiga-fm-reconciliation/cost-classifier";
import {
  TEST_BILLING_SHIPPER_ID,
  buildTestBillingContracts,
  buildTestPaymentContracts,
} from "./test-fixtures/shiga-fm-contract-fixtures";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function baseUnregisteredRow(): ShigaFmReconciliationRow {
  return {
    id: "row-1",
    matchKey: "test",
    businessDate: "2026-05-01",
    courseId: "SHIGA_02",
    courseName: "滋賀地区②",
    vendorCode: "411089",
    vendorName: "エフエートラック",
    slotKey: "2026-05-01|SHIGA_02|1",
    assignmentId: null,
    slotIndex: 1,
    unitCount: 1,
    jobName: "Joshin②",
    status: "unregistered",
    costCategory: "unregistered",
    billingParty: "エフエートラック",
    paymentParty: "—",
    contractTypeLabel: "未登録",
    contractId: null,
    salesAmount: 0,
    paymentAmount: 0,
    grossProfitAmount: 0,
    grossProfitRate: null,
    notes: [],
    shigaRecord: {
      id: "shiga-1",
      sourceFileName: "test.xlsx",
      sourceRowNumber: 7,
      sheetName: "滋賀_",
      year: 2026,
      month: 5,
      monthPeriod: "2026-05",
      closingMonth: "2026-05",
      vendorCode: "411089",
      vendorName: "エフエートラック",
      vehicleType: "4トン",
      businessDate: "2026-05-01",
      weekday: "金",
      courseId: "SHIGA_02",
      courseName: "滋賀地区②",
      routeName: "test",
      joinKey: "test",
      joinKeyParts: {
        vendorCode: "411089",
        vendorName: "エフエートラック",
        courseId: "SHIGA_02",
        businessDate: "2026-05-01",
      },
      unitCount: 1,
      freightAmount: 27500,
      overtimeHours: 0,
      overtimePayAmount: 0,
      freightPlusOvertimeAmount: 27500,
      tollAmount: 0,
      coursePayTotal: 27500,
      dailyVehicleAmountTotal: null,
      dailyTollTotal: null,
      dailyUnitCountTotal: null,
      dailyPayTotal: null,
      raw: {},
    },
    fmRecords: [],
    fmJobNames: ["Joshin②"],
    mismatchReasons: [],
    matchNotes: [],
  };
}

function assignmentBase(
  type: ShigaFmSlotAssignment["assignmentType"],
): ShigaFmSlotAssignment {
  const now = new Date().toISOString();
  return {
    id: "2026-05-01|SHIGA_02|1",
    slotKey: "2026-05-01|SHIGA_02|1",
    monthPeriod: "2026-05",
    businessDate: "2026-05-01",
    courseId: "SHIGA_02",
    courseName: "滋賀地区②",
    slotIndex: 1,
    unitCount: 1,
    jobName: "Joshin②",
    assignmentType: type,
    createdAt: now,
    updatedAt: now,
  };
}

function main() {
  const paymentContracts = buildTestPaymentContracts();
  const billingContracts = buildTestBillingContracts();
  const row = baseUnregisteredRow();

  const partner = applyAssignmentToRow(
    row,
    {
      ...assignmentBase("partner"),
      partnerName: "潤生輸送",
    },
    paymentContracts,
    billingContracts,
    TEST_BILLING_SHIPPER_ID,
  );
  assert(partner.status === "matched", "partner matched");
  assert(partner.costCategory === "partner", "partner category");
  assert(partner.salesAmount === 26_950, `partner sales ${partner.salesAmount}`);
  assert(partner.paymentAmount === 27_500, `partner pay ${partner.paymentAmount}`);
  assert(partner.grossProfitAmount === -550, "partner profit");
  assert(partner.paymentParty === "潤生輸送", "partner payment party");

  const partTime = applyAssignmentToRow(
    row,
    {
      ...assignmentBase("part_time"),
      salesAmount: 30_000,
      partTimePaymentAmount: 25_000,
      workerName: "田中",
    },
    paymentContracts,
    billingContracts,
    TEST_BILLING_SHIPPER_ID,
  );
  assert(partTime.costCategory === "part_time", "part_time category");
  assert(partTime.paymentAmount === 25_000, "part_time payment");
  assert(partTime.grossProfitAmount === 5_000, "part_time profit");

  const employee = applyAssignmentToRow(
    row,
    {
      ...assignmentBase("employee"),
      salesAmount: 37_450,
      workerName: "山田",
    },
    paymentContracts,
    billingContracts,
    TEST_BILLING_SHIPPER_ID,
  );
  assert(employee.costCategory === "employee", "employee category");
  assert(employee.paymentAmount === 0, "employee payment 0");
  assert(employee.grossProfitAmount === 37_450, "employee profit = sales");
  assert(
    employee.notes.includes(SHIGA_FM_EMPLOYEE_PAYMENT_NOTE),
    "employee note",
  );

  console.log("OK slot assignments", {
    partner: partner.grossProfitAmount,
    partTime: partTime.grossProfitAmount,
    employee: employee.grossProfitAmount,
  });
}

main();
