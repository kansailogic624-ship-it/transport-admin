import type { PartnerPaymentContract } from "@/lib/shiga-fm/partner-payment-types";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import { enrichShigaFmRowsWithReconcileIssues } from "@/lib/reconcile-core";
import type { PreprocessResult } from "../types";
import { buildEmployeeNameSet } from "./cost-classifier";
import {
  buildSlotAssignmentKey,
  type ShigaFmSlotAssignment,
} from "./slot-assignment-types";
import { applySlotAssignments } from "./apply-assignments";
import { SHIGA_FM_COURSE_MAPPING } from "./course-mapping";
import { filterFmRowsForReconciliation } from "./fm-row-filter";
import { matchShigaFmRecordsLegacy } from "./matcher";
import { calcGrossProfitRate } from "./profit-calc";
import { matchShigaFmSlots } from "./slot-matcher";
import type {
  ShigaFmCourseProfitSummary,
  ShigaFmFmPreview,
  ShigaFmInputMode,
  ShigaFmReconcileDiagnostics,
  ShigaFmReconciliationResult,
  ShigaFmReconciliationRow,
  ShigaFmReconciliationTotals,
  ShigaFmShigaPreview,
} from "./types";

function isProfitRow(row: ShigaFmReconciliationRow): boolean {
  return (
    row.status === "matched" ||
    row.status === "matched_sum" ||
    row.status === "amount_mismatch" ||
    row.status === "fm_only"
  );
}

function buildSlotTotals(rows: ShigaFmReconciliationRow[]): ShigaFmReconciliationTotals {
  const profitRows = rows.filter(isProfitRow);

  const totalSales = profitRows.reduce((s, r) => s + r.salesAmount, 0);
  const totalPayment = profitRows.reduce((s, r) => s + r.paymentAmount, 0);
  const totalGrossProfit = profitRows.reduce(
    (s, r) => s + r.grossProfitAmount,
    0,
  );

  const employeeProfitTotal = rows
    .filter((r) => r.costCategory === "employee" && isProfitRow(r))
    .reduce((s, r) => s + r.grossProfitAmount, 0);
  const partnerProfitTotal = rows
    .filter((r) => r.costCategory === "partner" && isProfitRow(r))
    .reduce((s, r) => s + r.grossProfitAmount, 0);
  const partTimeProfitTotal = rows
    .filter((r) => r.costCategory === "part_time" && isProfitRow(r))
    .reduce((s, r) => s + r.grossProfitAmount, 0);

  const matchedCount = rows.filter((r) => r.status === "matched").length;
  const matchedSumCount = rows.filter((r) => r.status === "matched_sum").length;
  const shigaOnlyCount = rows.filter((r) => r.status === "shiga_only").length;
  const fmOnlyCount = rows.filter((r) => r.status === "fm_only").length;
  const amountMismatchCount = rows.filter(
    (r) => r.status === "amount_mismatch",
  ).length;
  const mappingFailedCount = rows.filter(
    (r) => r.status === "mapping_failed",
  ).length;
  const unregisteredCount = rows.filter(
    (r) => r.status === "unregistered",
  ).length;
  const fmShortageCount = rows.filter(
    (r) => r.status === "fm_shortage",
  ).length;

  const courseSummaries: ShigaFmCourseProfitSummary[] =
    SHIGA_FM_COURSE_MAPPING.map((course) => {
      const courseRows = profitRows.filter(
        (r) => r.courseId === course.courseId,
      );
      const salesTotal = courseRows.reduce((s, r) => s + r.salesAmount, 0);
      const paymentTotal = courseRows.reduce((s, r) => s + r.paymentAmount, 0);
      const grossProfitTotal = salesTotal - paymentTotal;
      return {
        courseId: course.courseId,
        courseName: course.courseName,
        count: courseRows.length,
        salesTotal,
        paymentTotal,
        grossProfitTotal,
        grossProfitRate: calcGrossProfitRate(salesTotal, grossProfitTotal),
      };
    });

  return {
    matchedCount,
    matchedSumCount,
    shigaOnlyCount,
    fmOnlyCount,
    amountMismatchCount,
    mappingFailedCount,
    unregisteredCount,
    fmShortageCount,
    totalSales,
    totalPayment,
    totalGrossProfit,
    grossProfitRate: calcGrossProfitRate(totalSales, totalGrossProfit),
    employeeProfitTotal,
    partnerProfitTotal,
    partTimeProfitTotal,
    grossProfitAvailable: true,
    unreconciledCount:
      shigaOnlyCount +
      fmOnlyCount +
      amountMismatchCount +
      mappingFailedCount +
      unregisteredCount +
      fmShortageCount,
    courseSummaries,
  };
}

function buildReconcileDiagnostics(
  rows: ShigaFmReconciliationRow[],
  excludedTotalRowCount: number,
): ShigaFmReconcileDiagnostics {
  return {
    employeeCount: rows.filter((r) => r.costCategory === "employee").length,
    partnerCount: rows.filter((r) => r.costCategory === "partner").length,
    unregisteredCount: rows.filter((r) => r.costCategory === "unregistered")
      .length,
    fmShortageCount: rows.filter((r) => r.costCategory === "fm_shortage")
      .length,
    excludedTotalRowCount,
  };
}

function buildShigaOnlyTotals(rows: ShigaFmReconciliationRow[]): ShigaFmReconciliationTotals {
  const totalPayment = rows.reduce((s, r) => s + r.paymentAmount, 0);

  const courseSummaries: ShigaFmCourseProfitSummary[] =
    SHIGA_FM_COURSE_MAPPING.map((course) => {
      const courseRows = rows.filter((r) => r.courseId === course.courseId);
      const paymentTotal = courseRows.reduce((s, r) => s + r.paymentAmount, 0);
      return {
        courseId: course.courseId,
        courseName: course.courseName,
        count: courseRows.length,
        salesTotal: 0,
        paymentTotal,
        grossProfitTotal: 0,
        grossProfitRate: null,
      };
    });

  return {
    matchedCount: 0,
    matchedSumCount: 0,
    shigaOnlyCount: rows.length,
    fmOnlyCount: 0,
    amountMismatchCount: 0,
    mappingFailedCount: 0,
    unregisteredCount: 0,
    fmShortageCount: 0,
    totalSales: 0,
    totalPayment,
    totalGrossProfit: 0,
    grossProfitRate: null,
    employeeProfitTotal: 0,
    partnerProfitTotal: 0,
    partTimeProfitTotal: 0,
    grossProfitAvailable: false,
    unreconciledCount: rows.length,
    courseSummaries,
  };
}

function buildFmOnlyTotals(rows: ShigaFmReconciliationRow[]): ShigaFmReconciliationTotals {
  const totalSales = rows.reduce((s, r) => s + r.salesAmount, 0);
  const totalPayment = rows.reduce((s, r) => s + r.paymentAmount, 0);
  const totalGrossProfit = rows.reduce((s, r) => s + r.grossProfitAmount, 0);

  const employeeProfitTotal = rows
    .filter((r) => r.costCategory === "employee")
    .reduce((s, r) => s + r.grossProfitAmount, 0);
  const partnerProfitTotal = rows
    .filter((r) => r.costCategory === "partner")
    .reduce((s, r) => s + r.grossProfitAmount, 0);

  const courseSummaries: ShigaFmCourseProfitSummary[] =
    SHIGA_FM_COURSE_MAPPING.map((course) => {
      const courseRows = rows.filter((r) => r.courseId === course.courseId);
      const salesTotal = courseRows.reduce((s, r) => s + r.salesAmount, 0);
      const paymentTotal = courseRows.reduce((s, r) => s + r.paymentAmount, 0);
      return {
        courseId: course.courseId,
        courseName: course.courseName,
        count: courseRows.length,
        salesTotal,
        paymentTotal,
        grossProfitTotal: salesTotal - paymentTotal,
        grossProfitRate: calcGrossProfitRate(salesTotal, salesTotal - paymentTotal),
      };
    });

  return {
    matchedCount: 0,
    matchedSumCount: 0,
    shigaOnlyCount: 0,
    fmOnlyCount: rows.length,
    amountMismatchCount: 0,
    mappingFailedCount: rows.filter((r) => r.status === "mapping_failed")
      .length,
    unregisteredCount: 0,
    fmShortageCount: 0,
    totalSales,
    totalPayment,
    totalGrossProfit: 0,
    grossProfitRate: null,
    employeeProfitTotal: 0,
    partnerProfitTotal: 0,
    partTimeProfitTotal: 0,
    grossProfitAvailable: false,
    unreconciledCount: rows.length,
    courseSummaries,
  };
}

function buildShigaPreview(shigaResult: PreprocessResult): ShigaFmShigaPreview {
  const totals = shigaResult.shigaDeliveryTotals;
  const records = shigaResult.shigaDeliveryRecords ?? [];
  const courseCounts: Record<string, number> = {};
  for (const course of totals?.courseCounts ?? []) {
    courseCounts[course.courseId] = course.count;
  }
  return {
    dayCount: totals?.importedDayCount ?? 0,
    rowCount: records.length,
    payTotal:
      totals?.payTotal ??
      records.reduce((s, r) => s + r.coursePayTotal, 0),
    courseCounts,
  };
}

function buildFmPreview(fmResult: PreprocessResult): ShigaFmFmPreview {
  const allRecords = fmResult.fmScheduleRecords ?? [];
  const eligible = filterFmRowsForReconciliation(allRecords);
  const employees = new Set(
    eligible.map((r) => r.employeeNameOriginal).filter(Boolean),
  );
  const days = new Set(eligible.map((r) => r.businessDate).filter(Boolean));
  return {
    rowCount: eligible.length,
    salesTotal: eligible.reduce((s, r) => s + (r.revenueAmount ?? 0), 0),
    employeeCount: employees.size,
    dayCount: days.size,
  };
}

function resolveInputMode(input: {
  shigaResult?: PreprocessResult | null;
  fmResult?: PreprocessResult | null;
}): ShigaFmInputMode {
  const hasShiga = input.shigaResult != null;
  const hasFm = input.fmResult != null;
  if (hasShiga && hasFm) return "both";
  if (hasShiga) return "shiga_only";
  if (hasFm) return "fm_only";
  throw new Error("滋賀店配またはFMスケジュールのいずれかが必要です");
}

export function buildShigaFmReconciliationResult(input: {
  shigaResult?: PreprocessResult | null;
  fmResult?: PreprocessResult | null;
  paymentContracts?: PartnerPaymentContract[];
  billingContracts?: ShipperBillingContract[];
  billingShipperId?: string | null;
  /** @deprecated paymentContracts を使用 */
  contracts?: PartnerPaymentContract[];
  employeeNames?: Iterable<string>;
  slotAssignments?: ShigaFmSlotAssignment[];
}): ShigaFmReconciliationResult {
  const inputMode = resolveInputMode(input);
  const warnings: string[] = [];
  const notices: string[] = [];

  const shigaRecords = input.shigaResult?.shigaDeliveryRecords ?? [];
  const fmRecords = input.fmResult?.fmScheduleRecords ?? [];
  const paymentContracts =
    input.paymentContracts ?? input.contracts ?? [];
  const billingContracts = input.billingContracts ?? [];
  const billingShipperId = input.billingShipperId ?? null;
  const employeeNames = buildEmployeeNameSet(input.employeeNames ?? []);
  const slotAssignments = input.slotAssignments ?? [];

  if (inputMode === "shiga_only") {
    notices.push("FMスケジュール未取込 — スケジュール未突合です");
    if (shigaRecords.length === 0) {
      warnings.push("滋賀店配の明細がありません");
    }
  } else if (inputMode === "fm_only") {
    notices.push("滋賀店配未取込 — 売上未突合です");
    if (fmRecords.length === 0) {
      warnings.push("FM社員スケジュールの明細がありません");
    }
  } else {
    if (shigaRecords.length === 0) {
      warnings.push("滋賀店配の明細がありません");
    }
    if (fmRecords.length === 0) {
      warnings.push("FM社員スケジュールの明細がありません");
    }

    const shigaMonth = shigaRecords[0]?.monthPeriod ?? null;
    const fmDates = new Set(
      fmRecords.map((r) => r.businessDate.slice(0, 7)).filter(Boolean),
    );
    if (shigaMonth && fmDates.size > 0 && !fmDates.has(shigaMonth)) {
      warnings.push(
        `月度不一致の可能性: 滋賀=${shigaMonth} / FM=${[...fmDates].join(", ")}`,
      );
    }
    if (paymentContracts.length === 0) {
      warnings.push(
        "協力会社支払契約が未登録です — 傭車の自動計算ができません",
      );
    }
    if (billingContracts.length === 0 || !billingShipperId) {
      warnings.push(
        "荷主請求契約が未登録です — 請求額の自動計算ができません",
      );
    }
  }

  let rows =
    paymentContracts.length > 0 ||
    billingContracts.length > 0 ||
    employeeNames.size > 0 ||
    inputMode !== "both"
      ? matchShigaFmSlots({
          shigaRecords,
          fmRecords,
          paymentContracts,
          billingContracts,
          billingShipperId,
          employeeNames,
          inputMode,
        })
      : matchShigaFmRecordsLegacy({ shigaRecords, fmRecords });

  if (inputMode === "both" && slotAssignments.length > 0) {
    rows = applySlotAssignments({
      rows,
      assignments: slotAssignments,
      paymentContracts,
      billingContracts,
      billingShipperId,
    });
  }

  rows = enrichShigaFmRowsWithReconcileIssues(rows);

  const totals =
    inputMode === "shiga_only"
      ? buildShigaOnlyTotals(rows)
      : inputMode === "fm_only"
        ? buildFmOnlyTotals(rows)
        : buildSlotTotals(rows);

  const shigaMonth = shigaRecords[0]?.monthPeriod ?? null;
  const excludedTotalRowCount =
    input.shigaResult?.shigaDeliveryTotals?.excludedNonIsoDateRowCount ?? 0;

  if (excludedTotalRowCount > 0) {
    notices.push(
      `合計行など非日付行を突合対象から除外しました（${excludedTotalRowCount}コース明細）`,
    );
  }

  return {
    createdAt: new Date().toISOString(),
    inputMode,
    fileStatus: {
      shigaLoaded: input.shigaResult != null,
      fmLoaded: input.fmResult != null,
      shigaFileName: input.shigaResult?.sourceFileName ?? null,
      fmFileName: input.fmResult?.sourceFileName ?? null,
    },
    shigaFileName: input.shigaResult?.sourceFileName ?? null,
    fmFileName: input.fmResult?.sourceFileName ?? null,
    monthPeriod: shigaMonth,
    rows,
    totals,
    diagnostics:
      inputMode === "both"
        ? buildReconcileDiagnostics(rows, excludedTotalRowCount)
        : undefined,
    warnings,
    notices,
    shigaPreview:
      input.shigaResult != null
        ? buildShigaPreview(input.shigaResult)
        : undefined,
    fmPreview:
      input.fmResult != null ? buildFmPreview(input.fmResult) : undefined,
  };
}
