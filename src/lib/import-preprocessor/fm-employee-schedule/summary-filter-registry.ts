import type { FmScheduleViewFilter } from "./filters";
import type {
  FmEmployeeScheduleStagingRecord,
  FmScheduleAmountTotals,
} from "./types";

export type FmSummaryCardAccent = "ok" | "warn" | "err";

export type FmSummaryCardDef = {
  id: string;
  label: string;
  filterKey: FmScheduleViewFilter | null;
  group: "overview" | "warnings" | "manual" | "joint" | "unresolved" | "revenue";
  accent?: FmSummaryCardAccent;
  filterable: boolean;
  isText?: boolean;
  getValue: (totals: FmScheduleAmountTotals, result: { totalRows: number }) => string | number;
};

export const FM_SCHEDULE_SUMMARY_CARDS: FmSummaryCardDef[] = [
  {
    id: "total_rows",
    label: "読込行数",
    filterKey: "all",
    group: "overview",
    filterable: true,
    getValue: (_t, r) => r.totalRows,
  },
  {
    id: "employee_days",
    label: "社員日数",
    filterKey: "all",
    group: "overview",
    filterable: true,
    getValue: (t) => t.employeeDayCount,
  },
  {
    id: "operations",
    label: "業務単位数",
    filterKey: "all",
    group: "overview",
    filterable: true,
    getValue: (t) => t.operationCount,
  },
  {
    id: "joint_two_man",
    label: "2マン作業数",
    filterKey: "joint_two_man",
    group: "joint",
    filterable: true,
    getValue: (t) => t.jointTwoManCount,
  },
  {
    id: "joint_three_plus",
    label: "3名以上作業数",
    filterKey: "joint_three_plus",
    group: "joint",
    filterable: true,
    getValue: (t) => t.jointThreePlusCount,
  },
  {
    id: "needs_review_joint",
    label: "要確認共同作業数",
    filterKey: "needs_review_joint",
    group: "joint",
    accent: "warn",
    filterable: true,
    getValue: (t) => t.needsReviewJointCount,
  },
  {
    id: "pending_warnings",
    label: "未対応警告件数",
    filterKey: "has_warnings",
    group: "warnings",
    accent: "warn",
    filterable: true,
    getValue: (t) => t.pendingWarningCount,
  },
  {
    id: "dismissed_warnings",
    label: "問題なし件数",
    filterKey: "warnings_dismissed",
    group: "warnings",
    accent: "ok",
    filterable: true,
    getValue: (t) => t.dismissedWarningCount,
  },
  {
    id: "on_hold_warnings",
    label: "保留件数",
    filterKey: "warnings_on_hold",
    group: "warnings",
    filterable: true,
    getValue: (t) => t.onHoldWarningCount,
  },
  {
    id: "resolution_rate",
    label: "解消率",
    filterKey: null,
    group: "warnings",
    accent: "ok",
    filterable: false,
    isText: true,
    getValue: (t) => `${t.warningResolutionRatePercent}%`,
  },
  {
    id: "manual_edited",
    label: "手動修正済み件数",
    filterKey: "manual_edited",
    group: "manual",
    filterable: true,
    getValue: (t) => t.manualEditedRowCount,
  },
  {
    id: "joint_manual_decision",
    label: "共同作業手動判定件数",
    filterKey: "joint_manual_decision",
    group: "manual",
    filterable: true,
    getValue: (t) => t.jointManualDecisionRowCount,
  },
  {
    id: "manual_vehicle_fill",
    label: "車番手動補完件数",
    filterKey: "manual_vehicle_fill",
    group: "manual",
    filterable: true,
    getValue: (t) => t.manualVehicleFillRowCount,
  },
  {
    id: "needs_review",
    label: "要確認件数",
    filterKey: "requires_human_review",
    group: "warnings",
    accent: "warn",
    filterable: true,
    getValue: (t) => t.needsReviewCount,
  },
  {
    id: "attendance_holiday",
    label: "勤怠・休み行数",
    filterKey: "attendance_holiday",
    group: "overview",
    filterable: true,
    getValue: (t) => t.attendanceHolidayRowCount,
  },
  {
    id: "error_rows",
    label: "エラー行数",
    filterKey: "error_rows",
    group: "warnings",
    accent: "err",
    filterable: true,
    getValue: (t) => t.errorRowCount,
  },
  {
    id: "unresolved_employee",
    label: "未解決社員数",
    filterKey: "unresolved_employee",
    group: "unresolved",
    accent: "warn",
    filterable: true,
    getValue: (t) => t.unresolvedEmployeeCount,
  },
  {
    id: "unresolved_vehicle",
    label: "未解決車両数",
    filterKey: "unresolved_vehicle",
    group: "unresolved",
    accent: "warn",
    filterable: true,
    getValue: (t) => t.unresolvedVehicleCount,
  },
  {
    id: "unresolved_shipper",
    label: "未解決荷主数",
    filterKey: "unresolved_shipper",
    group: "unresolved",
    accent: "warn",
    filterable: true,
    getValue: (t) => t.unresolvedShipperCount,
  },
  {
    id: "unresolved_job",
    label: "未解決業務数",
    filterKey: "unresolved_job",
    group: "unresolved",
    accent: "warn",
    filterable: true,
    getValue: (t) => t.unresolvedJobCount,
  },
];

export const FM_SCHEDULE_QUICK_FILTERS: FmScheduleViewFilter[] = [
  "all",
  "has_warnings",
  "warnings_dismissed",
  "warnings_on_hold",
  "manual_edited",
  "manual_vehicle_fill",
  "joint_manual_decision",
  "attendance_holiday",
  "joint_two_man",
  "joint_three_plus",
  "needs_review_joint",
  "vehicle_filled",
  "external_partner",
  "unresolved_any",
  "unresolved_employee",
  "unresolved_vehicle",
  "unresolved_shipper",
  "unresolved_job",
  "error_rows",
  "ride_along_possible",
  "revenue_reconciliation",
  "requires_human_review",
];

function isManuallyEditedRow(record: FmEmployeeScheduleStagingRecord): boolean {
  return (
    (record.manualEditHistory ?? []).some((e) => !e.revertedAt) ||
    record.lastManualEditAt != null ||
    record.infoFlags.includes("VEHICLE_FILLED_MANUAL")
  );
}

export function countManualEditedRows(
  records: FmEmployeeScheduleStagingRecord[],
): number {
  return records.filter(isManuallyEditedRow).length;
}

export function countJointManualDecisionRows(
  records: FmEmployeeScheduleStagingRecord[],
): number {
  return records.filter((r) => {
    if (r.jointOperationReviewDecision == null) return false;
    return (
      (r.manualEditHistory ?? []).some(
        (e) =>
          !e.revertedAt &&
          (e.field === "joint_operation" || e.field === "joint_partner"),
      ) || (r.reviewDecisions ?? []).length > 0
    );
  }).length;
}

export function countManualVehicleFillRows(
  records: FmEmployeeScheduleStagingRecord[],
): number {
  return records.filter((r) =>
    r.infoFlags.includes("VEHICLE_FILLED_MANUAL"),
  ).length;
}
