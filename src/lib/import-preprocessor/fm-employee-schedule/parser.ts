/**
 * FM社員スケジュール Excel（A-I 列固定）パーサー
 */

import {
  parseIsoDateFromCell,
  parseIsoDateFromFileName,
  parseTimecardTimeCell,
} from "@/lib/import-match-keys";
import {
  detectDayStatusFromText,
  isAttendanceScheduleRow,
} from "@/lib/schedule-day-status";
import type { SheetMatrix } from "@/lib/driving-report-parser";
import type { FmEmployeeScheduleStagingRecord } from "./types";

function parseMoneyText(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}
import { FM_EMPLOYEE_SCHEDULE_SCHEMA_VERSION } from "./types";

/** A-I 列（0-based） */
export const FM_EMPLOYEE_SCHEDULE_COL = {
  revenue: 0,
  shipper: 1,
  job: 2,
  vehicle: 3,
  employee: 4,
  clockIn: 5,
  clockOut: 6,
  date: 7,
  personalNote: 8,
} as const;

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\u3000/g, " ").trim();
}

function isHeaderRow(row: unknown[]): boolean {
  const joined = row.map(cellText).join(",");
  return (
    /実売上/.test(joined) &&
    (/社員名|社員/.test(joined) || /出勤/.test(joined))
  );
}

function isAggregateRow(shipper: string, job: string, employee: string): boolean {
  const text = `${shipper}${job}${employee}`.replace(/\s/g, "");
  return /^(合計|小計|総合計|計)$/.test(text);
}

function isNineColumnScheduleFormat(rows: SheetMatrix): boolean {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] ?? [];
    if (isHeaderRow(row)) {
      const joined = row.map(cellText).join("|");
      if (/出勤/.test(joined) && /退勤/.test(joined)) return true;
    }
    const employee = cellText(row[FM_EMPLOYEE_SCHEDULE_COL.employee]);
    const dateCell = row[FM_EMPLOYEE_SCHEDULE_COL.date];
    const date =
      parseIsoDateFromCell(dateCell) ??
      (typeof dateCell === "string" && dateCell ? dateCell : null);
    if (employee.length >= 2 && date) return true;
  }
  return false;
}

function parseRevenue(value: unknown, isAttendance: boolean): number | null {
  if (isAttendance) return 0;
  const text = cellText(value);
  if (!text) return null;
  const amount = parseMoneyText(text);
  return amount;
}

export type ParseFmEmployeeScheduleOptions = {
  fileName: string;
  sheetName: string;
  createdAt?: string;
};

export function parseFmEmployeeScheduleSheet(
  rows: SheetMatrix,
  options: ParseFmEmployeeScheduleOptions,
): { records: FmEmployeeScheduleStagingRecord[]; warnings: string[] } {
  const warnings: string[] = [];
  const createdAt = options.createdAt ?? new Date().toISOString();
  const fileDateFallback = parseIsoDateFromFileName(options.fileName);

  if (!isNineColumnScheduleFormat(rows)) {
    warnings.push(
      "A-I列形式（実売上・社員名・出勤・退勤・日付）を検出できませんでした",
    );
    return { records: [], warnings };
  }

  let headerSkipped = false;
  const parsed: FmEmployeeScheduleStagingRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const excelRowNumber = i + 1;

    if (!headerSkipped && isHeaderRow(row)) {
      headerSkipped = true;
      continue;
    }

    const shipper = cellText(row[FM_EMPLOYEE_SCHEDULE_COL.shipper]);
    const job = cellText(row[FM_EMPLOYEE_SCHEDULE_COL.job]);
    const employee = cellText(row[FM_EMPLOYEE_SCHEDULE_COL.employee]);
    const vehicle = cellText(row[FM_EMPLOYEE_SCHEDULE_COL.vehicle]);
    const personalNote = cellText(row[FM_EMPLOYEE_SCHEDULE_COL.personalNote]);

    if (!employee && !shipper && !job) continue;
    if (isAggregateRow(shipper, job, employee)) continue;

    const dateRaw = row[FM_EMPLOYEE_SCHEDULE_COL.date];
    const businessDate =
      parseIsoDateFromCell(dateRaw) ?? fileDateFallback ?? "";

    const isAttendanceOnlyRow = isAttendanceScheduleRow(shipper, job);
    const dayStatus = detectDayStatusFromText(job, shipper) ?? null;
    const isHolidayRow = dayStatus != null;

    const revenueAmount = parseRevenue(
      row[FM_EMPLOYEE_SCHEDULE_COL.revenue],
      isAttendanceOnlyRow,
    );

    const hasJob = Boolean(job.trim()) || isAttendanceOnlyRow;
    if (!employee.trim() && !hasJob) continue;

    const isRevenueRow =
      !isAttendanceOnlyRow &&
      !isHolidayRow &&
      revenueAmount != null &&
      revenueAmount > 0;

    const id = `fmes-${options.fileName}-${excelRowNumber}`;

    parsed.push({
      id,
      schemaVersion: FM_EMPLOYEE_SCHEDULE_SCHEMA_VERSION,
      sourceType: "filemaker_employee_schedule",
      sourceFileName: options.fileName,
      sourceSheetName: options.sheetName,
      sourceRowNumber: excelRowNumber,
      businessDate,
      employeeNameOriginal: employee,
      partnerNameOriginal: null,
      shipperNameOriginal: shipper,
      jobNameOriginal: job || (isHolidayRow ? "休み" : ""),
      vehicleNumberOriginal: vehicle,
      vehicleNumberFilled: null,
      vehicleNumberFilledSource: null,
      vehicleNumberFilledReason: null,
      vehicleNumberFilledFromRowNumber: null,
      manualVehicleFill: null,
      manualEditHistory: [],
      saveSnapshots: [],
      lastManualEditBy: null,
      lastManualEditAt: null,
      lastManualEditSummary: null,
      onHoldWarningFlags: [],
      personalNote,
      employeeNameCanonical: null,
      employeeCanonicalId: null,
      shipperNameCanonical: null,
      shipperCanonicalId: null,
      jobNameCanonical: null,
      jobCanonicalId: null,
      vehicleNumberCanonical: null,
      vehicleCanonicalId: null,
      aliasStatus: {
        employee: "unresolved",
        shipper: "unresolved",
        job: "unresolved",
        vehicle: "unresolved",
      },
      revenueAmount,
      clockInTime: parseTimecardTimeCell(row[FM_EMPLOYEE_SCHEDULE_COL.clockIn]),
      clockOutTime: parseTimecardTimeCell(row[FM_EMPLOYEE_SCHEDULE_COL.clockOut]),
      isAttendanceOnlyRow,
      isHolidayRow,
      isPartnerLikeRow: false,
      resolvedInactiveEmployee: false,
      isRevenueRow,
      dayStatus,
      employeeDayKey: "",
      countsForLaborTime: false,
      laborTimeGroupRank: 0,
      bindingMinutes: null,
      employeeJobKey: "",
      employeeJobKeyProvisional: true,
      jointJobKey: "",
      operationKey: "",
      isJointOperation: false,
      jointOperationMemberCount: 1,
      jointOperationMembers: [],
      operationRevenueAmount: null,
      employeeRevenueShareAmount: 0,
      countsForCompanyRevenue: false,
      requiresHumanReview: false,
      humanReviewCategory: null,
      jointOperationReviewDecision: null,
      operationGroupKey: "",
      matchStatus: isAttendanceOnlyRow ? "not_applicable" : "unmatched",
      warningFlags: [],
      originalWarningFlags: [],
      currentWarningFlags: [],
      resolvedWarningFlags: [],
      reviewDecisions: [],
      infoFlags: [],
      raw: {
        revenue: row[FM_EMPLOYEE_SCHEDULE_COL.revenue],
        shipper,
        job,
        vehicle,
        employee,
        clockIn: row[FM_EMPLOYEE_SCHEDULE_COL.clockIn],
        clockOut: row[FM_EMPLOYEE_SCHEDULE_COL.clockOut],
        date: dateRaw,
        personalNote,
      },
      createdAt,
      updatedAt: createdAt,
    });
  }

  return { records: parsed, warnings };
}
