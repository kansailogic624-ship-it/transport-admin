import type { PreprocessResult } from "../types";
import { applyAliasEngineToFmScheduleRecords } from "./apply-alias";
import { fillVehicleFromEmployeeDay } from "./fill-vehicle-from-day";
import { fillVehicleFromJointJob } from "./fill-vehicle-from-joint-job";
import { applyLaborTimeSelection } from "./labor";
import { applyJointOperationToFmScheduleRecords } from "./joint-operation";
import { applyNotePartnerDetection } from "./note-partner-detection";
import { parseFmEmployeeScheduleSheet } from "./parser";
import { buildFmScheduleRevenueReconciliation } from "./revenue-reconciliation";
import { attachFmRecordOriginalStates } from "./record-snapshot";
import { applyFmReviewDecisionRules } from "./review-decision";
import { computeWarningResolutionRate } from "./resolution-rate";
import {
  countJointManualDecisionRows,
  countManualEditedRows,
  countManualVehicleFillRows,
} from "./summary-filter-registry";
import {
  countDismissedWarnings,
  countOnHoldWarnings,
  countPendingWarnings,
  countWarningRows,
  getActionableWarnings,
  initializeWarningTracking,
  isAttendanceHolidayRow,
} from "./warning-tracking";
import { collectFmScheduleWarnings } from "./warnings";
import type { FmReviewDecisionRule } from "./types";
import type {
  FmEmployeeDaySummary,
  FmEmployeeScheduleStagingRecord,
  FmOperationSummary,
  FmScheduleAmountTotals,
} from "./types";
import type { AliasLedgerSources, AliasResolveStatus } from "@/lib/alias-engine";
import type { MasterData } from "@/lib/types";
import type { SheetMatrix } from "@/lib/driving-report-parser";

export function buildFmEmployeeDaySummaries(
  records: FmEmployeeScheduleStagingRecord[],
): FmEmployeeDaySummary[] {
  const map = new Map<string, FmEmployeeDaySummary>();

  for (const record of records) {
    if (record.isPartnerLikeRow) continue;
    const existing = map.get(record.employeeDayKey);
    if (!existing) {
      map.set(record.employeeDayKey, {
        employeeDayKey: record.employeeDayKey,
        businessDate: record.businessDate,
        employeeNameCanonical: record.employeeNameCanonical,
        employeeNameOriginal: record.employeeNameOriginal,
        rowCount: 1,
        revenueTotal: record.isRevenueRow
          ? record.employeeRevenueShareAmount
          : 0,
        clockInTime: record.countsForLaborTime ? record.clockInTime : "",
        clockOutTime: record.countsForLaborTime ? record.clockOutTime : "",
        bindingMinutes: record.countsForLaborTime ? record.bindingMinutes : null,
        countsForLaborRowNumber: record.countsForLaborTime
          ? record.sourceRowNumber
          : null,
        warningFlags: [...getActionableWarnings(record)],
      });
      continue;
    }

    existing.rowCount += 1;
    if (record.isRevenueRow) {
      existing.revenueTotal += record.employeeRevenueShareAmount;
    }
    if (record.countsForLaborTime) {
      existing.clockInTime = record.clockInTime;
      existing.clockOutTime = record.clockOutTime;
      existing.bindingMinutes = record.bindingMinutes;
      existing.countsForLaborRowNumber = record.sourceRowNumber;
    }
    for (const flag of getActionableWarnings(record)) {
      if (!existing.warningFlags.includes(flag)) {
        existing.warningFlags.push(flag);
      }
    }
  }

  return [...map.values()].sort((a, b) =>
    `${a.businessDate}:${a.employeeNameOriginal}`.localeCompare(
      `${b.businessDate}:${b.employeeNameOriginal}`,
      "ja",
    ),
  );
}

function countDistinctUnresolved(
  records: FmEmployeeScheduleStagingRecord[],
  field: keyof FmEmployeeScheduleStagingRecord["aliasStatus"],
  getOriginal: (record: FmEmployeeScheduleStagingRecord) => string,
  skip?: (record: FmEmployeeScheduleStagingRecord) => boolean,
): number {
  const seen = new Set<string>();
  for (const record of records) {
    if (skip?.(record)) continue;
    const original = getOriginal(record).trim();
    if (!original) continue;
    const status: AliasResolveStatus = record.aliasStatus[field];
    if (status === "unresolved") {
      seen.add(original);
    }
  }
  return seen.size;
}

export function buildFmOperationSummaries(
  records: FmEmployeeScheduleStagingRecord[],
): FmOperationSummary[] {
  const map = new Map<string, FmOperationSummary>();

  for (const record of records) {
    const groupKey = record.operationGroupKey || record.jointJobKey;
    if (!groupKey || record.isAttendanceOnlyRow) continue;

    const existing = map.get(groupKey);
    if (!existing) {
      const vehicles = new Set(
        record.jointOperationMembers
          .map(
            (m) =>
              m.vehicleNumberCanonical?.trim() ||
              m.vehicleNumberFilled?.trim() ||
              m.vehicleNumberOriginal.trim() ||
              "",
          )
          .filter(Boolean),
      );
      map.set(groupKey, {
        operationGroupKey: groupKey,
        jointJobKey: record.jointJobKey,
        operationKey: groupKey,
        businessDate: record.businessDate,
        shipperNameCanonical: record.shipperNameCanonical,
        jobNameCanonical: record.jobNameCanonical,
        vehicleNumberCanonical:
          vehicles.size === 1 ? [...vehicles][0]! : record.vehicleNumberCanonical,
        isJointOperation: record.isJointOperation,
        jointOperationMemberCount: record.jointOperationMemberCount,
        jointOperationMembers: [...record.jointOperationMembers],
        operationRevenueAmount: record.operationRevenueAmount,
        rowCount: 1,
        requiresHumanReview: record.requiresHumanReview,
        jointOperationReviewDecision: record.jointOperationReviewDecision,
        warningFlags: [...getActionableWarnings(record)],
        infoFlags: [...record.infoFlags],
      });
      continue;
    }

    existing.rowCount += 1;
    for (const flag of getActionableWarnings(record)) {
      if (!existing.warningFlags.includes(flag)) {
        existing.warningFlags.push(flag);
      }
    }
    for (const flag of record.infoFlags) {
      if (!existing.infoFlags.includes(flag)) {
        existing.infoFlags.push(flag);
      }
    }
  }

  return [...map.values()].sort((a, b) =>
    `${a.businessDate}:${a.operationGroupKey}`.localeCompare(
      `${b.businessDate}:${b.operationGroupKey}`,
      "ja",
    ),
  );
}

export function buildFmScheduleAmountTotals(
  records: FmEmployeeScheduleStagingRecord[],
  daySummaries: FmEmployeeDaySummary[],
  operationSummaries: FmOperationSummary[],
): FmScheduleAmountTotals {
  const revenueReconciliation = buildFmScheduleRevenueReconciliation(records);

  const jointOps = operationSummaries.filter((o) => o.isJointOperation);
  const resolution = computeWarningResolutionRate(records);

  return {
    sales: revenueReconciliation.companyTotal,
    rowCount: records.length,
    employeeDayCount: daySummaries.length,
    operationCount: operationSummaries.length,
    jointOperationCount: jointOps.length,
    jointTwoManCount: jointOps.filter((o) => o.jointOperationMemberCount === 2)
      .length,
    jointThreePlusCount: jointOps.filter(
      (o) => o.jointOperationMemberCount >= 3,
    ).length,
    needsReviewJointCount: jointOps.filter((o) => o.requiresHumanReview).length,
    attendanceHolidayRowCount: records.filter(isAttendanceHolidayRow).length,
    pendingWarningCount: countPendingWarnings(records),
    dismissedWarningCount: countDismissedWarnings(records),
    onHoldWarningCount: countOnHoldWarnings(records),
    manualEditedRowCount: countManualEditedRows(records),
    jointManualDecisionRowCount: countJointManualDecisionRows(records),
    manualVehicleFillRowCount: countManualVehicleFillRows(records),
    totalOriginalWarningCount: resolution.totalOriginalWarningCount,
    fixedByEditWarningCount: resolution.fixedByEditWarningCount,
    resolvedWarningCount: resolution.resolvedWarningCount,
    warningResolutionRatePercent: resolution.resolutionRatePercent,
    warningRowCount: countWarningRows(records),
    needsReviewCount: records.filter((r) => r.requiresHumanReview).length,
    errorRowCount: records.filter((r) =>
      getActionableWarnings(r).includes("MISSING_BUSINESS_DATE"),
    ).length,
    attendanceRowCount: records.filter(isAttendanceHolidayRow).length,
    unresolvedEmployeeCount: countDistinctUnresolved(
      records,
      "employee",
      (r) => r.employeeNameOriginal,
      (r) => r.isPartnerLikeRow,
    ),
    unresolvedVehicleCount: countDistinctUnresolved(
      records,
      "vehicle",
      (r) => r.vehicleNumberOriginal.trim() || r.vehicleNumberFilled?.trim() || "",
    ),
    unresolvedShipperCount: countDistinctUnresolved(
      records,
      "shipper",
      (r) => r.shipperNameOriginal,
      (r) => r.isAttendanceOnlyRow,
    ),
    unresolvedJobCount: countDistinctUnresolved(
      records,
      "job",
      (r) => r.jobNameOriginal,
      (r) => r.isAttendanceOnlyRow,
    ),
    revenueReconciliation,
  };
}

export function processFmEmployeeScheduleSheets(
  sheets: Array<{ sheetName: string; rows: SheetMatrix }>,
  fileName: string,
  masters?: MasterData | null,
  ledger?: AliasLedgerSources | null,
  options?: {
    reviewDecisionRules?: FmReviewDecisionRule[];
  },
): {
  records: FmEmployeeScheduleStagingRecord[];
  daySummaries: FmEmployeeDaySummary[];
  operationSummaries: FmOperationSummary[];
  fmScheduleTotals: FmScheduleAmountTotals;
  parseWarnings: string[];
} {
  const createdAt = new Date().toISOString();
  const parseWarnings: string[] = [];
  let records: FmEmployeeScheduleStagingRecord[] = [];

  for (const sheet of sheets) {
    if (sheet.rows.length === 0) continue;
    const parsed = parseFmEmployeeScheduleSheet(sheet.rows, {
      fileName,
      sheetName: sheet.sheetName,
      createdAt,
    });
    parseWarnings.push(...parsed.warnings);
    records.push(...parsed.records);
  }

  records = applyAliasEngineToFmScheduleRecords(records, masters, ledger);
  records = fillVehicleFromEmployeeDay(records, masters, ledger);
  records = fillVehicleFromJointJob(records, masters, ledger);
  records = applyJointOperationToFmScheduleRecords(records);
  records = applyNotePartnerDetection(records);
  records = applyFmReviewDecisionRules(
    records,
    options?.reviewDecisionRules ?? [],
  );
  records = applyLaborTimeSelection(records);
  records = collectFmScheduleWarnings(records);
  records = initializeWarningTracking(records);
  records = attachFmRecordOriginalStates(records);

  const daySummaries = buildFmEmployeeDaySummaries(records);
  const operationSummaries = buildFmOperationSummaries(records);
  const fmScheduleTotals = buildFmScheduleAmountTotals(
    records,
    daySummaries,
    operationSummaries,
  );

  return {
    records,
    daySummaries,
    operationSummaries,
    fmScheduleTotals,
    parseWarnings,
  };
}

export function buildFmEmployeeSchedulePreprocessResult(input: {
  fileName: string;
  records: FmEmployeeScheduleStagingRecord[];
  daySummaries: FmEmployeeDaySummary[];
  operationSummaries: FmOperationSummary[];
  fmScheduleTotals: FmScheduleAmountTotals;
  parseWarnings: string[];
  createdAt: string;
  reviewDecisionRules?: FmReviewDecisionRule[];
}): PreprocessResult {
  const warningRows = countWarningRows(input.records);
  const errorRows = input.records.filter((r) =>
    getActionableWarnings(r).includes("MISSING_BUSINESS_DATE"),
  ).length;
  const successRows = input.records.length - warningRows;

  const parseWarnings = [...input.parseWarnings];
  const reconciliation = input.fmScheduleTotals.revenueReconciliation;
  if (!reconciliation.isBalanced) {
    parseWarnings.push(
      `REVENUE_RECONCILIATION_MISMATCH: ${reconciliation.mismatchReasons.join(" / ")}`,
    );
  }

  return {
    sourceType: "filemaker_employee_schedule",
    sourceFileName: input.fileName,
    totalRows: input.records.length,
    successRows: Math.max(0, successRows),
    warningRows,
    errorRows,
    duplicateRows: input.records.filter((r) =>
      r.warningFlags.includes("DUPLICATE_EMPLOYEE_JOB_KEY"),
    ).length,
    records: [],
    fmScheduleRecords: input.records,
    fmEmployeeDaySummaries: input.daySummaries,
    fmOperationSummaries: input.operationSummaries,
    fmScheduleTotals: input.fmScheduleTotals,
    fmReviewDecisionRules: input.reviewDecisionRules ?? [],
    warnings: parseWarnings.map((message) => ({
      code: message.startsWith("REVENUE_RECONCILIATION_MISMATCH")
        ? "REVENUE_RECONCILIATION_MISMATCH"
        : "PARSE_WARNING",
      message,
    })),
    errors:
      input.records.length === 0
        ? [{ code: "NO_ROWS", message: "FM社員スケジュール行を読み取れませんでした" }]
        : [],
    createdAt: input.createdAt,
  };
}
