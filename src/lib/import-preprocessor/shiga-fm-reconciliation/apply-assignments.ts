import { allocatePerUnitAmounts } from "@/lib/shiga-fm/contract-calc-allocate";
import { calcSlotAmounts } from "@/lib/shiga-fm/slot-amount-calc";
import {
  formatBillingContractLabel,
  formatPaymentContractLabel,
} from "@/lib/shiga-fm/slot-amount-calc";
import {
  resolvePartnerPaymentContract,
  resolveShipperBillingContract,
} from "@/lib/shiga-fm/contract-resolve";
import type { PartnerPaymentContract } from "@/lib/shiga-fm/partner-payment-types";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import { SHIGA_FM_BILLING_PARTY, SHIGA_FM_EMPLOYEE_PAYMENT_NOTE } from "./cost-classifier";
import { calcGrossProfitRate } from "./profit-calc";
import type { ShigaFmSlotAssignment } from "./slot-assignment-types";
import type { ShigaFmReconciliationRow } from "./types";

function resolvePaymentContract(
  assignment: ShigaFmSlotAssignment,
  row: ShigaFmReconciliationRow,
  contracts: PartnerPaymentContract[],
): PartnerPaymentContract | null {
  const courseId = row.courseId ?? "SHIGA_02";
  if (assignment.partnerId) {
    const byId = resolvePartnerPaymentContract(contracts, {
      partnerId: assignment.partnerId,
      courseId,
      jobName: row.jobName,
      businessDate: row.businessDate,
    });
    if (byId) return byId;
  }
  const name = assignment.partnerName?.trim();
  if (name) {
    return resolvePartnerPaymentContract(contracts, {
      partnerName: name,
      courseId,
      jobName: row.jobName,
      businessDate: row.businessDate,
    });
  }
  if (courseId === "SHIGA_04") {
    return resolvePartnerPaymentContract(contracts, {
      courseId: "SHIGA_04",
      businessDate: row.businessDate,
    });
  }
  return null;
}

function applyPartnerAssignment(
  row: ShigaFmReconciliationRow,
  assignment: ShigaFmSlotAssignment,
  paymentContracts: PartnerPaymentContract[],
  billingContracts: ShipperBillingContract[],
  billingShipperId: string | null,
): ShigaFmReconciliationRow {
  const shiga = row.shigaRecord;
  const paymentParty =
    assignment.partnerName?.trim() || "協力会社（未指定）";

  if (!assignment.partnerId && !assignment.partnerName?.trim()) {
    return {
      ...row,
      assignmentId: assignment.id,
      mismatchReasons: ["協力会社が選択されていません"],
    };
  }

  const paymentContract = resolvePaymentContract(assignment, row, paymentContracts);

  if (!paymentContract || !shiga) {
    return {
      ...row,
      assignmentId: assignment.id,
      costCategory: "partner",
      paymentParty,
      status: "mapping_failed",
      mismatchReasons: [
        paymentContract
          ? "滋賀店配データがありません"
          : `${paymentParty} の支払契約が未登録です`,
      ],
    };
  }

  const billingContract = billingShipperId
    ? resolveShipperBillingContract(billingContracts, {
        shipperId: billingShipperId,
        courseId: row.courseId,
        jobName: row.jobName,
        businessDate: row.businessDate,
      })
    : null;

  if (!billingContract) {
    return {
      ...row,
      assignmentId: assignment.id,
      costCategory: "partner",
      paymentParty,
      status: "mapping_failed",
      paymentContractId: paymentContract.id,
      paymentContractLabel: formatPaymentContractLabel(paymentContract),
      mismatchReasons: [`${SHIGA_FM_BILLING_PARTY} の請求契約が未登録です`],
    };
  }

  const alloc = allocatePerUnitAmounts(
    shiga.overtimeHours,
    shiga.tollAmount,
    row.unitCount,
    row.slotIndex,
  );
  const calc = calcSlotAmounts(paymentContract, billingContract, alloc);
  const usingCourseDefault = paymentContract.isCourseDefault;

  return {
    ...row,
    status: "matched",
    costCategory: "partner",
    assignmentId: assignment.id,
    paymentParty,
    contractTypeLabel: usingCourseDefault
      ? "傭車（コース別デフォルト単価で計算）"
      : `${paymentParty}（手入力）`,
    contractId: paymentContract.id,
    paymentContractId: paymentContract.id,
    billingContractId: billingContract.id,
    paymentContractLabel: formatPaymentContractLabel(paymentContract),
    billingContractLabel: formatBillingContractLabel(billingContract),
    paymentPartyId: paymentContract.partnerId,
    billingPartyId: billingContract.shipperId,
    salesAmount: calc.invoiceAmount,
    paymentAmount: calc.paymentAmount,
    grossProfitAmount: calc.grossProfitAmount,
    grossProfitRate: calc.grossProfitRate,
    notes: [
      "傭車（手入力）",
      `支払契約: ${formatPaymentContractLabel(paymentContract)}`,
      `請求契約: ${formatBillingContractLabel(billingContract)}`,
      ...(usingCourseDefault
        ? ["コース別デフォルト単価を参照して計算"]
        : []),
      ...(assignment.note ? [assignment.note] : []),
    ],
    mismatchReasons: [],
    matchNotes: [`手入力適用: ${assignment.updatedAt}`],
  };
}

function applyPartTimeAssignment(
  row: ShigaFmReconciliationRow,
  assignment: ShigaFmSlotAssignment,
): ShigaFmReconciliationRow {
  const sales = Math.max(0, assignment.salesAmount ?? row.salesAmount);
  const payment = Math.max(0, assignment.partTimePaymentAmount ?? 0);
  const gross = sales - payment;

  return {
    ...row,
    status: "matched",
    costCategory: "part_time",
    assignmentId: assignment.id,
    paymentParty: assignment.workerName?.trim() || "アルバイト",
    contractTypeLabel: "アルバイト（手入力）",
    contractId: null,
    paymentContractId: null,
    billingContractId: null,
    salesAmount: sales,
    paymentAmount: payment,
    grossProfitAmount: gross,
    grossProfitRate: calcGrossProfitRate(sales, gross),
    notes: [
      "アルバイト（手入力）",
      ...(assignment.note ? [assignment.note] : []),
    ],
    mismatchReasons: [],
    matchNotes: [`手入力適用: ${assignment.updatedAt}`],
  };
}

function applyEmployeeAssignment(
  row: ShigaFmReconciliationRow,
  assignment: ShigaFmSlotAssignment,
): ShigaFmReconciliationRow {
  const sales = Math.max(0, assignment.salesAmount ?? row.salesAmount);
  return {
    ...row,
    status: "matched",
    costCategory: "employee",
    assignmentId: assignment.id,
    paymentParty: assignment.workerName?.trim() || "自社社員",
    contractTypeLabel: "自社社員（手入力）",
    contractId: null,
    paymentContractId: null,
    billingContractId: null,
    salesAmount: sales,
    paymentAmount: 0,
    grossProfitAmount: sales,
    grossProfitRate: calcGrossProfitRate(sales, sales),
    notes: [
      SHIGA_FM_EMPLOYEE_PAYMENT_NOTE,
      ...(assignment.note ? [assignment.note] : []),
    ],
    mismatchReasons: [],
    matchNotes: [`手入力適用: ${assignment.updatedAt}`],
  };
}

export function applyAssignmentToRow(
  row: ShigaFmReconciliationRow,
  assignment: ShigaFmSlotAssignment,
  paymentContracts: PartnerPaymentContract[],
  billingContracts: ShipperBillingContract[],
  billingShipperId: string | null,
): ShigaFmReconciliationRow {
  if (assignment.assignmentType === "employee") {
    return applyEmployeeAssignment(row, assignment);
  }
  if (assignment.assignmentType === "part_time") {
    return applyPartTimeAssignment(row, assignment);
  }
  return applyPartnerAssignment(
    row,
    assignment,
    paymentContracts,
    billingContracts,
    billingShipperId,
  );
}

export function applySlotAssignments(input: {
  rows: ShigaFmReconciliationRow[];
  assignments: ShigaFmSlotAssignment[];
  paymentContracts: PartnerPaymentContract[];
  billingContracts: ShipperBillingContract[];
  billingShipperId: string | null;
  /** @deprecated paymentContracts を使用 */
  contracts?: PartnerPaymentContract[];
}): ShigaFmReconciliationRow[] {
  const paymentContracts = input.paymentContracts ?? input.contracts ?? [];
  const map = new Map(input.assignments.map((a) => [a.slotKey, a]));
  return input.rows.map((row) => {
    const assignment = map.get(row.slotKey);
    if (!assignment) return row;
    return applyAssignmentToRow(
      row,
      assignment,
      paymentContracts,
      input.billingContracts,
      input.billingShipperId,
    );
  });
}

export function countPartnerPaymentContractGaps(
  rows: ShigaFmReconciliationRow[],
): number {
  return rows.filter(
    (r) =>
      r.costCategory === "partner" &&
      r.status === "mapping_failed" &&
      r.mismatchReasons.some((m) => m.includes("支払契約が未登録")),
  ).length;
}

export function countShipperBillingContractGaps(
  rows: ShigaFmReconciliationRow[],
): number {
  return rows.filter(
    (r) =>
      r.costCategory === "partner" &&
      r.status === "mapping_failed" &&
      r.mismatchReasons.some((m) => m.includes("請求契約が未登録")),
  ).length;
}

/** @deprecated countPartnerPaymentContractGaps を使用 */
export function countPartnerContractGaps(
  rows: ShigaFmReconciliationRow[],
): number {
  return countPartnerPaymentContractGaps(rows);
}
