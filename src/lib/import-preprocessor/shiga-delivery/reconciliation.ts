import { SHIGA_DELIVERY_COURSES } from "./course-definitions";
import type {
  ShigaDeliveryAmountTotals,
  ShigaDeliveryDaySummary,
  ShigaDeliveryStagingRecord,
  ShigaDeliveryWarningCode,
} from "./types";

const AMOUNT_TOLERANCE = 1;

function amountsNearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

export function buildShigaDeliveryAmountTotals(input: {
  records: ShigaDeliveryStagingRecord[];
  daySummaries: ShigaDeliveryDaySummary[];
  skippedRowCount: number;
  missingDateCount: number;
  excludedNonIsoDateRowCount?: number;
  totalRow: ShigaDeliveryAmountTotals["excelMonthlyTotals"] & {
    found: boolean;
  };
}): ShigaDeliveryAmountTotals {
  const importedDayCount = input.daySummaries.length;
  const importedActiveDayCount = new Set(
    input.records.map((r) => r.businessDate).filter(Boolean),
  ).size;

  const unitCountTotal = input.records.reduce((s, r) => s + r.unitCount, 0);
  const freightTotal = input.records.reduce((s, r) => s + r.freightAmount, 0);
  const overtimePayTotal = input.records.reduce(
    (s, r) => s + r.overtimePayAmount,
    0,
  );
  const tollTotal = input.records.reduce((s, r) => s + r.tollAmount, 0);
  const payTotal = input.records.reduce((s, r) => s + r.coursePayTotal, 0);

  const dailyMismatchCount = input.daySummaries.filter((d) => !d.isBalanced)
    .length;

  const courseCounts = SHIGA_DELIVERY_COURSES.map((course) => ({
    courseId: course.courseId,
    courseName: course.courseName,
    count: input.records.filter((r) => r.courseId === course.courseId).length,
  }));

  const mismatchReasons: string[] = [];
  let monthlyMismatchCount = 0;

  const excel = input.totalRow;
  const matches = {
    vehicleAmount: null as boolean | null,
    toll: null as boolean | null,
    unitCount: null as boolean | null,
    payTotal: null as boolean | null,
    allMatch: null as boolean | null,
  };

  if (excel.found) {
    const importedVehicle =
      input.records.reduce((s, r) => s + r.freightPlusOvertimeAmount, 0);
    matches.vehicleAmount =
      excel.vehicleAmount == null
        ? null
        : amountsNearlyEqual(importedVehicle, excel.vehicleAmount);
    matches.toll =
      excel.toll == null ? null : amountsNearlyEqual(tollTotal, excel.toll);
    matches.unitCount =
      excel.unitCount == null
        ? null
        : amountsNearlyEqual(unitCountTotal, excel.unitCount);
    matches.payTotal =
      excel.payTotal == null
        ? null
        : amountsNearlyEqual(payTotal, excel.payTotal);

    if (matches.vehicleAmount === false) {
      mismatchReasons.push(
        `車格金額合計: Excel=${excel.vehicleAmount} / 取込=${importedVehicle}`,
      );
    }
    if (matches.toll === false) {
      mismatchReasons.push(`高速代合計: Excel=${excel.toll} / 取込=${tollTotal}`);
    }
    if (matches.unitCount === false) {
      mismatchReasons.push(
        `台数合計: Excel=${excel.unitCount} / 取込=${unitCountTotal}`,
      );
    }
    if (matches.payTotal === false) {
      mismatchReasons.push(
        `支払合計: Excel=${excel.payTotal} / 取込=${payTotal}`,
      );
    }

    const checks = [
      matches.vehicleAmount,
      matches.toll,
      matches.unitCount,
      matches.payTotal,
    ].filter((v) => v != null);
    matches.allMatch = checks.length > 0 && checks.every((v) => v === true);
    if (matches.allMatch === false) {
      monthlyMismatchCount = 1;
    }
  }

  return {
    importedDayCount,
    importedActiveDayCount,
    importedDetailCount: input.records.length,
    skippedRowCount: input.skippedRowCount,
    unitCountTotal,
    freightTotal,
    overtimePayTotal,
    tollTotal,
    payTotal,
    dailyMismatchCount,
    monthlyMismatchCount,
    missingDateCount: input.missingDateCount,
    excludedNonIsoDateRowCount: input.excludedNonIsoDateRowCount ?? 0,
    courseCounts,
    excelMonthlyTotals: excel,
    reconciliation: {
      matches,
      mismatchReasons,
    },
  };
}

export function applyMonthlyMismatchWarnings(
  records: ShigaDeliveryStagingRecord[],
  totals: ShigaDeliveryAmountTotals,
): ShigaDeliveryStagingRecord[] {
  if (totals.reconciliation.matches.allMatch !== false) return records;
  return records.map((record) => {
    const flags: ShigaDeliveryWarningCode[] = record.warningFlags.includes(
      "MONTHLY_TOTAL_MISMATCH",
    )
      ? record.warningFlags
      : [...record.warningFlags, "MONTHLY_TOTAL_MISMATCH"];
    const messages = [
      ...record.warningMessages,
      ...totals.reconciliation.mismatchReasons,
    ];
    return {
      ...record,
      status: "warning" as const,
      warningFlags: flags,
      warningMessages: [...new Set(messages)],
    };
  });
}
