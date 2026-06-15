import type { PartnerPaymentContract } from "@/lib/shiga-fm/partner-payment-types";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import { allocatePerUnitAmounts } from "@/lib/shiga-fm/contract-calc-allocate";
import {
  businessMonthFromDate,
  calcSlotAmounts,
  formatBillingContractLabel,
  formatPaymentContractLabel,
} from "@/lib/shiga-fm/slot-amount-calc";
import {
  resolvePartnerPaymentContract,
  resolveShipperBillingContract,
} from "@/lib/shiga-fm/contract-resolve";
import type { FmEmployeeScheduleStagingRecord } from "../fm-employee-schedule/types";
import type { ShigaDeliveryStagingRecord } from "../shiga-delivery/types";
import {
  SHIGA_FM_BILLING_PARTY,
  SHIGA_FM_EMPLOYEE_PAYMENT_NOTE,
  classifyFmRow,
  classifySlotRow,
  getSlotJobName,
  type ShigaFmCostCategory,
} from "./cost-classifier";
import { SHIGA_FM_COURSE_MAPPING } from "./course-mapping";
import { filterFmRowsForReconciliation } from "./fm-row-filter";
import { calcGrossProfitRate } from "./profit-calc";
import type {
  ShigaFmMatchedFmRow,
  ShigaFmMatchStatus,
  ShigaFmReconciliationRow,
} from "./types";
import { buildSlotAssignmentKey } from "./slot-assignment-types";
import {
  buildReconciliationMatchKey,
  normalizeFmShipperToVendor,
} from "./vendor-mapping";

export type SlotMatchContext = {
  shigaRecords: ShigaDeliveryStagingRecord[];
  fmRecords: FmEmployeeScheduleStagingRecord[];
  paymentContracts: PartnerPaymentContract[];
  billingContracts: ShipperBillingContract[];
  billingShipperId: string | null;
  employeeNames: Set<string>;
  inputMode: "both" | "shiga_only" | "fm_only";
};

function toFmMatchedRow(r: FmEmployeeScheduleStagingRecord): ShigaFmMatchedFmRow {
  return {
    recordId: r.id,
    sourceRowNumber: r.sourceRowNumber,
    jobNameOriginal: r.jobNameOriginal,
    shipperNameOriginal: r.shipperNameOriginal,
    employeeNameOriginal: r.employeeNameOriginal,
    vehicleNumber:
      r.vehicleNumberOriginal.trim() ||
      r.vehicleNumberFilled?.trim() ||
      "—",
    revenueAmount: r.revenueAmount ?? 0,
  };
}

function courseName(courseId: string): string | null {
  return (
    SHIGA_FM_COURSE_MAPPING.find((c) => c.courseId === courseId)?.courseName ??
    null
  );
}

function emptyContractFields(): {
  contractId: string | null;
  paymentContractId: string | null;
  billingContractId: string | null;
  paymentContractLabel: string | null;
  billingContractLabel: string | null;
  billingPartyId: string | null;
  paymentPartyId: string | null;
} {
  return {
    contractId: null,
    paymentContractId: null,
    billingContractId: null,
    paymentContractLabel: null,
    billingContractLabel: null,
    billingPartyId: null,
    paymentPartyId: null,
  };
}

function buildSlotRow(input: {
  shiga: ShigaDeliveryStagingRecord | null;
  fm: FmEmployeeScheduleStagingRecord | null;
  slotIndex: number;
  unitCount: number;
  jobName: string;
  status: ShigaFmMatchStatus;
  costCategory: ShigaFmCostCategory;
  billingParty: string;
  paymentParty: string;
  contractTypeLabel: string | null;
  contractId: string | null;
  paymentContractId: string | null;
  billingContractId: string | null;
  paymentContractLabel: string | null;
  billingContractLabel: string | null;
  billingPartyId: string | null;
  paymentPartyId: string | null;
  invoiceAmount: number;
  paymentAmount: number;
  notes: string[];
  mismatchReasons: string[];
  matchNotes: string[];
}): ShigaFmReconciliationRow {
  const grossProfitAmount = input.invoiceAmount - input.paymentAmount;
  const vendor = input.shiga
    ? {
        vendorCode: input.shiga.vendorCode,
        vendorName: input.shiga.vendorName,
      }
    : input.fm
      ? normalizeFmShipperToVendor(input.fm.shipperNameOriginal)
      : null;

  const courseId = input.shiga?.courseId ?? null;
  const businessDate =
    input.shiga?.businessDate ?? input.fm?.businessDate ?? "";
  const matchKey =
    input.shiga?.joinKey ??
    (vendor && courseId
      ? buildReconciliationMatchKey({
          vendorCode: vendor.vendorCode,
          vendorName: vendor.vendorName,
          courseId,
          businessDate,
        })
      : "");

  return {
    id: crypto.randomUUID(),
    matchKey,
    businessDate,
    courseId,
    courseName:
      input.shiga?.courseName ?? courseName(courseId ?? "") ?? null,
    vendorCode: vendor?.vendorCode ?? "",
    vendorName: vendor?.vendorName ?? "",
    slotKey: buildSlotAssignmentKey({
      businessDate,
      courseId: courseId ?? "",
      slotIndex: input.slotIndex,
    }),
    assignmentId: null,
    slotIndex: input.slotIndex,
    unitCount: input.unitCount,
    jobName: input.jobName,
    status: input.status,
    costCategory: input.costCategory,
    billingParty: input.billingParty,
    paymentParty: input.paymentParty,
    contractTypeLabel: input.contractTypeLabel,
    contractId: input.contractId,
    paymentContractId: input.paymentContractId,
    billingContractId: input.billingContractId,
    paymentContractLabel: input.paymentContractLabel,
    billingContractLabel: input.billingContractLabel,
    billingPartyId: input.billingPartyId,
    paymentPartyId: input.paymentPartyId,
    businessMonth: businessMonthFromDate(businessDate),
    salesAmount: input.invoiceAmount,
    paymentAmount: input.paymentAmount,
    grossProfitAmount,
    grossProfitRate: calcGrossProfitRate(
      input.invoiceAmount,
      grossProfitAmount,
    ),
    notes: input.notes,
    shigaRecord: input.shiga,
    fmRecords: input.fm ? [toFmMatchedRow(input.fm)] : [],
    fmJobNames: input.fm ? [input.fm.jobNameOriginal] : [input.jobName],
    mismatchReasons: input.mismatchReasons,
    matchNotes: input.matchNotes,
  };
}

function computeEmployeeSlot(
  fm: FmEmployeeScheduleStagingRecord,
  shiga: ShigaDeliveryStagingRecord | null,
  slotIndex: number,
  unitCount: number,
  jobName: string,
  employeeNames: Set<string>,
): ShigaFmReconciliationRow {
  const classification = classifySlotRow(fm, shiga, employeeNames);
  const invoiceAmount = fm.revenueAmount ?? 0;
  return buildSlotRow({
    shiga,
    fm,
    slotIndex,
    unitCount,
    jobName,
    status: "matched",
    costCategory: "employee",
    billingParty: SHIGA_FM_BILLING_PARTY,
    paymentParty: classification.paymentParty,
    contractTypeLabel: "自社社員",
    ...emptyContractFields(),
    billingPartyId: null,
    paymentPartyId: null,
    invoiceAmount,
    paymentAmount: 0,
    notes: [SHIGA_FM_EMPLOYEE_PAYMENT_NOTE],
    mismatchReasons: [],
    matchNotes: [],
  });
}

function computePartnerSlot(
  fm: FmEmployeeScheduleStagingRecord,
  shiga: ShigaDeliveryStagingRecord | null,
  slotIndex: number,
  unitCount: number,
  jobName: string,
  ctx: SlotMatchContext,
): ShigaFmReconciliationRow {
  const classification = classifySlotRow(fm, shiga, ctx.employeeNames);
  const paymentParty = classification.paymentParty;
  const courseId = shiga?.courseId ?? "SHIGA_02";
  const businessDate = fm.businessDate;

  let paymentContract =
    resolvePartnerPaymentContract(ctx.paymentContracts, {
      partnerName: paymentParty,
      courseId,
      jobName,
      businessDate,
    }) ?? null;

  const usingCourseDefault = !paymentContract && courseId === "SHIGA_04";
  if (usingCourseDefault) {
    paymentContract = resolvePartnerPaymentContract(ctx.paymentContracts, {
      courseId: "SHIGA_04",
      businessDate,
    });
  }

  if (!paymentContract) {
    const invoiceAmount = fm.revenueAmount ?? 0;
    return buildSlotRow({
      shiga,
      fm,
      slotIndex,
      unitCount,
      jobName,
      status: "mapping_failed",
      costCategory: "partner",
      billingParty: SHIGA_FM_BILLING_PARTY,
      paymentParty,
      contractTypeLabel: "支払契約未登録",
      ...emptyContractFields(),
      invoiceAmount,
      paymentAmount: 0,
      notes: [],
      mismatchReasons: [`${paymentParty} の支払契約が未登録です`],
      matchNotes: [],
    });
  }

  const billingContract = ctx.billingShipperId
    ? resolveShipperBillingContract(ctx.billingContracts, {
        shipperId: ctx.billingShipperId,
        courseId,
        jobName,
        businessDate,
      })
    : null;

  if (!billingContract) {
    const invoiceAmount = fm.revenueAmount ?? 0;
    return buildSlotRow({
      shiga,
      fm,
      slotIndex,
      unitCount,
      jobName,
      status: "mapping_failed",
      costCategory: "partner",
      billingParty: SHIGA_FM_BILLING_PARTY,
      paymentParty,
      contractTypeLabel: "請求契約未登録",
      contractId: paymentContract.id,
      paymentContractId: paymentContract.id,
      billingContractId: null,
      paymentContractLabel: formatPaymentContractLabel(paymentContract),
      billingContractLabel: null,
      billingPartyId: ctx.billingShipperId,
      paymentPartyId: paymentContract.partnerId,
      invoiceAmount,
      paymentAmount: 0,
      notes: [],
      mismatchReasons: [
        `${SHIGA_FM_BILLING_PARTY} の請求契約が未登録です`,
      ],
      matchNotes: [],
    });
  }

  const alloc = shiga
    ? allocatePerUnitAmounts(
        shiga.overtimeHours,
        shiga.tollAmount,
        unitCount,
        slotIndex,
      )
    : { overtimeHours: 0, tollAmount: 0 };

  const calc = calcSlotAmounts(paymentContract, billingContract, alloc);
  const fmRevenue = fm.revenueAmount ?? 0;
  const mismatch =
    Math.abs(calc.invoiceAmount - fmRevenue) > 1
      ? [`FM売上 ${fmRevenue.toLocaleString()}円 ≠ 契約請求 ${calc.invoiceAmount.toLocaleString()}円`]
      : [];

  return buildSlotRow({
    shiga,
    fm,
    slotIndex,
    unitCount,
    jobName,
    status: mismatch.length > 0 ? "amount_mismatch" : "matched",
    costCategory: "partner",
    billingParty: SHIGA_FM_BILLING_PARTY,
    paymentParty,
    contractTypeLabel: usingCourseDefault
      ? "傭車（コース別デフォルト単価で計算）"
      : paymentParty,
    contractId: paymentContract.id,
    paymentContractId: paymentContract.id,
    billingContractId: billingContract.id,
    paymentContractLabel: formatPaymentContractLabel(paymentContract),
    billingContractLabel: formatBillingContractLabel(billingContract),
    billingPartyId: billingContract.shipperId,
    paymentPartyId: paymentContract.partnerId,
    invoiceAmount: calc.invoiceAmount,
    paymentAmount: calc.paymentAmount,
    notes: [
      `支払契約: ${formatPaymentContractLabel(paymentContract)}`,
      `請求契約: ${formatBillingContractLabel(billingContract)}`,
      `残業 ${alloc.overtimeHours}h / 高速 ${alloc.tollAmount.toLocaleString()}円`,
    ],
    mismatchReasons: mismatch,
    matchNotes: [],
  });
}

function computeFmSlot(
  fm: FmEmployeeScheduleStagingRecord,
  shiga: ShigaDeliveryStagingRecord | null,
  slotIndex: number,
  unitCount: number,
  jobName: string,
  ctx: SlotMatchContext,
): ShigaFmReconciliationRow {
  const classification = classifySlotRow(fm, shiga, ctx.employeeNames);
  if (classification.costCategory === "employee") {
    return computeEmployeeSlot(
      fm,
      shiga,
      slotIndex,
      unitCount,
      jobName,
      ctx.employeeNames,
    );
  }
  if (classification.costCategory === "partner") {
    return computePartnerSlot(
      fm,
      shiga,
      slotIndex,
      unitCount,
      jobName,
      ctx,
    );
  }

  const invoiceAmount = fm.revenueAmount ?? 0;
  return buildSlotRow({
    shiga,
    fm,
    slotIndex,
    unitCount,
    jobName,
    status: "mapping_failed",
    costCategory: "unknown",
    billingParty: SHIGA_FM_BILLING_PARTY,
    paymentParty: classification.paymentParty,
    contractTypeLabel: null,
    ...emptyContractFields(),
    invoiceAmount,
    paymentAmount: 0,
    notes: [],
    mismatchReasons: ["社員・傭車の判定ができませんでした"],
    matchNotes: [],
  });
}

function buildFmShortageSlot(
  shiga: ShigaDeliveryStagingRecord,
  slotIndex: number,
  unitCount: number,
  jobName: string,
): ShigaFmReconciliationRow {
  return buildSlotRow({
    shiga,
    fm: null,
    slotIndex,
    unitCount,
    jobName,
    status: "fm_shortage",
    costCategory: "fm_shortage",
    billingParty: SHIGA_FM_BILLING_PARTY,
    paymentParty: "—",
    contractTypeLabel: "FM不足",
    ...emptyContractFields(),
    invoiceAmount: 0,
    paymentAmount: 0,
    notes: [
      `FMスケジュールに該当業務（${jobName}）の行がありません`,
    ],
    mismatchReasons: [
      `業務名 ${jobName} のFM行が不足しています（スロット ${slotIndex}/${unitCount}）`,
    ],
    matchNotes: [`推定業務: ${jobName}`],
  });
}

function bucketFmByDateCourse(
  fmRecords: FmEmployeeScheduleStagingRecord[],
): Map<string, FmEmployeeScheduleStagingRecord[]> {
  const map = new Map<string, FmEmployeeScheduleStagingRecord[]>();
  for (const record of filterFmRowsForReconciliation(fmRecords)) {
    const mapping = SHIGA_FM_COURSE_MAPPING.find((m) =>
      [...m.fmJobNames, ...(m.aggregateFmJobNames ?? [])].includes(
        record.jobNameOriginal.trim(),
      ),
    );
    if (!mapping) continue;
    const key = `${record.businessDate}|${mapping.courseId}`;
    const list = map.get(key) ?? [];
    list.push(record);
    map.set(key, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => {
      const courseId = SHIGA_FM_COURSE_MAPPING.find((m) =>
        [...m.fmJobNames, ...(m.aggregateFmJobNames ?? [])].includes(
          a.jobNameOriginal.trim(),
        ),
      )?.courseId;
      if (!courseId) return 0;
      return (
        fmJobSortRankLocal(courseId, a.jobNameOriginal) -
        fmJobSortRankLocal(courseId, b.jobNameOriginal)
      );
    });
  }
  return map;
}

function fmJobSortRankLocal(courseId: string, jobName: string): number {
  if (courseId === "SHIGA_04") {
    if (jobName === "Joshin④") return 0;
    if (jobName === "Joshin⑤") return 1;
    if (jobName === "Joshin⑥") return 2;
  }
  return 0;
}

function matchShigaCourseDay(
  shiga: ShigaDeliveryStagingRecord,
  fmPool: FmEmployeeScheduleStagingRecord[],
  ctx: SlotMatchContext,
): ShigaFmReconciliationRow[] {
  const unitCount = Math.max(1, shiga.unitCount);
  const consumed = new Set<string>();
  const rows: ShigaFmReconciliationRow[] = [];

  const fmByJob = new Map<string, FmEmployeeScheduleStagingRecord[]>();
  for (const fm of fmPool) {
    const job = fm.jobNameOriginal.trim();
    const list = fmByJob.get(job) ?? [];
    list.push(fm);
    fmByJob.set(job, list);
  }

  for (let slotIndex = 1; slotIndex <= unitCount; slotIndex++) {
    const jobName = getSlotJobName(shiga.courseId, slotIndex);
    const preferred = fmByJob.get(jobName)?.find((r) => !consumed.has(r.id));

    if (preferred) {
      consumed.add(preferred.id);
      rows.push(
        computeFmSlot(preferred, shiga, slotIndex, unitCount, jobName, ctx),
      );
    } else {
      rows.push(buildFmShortageSlot(shiga, slotIndex, unitCount, jobName));
    }
  }

  return rows;
}

function buildShigaOnlyRows(
  shigaRecords: ShigaDeliveryStagingRecord[],
): ShigaFmReconciliationRow[] {
  const rows: ShigaFmReconciliationRow[] = [];
  for (const shiga of shigaRecords) {
    const unitCount = Math.max(1, shiga.unitCount);
    for (let slotIndex = 1; slotIndex <= unitCount; slotIndex++) {
      const jobName = getSlotJobName(shiga.courseId, slotIndex);
      const alloc = allocatePerUnitAmounts(
        shiga.overtimeHours,
        shiga.tollAmount,
        unitCount,
        slotIndex,
      );
      const paymentShare =
        unitCount === 1
          ? shiga.coursePayTotal
          : Math.floor(shiga.coursePayTotal / unitCount) +
            (slotIndex === unitCount
              ? shiga.coursePayTotal -
                Math.floor(shiga.coursePayTotal / unitCount) * (unitCount - 1)
              : 0);

      rows.push(
        buildSlotRow({
          shiga,
          fm: null,
          slotIndex,
          unitCount,
          jobName,
          status: "shiga_only",
          costCategory: "unknown",
          billingParty: SHIGA_FM_BILLING_PARTY,
          paymentParty: "—",
          contractTypeLabel: null,
          ...emptyContractFields(),
          invoiceAmount: 0,
          paymentAmount: paymentShare,
          notes: ["FM未取込 — 支払データのみ"],
          mismatchReasons: ["FM側に該当行がありません"],
          matchNotes: [
            `按分: 残業${alloc.overtimeHours}h / 高速${alloc.tollAmount}円`,
          ],
        }),
      );
    }
  }
  return rows;
}

function buildFmOnlyRows(ctx: SlotMatchContext): ShigaFmReconciliationRow[] {
  const rows: ShigaFmReconciliationRow[] = [];
  for (const fm of filterFmRowsForReconciliation(ctx.fmRecords)) {
    const mapping = SHIGA_FM_COURSE_MAPPING.find((m) =>
      [...m.fmJobNames, ...(m.aggregateFmJobNames ?? [])].includes(
        fm.jobNameOriginal.trim(),
      ),
    );
    if (!mapping) continue;

    const vendor = normalizeFmShipperToVendor(fm.shipperNameOriginal);
    if (!vendor) {
      rows.push(
        buildSlotRow({
          shiga: null,
          fm,
          slotIndex: 1,
          unitCount: 1,
          jobName: fm.jobNameOriginal,
          status: "mapping_failed",
          costCategory: "unknown",
          billingParty: SHIGA_FM_BILLING_PARTY,
          paymentParty: fm.shipperNameOriginal,
          contractTypeLabel: null,
          ...emptyContractFields(),
          invoiceAmount: fm.revenueAmount ?? 0,
          paymentAmount: 0,
          notes: [],
          mismatchReasons: ["業者名の正規化に失敗しました"],
          matchNotes: [],
        }),
      );
      continue;
    }

    const computed = computeFmSlot(fm, null, 1, 1, fm.jobNameOriginal, ctx);
    rows.push({
      ...computed,
      status: "fm_only",
      paymentAmount: 0,
      grossProfitAmount: 0,
      grossProfitRate: null,
      mismatchReasons: ["滋賀店配側に該当支払がありません"],
    });
  }
  return rows;
}

function collectUnconsumedFm(
  ctx: SlotMatchContext,
  consumedIds: Set<string>,
): ShigaFmReconciliationRow[] {
  const rows: ShigaFmReconciliationRow[] = [];
  for (const fm of filterFmRowsForReconciliation(ctx.fmRecords)) {
    if (consumedIds.has(fm.id)) continue;
    const mapping = SHIGA_FM_COURSE_MAPPING.find((m) =>
      [...m.fmJobNames, ...(m.aggregateFmJobNames ?? [])].includes(
        fm.jobNameOriginal.trim(),
      ),
    );
    if (!mapping) continue;

    rows.push(
      buildSlotRow({
        shiga: null,
        fm,
        slotIndex: 1,
        unitCount: 1,
        jobName: fm.jobNameOriginal,
        status: "fm_only",
        costCategory: classifySlotRow(fm, null, ctx.employeeNames).costCategory,
        billingParty: SHIGA_FM_BILLING_PARTY,
        paymentParty: classifySlotRow(fm, null, ctx.employeeNames).paymentParty,
        contractTypeLabel: null,
        ...emptyContractFields(),
        invoiceAmount: fm.revenueAmount ?? 0,
        paymentAmount: 0,
        notes: [],
        mismatchReasons: ["滋賀店配側に該当支払がありません"],
        matchNotes: [],
      }),
    );
  }
  return rows;
}

export function matchShigaFmSlots(ctx: SlotMatchContext): ShigaFmReconciliationRow[] {
  if (ctx.inputMode === "shiga_only") {
    return buildShigaOnlyRows(ctx.shigaRecords).sort(sortRows);
  }

  if (ctx.inputMode === "fm_only") {
    return buildFmOnlyRows(ctx).sort(sortRows);
  }

  const fmBuckets = bucketFmByDateCourse(ctx.fmRecords);
  const consumedFmIds = new Set<string>();
  const rows: ShigaFmReconciliationRow[] = [];

  const sortedShiga = [...ctx.shigaRecords].sort((a, b) => {
    const d = a.businessDate.localeCompare(b.businessDate);
    if (d !== 0) return d;
    return a.courseId.localeCompare(b.courseId);
  });

  for (const shiga of sortedShiga) {
    const key = `${shiga.businessDate}|${shiga.courseId}`;
    const fmPool = fmBuckets.get(key) ?? [];
    const slotRows = matchShigaCourseDay(shiga, fmPool, ctx);
    for (const row of slotRows) {
      if (row.fmRecords[0]) {
        consumedFmIds.add(row.fmRecords[0].recordId);
      }
    }
    rows.push(...slotRows);
  }

  rows.push(...collectUnconsumedFm(ctx, consumedFmIds));

  return rows.sort(sortRows);
}

function sortRows(a: ShigaFmReconciliationRow, b: ShigaFmReconciliationRow): number {
  const d = a.businessDate.localeCompare(b.businessDate);
  if (d !== 0) return d;
  const c = (a.courseId ?? "").localeCompare(b.courseId ?? "");
  if (c !== 0) return c;
  return a.slotIndex - b.slotIndex;
}
