import type { SheetMatrix } from "@/lib/driving-report-parser";
import { isIsoBusinessDate, parseExcelDate } from "@/lib/excel-date";
import {
  SHIGA_DAILY_TOTAL_COL,
  SHIGA_DATA_START_ROW_INDEX,
  SHIGA_DELIVERY_COURSES,
} from "./course-definitions";
import {
  buildShigaDeliveryJoinKey,
  buildShigaDeliveryJoinKeyParts,
} from "./join-key";
import { parseShigaDeliveryMetadata } from "./metadata";
import type {
  ShigaDeliveryDaySummary,
  ShigaDeliveryStagingRecord,
} from "./types";

const AMOUNT_TOLERANCE = 1;

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function cellNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function amountsNearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

function courseHasPayableData(values: {
  unitCount: number;
  freightAmount: number;
  overtimePayAmount: number;
  freightPlusOvertimeAmount: number;
  tollAmount: number;
  coursePayTotal: number;
}): boolean {
  if (values.unitCount >= 1) return true;
  return (
    values.freightAmount >= 1 ||
    values.overtimePayAmount >= 1 ||
    values.freightPlusOvertimeAmount >= 1 ||
    values.tollAmount >= 1 ||
    values.coursePayTotal >= 1
  );
}

export type ShigaDeliveryParseResult = {
  records: ShigaDeliveryStagingRecord[];
  daySummaries: ShigaDeliveryDaySummary[];
  skippedRowCount: number;
  missingDateCount: number;
  /** 合計行など非ISO日付で突合対象から除外したコース明細数 */
  excludedNonIsoDateRowCount: number;
  totalRow: {
    vehicleAmount: number | null;
    toll: number | null;
    unitCount: number | null;
    payTotal: number | null;
    sourceRowNumber: number | null;
    found: boolean;
  };
  parseWarnings: string[];
};

function findTotalRowIndex(rows: SheetMatrix): number {
  for (let i = rows.length - 1; i >= SHIGA_DATA_START_ROW_INDEX; i--) {
    const row = rows[i] ?? [];
    const payTotal = cellNumber(row[SHIGA_DAILY_TOTAL_COL.payTotal]);
    const vehicleAmount = cellNumber(row[SHIGA_DAILY_TOTAL_COL.vehicleAmount]);
    const date = parseExcelDate(row[0]);
    if (!date && (payTotal > 0 || vehicleAmount > 0)) {
      return i;
    }
    const label = cellText(row[0]);
    if (/合計|計/.test(label) && payTotal > 0) {
      return i;
    }
  }
  return -1;
}

function readCourseValues(row: unknown[], startCol: number) {
  return {
    unitCount: cellNumber(row[startCol]),
    freightAmount: cellNumber(row[startCol + 1]),
    overtimeHours: cellNumber(row[startCol + 2]),
    overtimePayAmount: cellNumber(row[startCol + 3]),
    freightPlusOvertimeAmount: cellNumber(row[startCol + 4]),
    tollAmount: cellNumber(row[startCol + 5]),
    coursePayTotal: cellNumber(row[startCol + 6]),
  };
}

export function parseShigaDeliverySheet(
  rows: SheetMatrix,
  options: { fileName: string; sheetName: string; createdAt?: string },
): ShigaDeliveryParseResult {
  const parseWarnings: string[] = [];
  const metadata = parseShigaDeliveryMetadata(rows);
  if (!metadata) {
    parseWarnings.push("滋賀店配シートの基本情報（年月・業者）を読み取れませんでした");
    return {
      records: [],
      daySummaries: [],
      skippedRowCount: 0,
      missingDateCount: 0,
      excludedNonIsoDateRowCount: 0,
      totalRow: {
        vehicleAmount: null,
        toll: null,
        unitCount: null,
        payTotal: null,
        sourceRowNumber: null,
        found: false,
      },
      parseWarnings,
    };
  }

  const totalRowIndex = findTotalRowIndex(rows);
  const dataEndIndex =
    totalRowIndex >= 0 ? totalRowIndex : rows.length;

  let totalRow = {
    vehicleAmount: null as number | null,
    toll: null as number | null,
    unitCount: null as number | null,
    payTotal: null as number | null,
    sourceRowNumber: null as number | null,
    found: false,
  };

  if (totalRowIndex >= 0) {
    const tRow = rows[totalRowIndex] ?? [];
    totalRow = {
      vehicleAmount: cellNumber(tRow[SHIGA_DAILY_TOTAL_COL.vehicleAmount]),
      toll: cellNumber(tRow[SHIGA_DAILY_TOTAL_COL.toll]),
      unitCount: cellNumber(tRow[SHIGA_DAILY_TOTAL_COL.unitCount]),
      payTotal: cellNumber(tRow[SHIGA_DAILY_TOTAL_COL.payTotal]),
      sourceRowNumber: totalRowIndex + 1,
      found: true,
    };
  } else {
    parseWarnings.push("月次合計行を検出できませんでした");
  }

  const records: ShigaDeliveryStagingRecord[] = [];
  const daySummaries: ShigaDeliveryDaySummary[] = [];
  let skippedRowCount = 0;
  let missingDateCount = 0;
  let excludedNonIsoDateRowCount = 0;

  for (let i = SHIGA_DATA_START_ROW_INDEX; i < dataEndIndex; i++) {
    const row = rows[i] ?? [];
    const excelRowNumber = i + 1;
    const rawDateLabel = cellText(row[0]);
    const businessDate = parseExcelDate(row[0]);
    const weekday = cellText(row[1]);

    if (!businessDate || !isIsoBusinessDate(businessDate)) {
      let excludedCourseCount = 0;
      for (const course of SHIGA_DELIVERY_COURSES) {
        const values = readCourseValues(row, course.startCol);
        if (courseHasPayableData(values)) excludedCourseCount++;
      }
      if (excludedCourseCount > 0) {
        excludedNonIsoDateRowCount += excludedCourseCount;
        skippedRowCount++;
      } else {
        const hasAnyValue = row.some(
          (cell) => cellNumber(cell) !== 0 || cellText(cell),
        );
        if (hasAnyValue) {
          skippedRowCount++;
          if (!businessDate || /合計|計/.test(rawDateLabel)) {
            missingDateCount++;
          }
        }
      }
      continue;
    }

    const dailyVehicleAmountTotal = cellNumber(
      row[SHIGA_DAILY_TOTAL_COL.vehicleAmount],
    );
    const dailyTollTotal = cellNumber(row[SHIGA_DAILY_TOTAL_COL.toll]);
    const dailyUnitCountTotal = cellNumber(
      row[SHIGA_DAILY_TOTAL_COL.unitCount],
    );
    const dailyPayTotal = cellNumber(row[SHIGA_DAILY_TOTAL_COL.payTotal]);

    const dayRecords: ShigaDeliveryStagingRecord[] = [];
    let coursePaySum = 0;

    for (const course of SHIGA_DELIVERY_COURSES) {
      const values = readCourseValues(row, course.startCol);
      if (!courseHasPayableData(values)) continue;

      coursePaySum += values.coursePayTotal;

      const joinKeyParts = buildShigaDeliveryJoinKeyParts({
        vendorCode: metadata.vendorCode,
        vendorName: metadata.vendorName,
        courseId: course.courseId,
        businessDate,
      });

      const record: ShigaDeliveryStagingRecord = {
        id: crypto.randomUUID(),
        sourceFileName: options.fileName,
        sourceRowNumber: excelRowNumber,
        sheetName: options.sheetName,
        year: metadata.year,
        month: metadata.month,
        monthPeriod: metadata.monthPeriod,
        closingMonth: metadata.closingMonth,
        vendorCode: metadata.vendorCode,
        vendorName: metadata.vendorName,
        vehicleType: metadata.vehicleType,
        businessDate,
        weekday,
        courseId: course.courseId,
        courseName: course.courseName,
        routeName: course.routeName,
        joinKey: buildShigaDeliveryJoinKey(joinKeyParts),
        joinKeyParts,
        unitCount: values.unitCount,
        freightAmount: values.freightAmount,
        overtimeHours: values.overtimeHours,
        overtimePayAmount: values.overtimePayAmount,
        freightPlusOvertimeAmount: values.freightPlusOvertimeAmount,
        tollAmount: values.tollAmount,
        coursePayTotal: values.coursePayTotal,
        dailyVehicleAmountTotal: dailyVehicleAmountTotal || null,
        dailyTollTotal: dailyTollTotal || null,
        dailyUnitCountTotal: dailyUnitCountTotal || null,
        dailyPayTotal: dailyPayTotal || null,
        status: "ok",
        warningFlags: [],
        warningMessages: [],
        isManuallyEdited: false,
        raw: {
          rowIndex: i,
          courseStartCol: course.startCol,
          cells: row.slice(course.startCol, course.startCol + 7),
        },
      };
      dayRecords.push(record);
      records.push(record);
    }

    const mismatchReasons: string[] = [];
    if (dailyPayTotal > 0) {
      if (!amountsNearlyEqual(coursePaySum, dailyPayTotal)) {
        mismatchReasons.push(
          `コース支払合計(${coursePaySum}) ≠ 日次支払合計(${dailyPayTotal})`,
        );
      }
      if (
        dailyVehicleAmountTotal > 0 &&
        dailyTollTotal >= 0 &&
        !amountsNearlyEqual(
          dailyVehicleAmountTotal + dailyTollTotal,
          dailyPayTotal,
        )
      ) {
        mismatchReasons.push(
          `車格金額+高速代(${dailyVehicleAmountTotal + dailyTollTotal}) ≠ 日次支払合計(${dailyPayTotal})`,
        );
      }
    }

    const isBalanced = mismatchReasons.length === 0;
    if (!isBalanced && dayRecords.length > 0) {
      for (const rec of dayRecords) {
        rec.status = "warning";
        if (!rec.warningFlags.includes("DAILY_TOTAL_MISMATCH")) {
          rec.warningFlags.push("DAILY_TOTAL_MISMATCH");
        }
        rec.warningMessages.push(...mismatchReasons);
      }
    }

    daySummaries.push({
      businessDate,
      weekday,
      sourceRowNumber: excelRowNumber,
      coursePaySum,
      excelDailyPayTotal: dailyPayTotal || null,
      excelVehicleAmountTotal: dailyVehicleAmountTotal || null,
      excelTollTotal: dailyTollTotal || null,
      isBalanced,
      mismatchReasons,
      detailCount: dayRecords.length,
    });
  }

  return {
    records,
    daySummaries,
    skippedRowCount,
    missingDateCount,
    excludedNonIsoDateRowCount,
    totalRow,
    parseWarnings,
  };
}
