import type { FmEmployeeScheduleStagingRecord, FmScheduleWarningCode } from "./types";
import { FM_SCHEDULE_WARNING_LABELS } from "./types";
import {
  getActionableWarnings,
  getDismissedWarnings,
  getOnHoldWarnings,
  isAttendanceHolidayRow,
} from "./warning-tracking";

export type FmScheduleViewFilter =
  | "all"
  | "has_warnings"
  | "unresolved_any"
  | "unresolved_employee"
  | "unresolved_vehicle"
  | "unresolved_shipper"
  | "unresolved_job"
  | "joint_two_man"
  | "joint_three_plus"
  | "needs_review_joint"
  | "ride_along_possible"
  | "vehicle_filled"
  | "external_partner"
  | "attendance_holiday"
  | "revenue_reconciliation"
  | "requires_human_review"
  | "error_rows"
  | "manual_edited"
  | "joint_manual_decision"
  | "manual_vehicle_fill"
  | "warnings_dismissed"
  | "warnings_on_hold";

export const FM_SCHEDULE_FILTER_LABELS: Record<FmScheduleViewFilter, string> = {
  all: "全件",
  has_warnings: "警告あり",
  unresolved_any: "未解決あり",
  unresolved_employee: "未解決社員",
  unresolved_vehicle: "未解決車両",
  unresolved_shipper: "未解決荷主",
  unresolved_job: "未解決業務",
  joint_two_man: "2マン作業",
  joint_three_plus: "3名以上作業",
  needs_review_joint: "要確認",
  ride_along_possible: "同乗教育の可能性",
  vehicle_filled: "車両補完あり",
  external_partner: "外注ラベル",
  attendance_holiday: "勤怠・休み行",
  revenue_reconciliation: "売上検算関連",
  requires_human_review: "人間確認が必要",
  error_rows: "エラーあり",
  manual_edited: "手動修正済み",
  joint_manual_decision: "共同作業手動判定",
  manual_vehicle_fill: "車番手動補完",
  warnings_dismissed: "問題なし警告あり",
  warnings_on_hold: "保留警告あり",
};

export function getFmFilterDisplayLabel(
  filter: FmScheduleViewFilter,
  warningFlag?: FmScheduleWarningCode,
): string {
  if (warningFlag) {
    return `警告: ${FM_SCHEDULE_WARNING_LABELS[warningFlag]}`;
  }
  if (filter === "attendance_holiday") return "勤怠・休み行のみ";
  return FM_SCHEDULE_FILTER_LABELS[filter];
}

export function matchesWarningFlagFilter(
  record: FmEmployeeScheduleStagingRecord,
  flag: FmScheduleWarningCode,
): boolean {
  return getActionableWarnings(record).includes(flag);
}

export type FmScheduleFilterContext = {
  reconciliationBalanced?: boolean;
  /** 警告タグクリックで絞り込む対象 */
  warningFlag?: FmScheduleWarningCode;
};

function hasUnresolvedAlias(record: FmEmployeeScheduleStagingRecord): boolean {
  return getActionableWarnings(record).some((f) => f.startsWith("UNRESOLVED_"));
}

export function matchesFmScheduleFilter(
  record: FmEmployeeScheduleStagingRecord,
  filter: FmScheduleViewFilter,
  context?: FmScheduleFilterContext,
): boolean {
  if (context?.warningFlag && !matchesWarningFlagFilter(record, context.warningFlag)) {
    return false;
  }

  if (filter === "all") return true;

  const actionable = getActionableWarnings(record);

  switch (filter) {
    case "has_warnings":
      return actionable.length > 0;
    case "unresolved_any":
      return hasUnresolvedAlias(record);
    case "unresolved_employee":
      return actionable.includes("UNRESOLVED_EMPLOYEE");
    case "unresolved_vehicle":
      return actionable.includes("UNRESOLVED_VEHICLE");
    case "unresolved_shipper":
      return actionable.includes("UNRESOLVED_SHIPPER");
    case "unresolved_job":
      return actionable.includes("UNRESOLVED_JOB");
    case "joint_two_man":
      return record.isJointOperation && record.jointOperationMemberCount === 2;
    case "joint_three_plus":
      return record.isJointOperation && record.jointOperationMemberCount >= 3;
    case "needs_review_joint":
      return record.isJointOperation && record.requiresHumanReview;
    case "ride_along_possible":
      return actionable.includes("POSSIBLE_RIDE_ALONG_TRAINING");
    case "vehicle_filled":
      return (
        record.infoFlags.includes("VEHICLE_FILLED_FROM_EMPLOYEE_DAY") ||
        record.infoFlags.includes("VEHICLE_FILLED_FROM_JOINT_JOB") ||
        record.infoFlags.includes("VEHICLE_FILLED_MANUAL")
      );
    case "external_partner":
      return record.isPartnerLikeRow;
    case "attendance_holiday":
      return isAttendanceHolidayRow(record);
    case "revenue_reconciliation":
      return record.isRevenueRow && !record.isAttendanceOnlyRow;
    case "requires_human_review":
      return record.requiresHumanReview;
    case "error_rows":
      return actionable.includes("MISSING_BUSINESS_DATE");
    case "manual_edited":
      return (
        (record.manualEditHistory ?? []).some((e) => !e.revertedAt) ||
        record.lastManualEditAt != null ||
        record.infoFlags.includes("VEHICLE_FILLED_MANUAL")
      );
    case "joint_manual_decision":
      return (
        record.jointOperationReviewDecision != null &&
        ((record.manualEditHistory ?? []).some(
          (e) =>
            !e.revertedAt &&
            (e.field === "joint_operation" || e.field === "joint_partner"),
        ) ||
          (record.reviewDecisions ?? []).length > 0)
      );
    case "manual_vehicle_fill":
      return record.infoFlags.includes("VEHICLE_FILLED_MANUAL");
    case "warnings_dismissed":
      return getDismissedWarnings(record).length > 0;
    case "warnings_on_hold":
      return getOnHoldWarnings(record).length > 0;
    default:
      return true;
  }
}

export function filterFmScheduleRecords(
  records: FmEmployeeScheduleStagingRecord[],
  filter: FmScheduleViewFilter,
  context?: FmScheduleFilterContext,
): FmEmployeeScheduleStagingRecord[] {
  if (filter === "all" && !context?.warningFlag) return records;
  return records.filter((r) => matchesFmScheduleFilter(r, filter, context));
}

export function operationSummaryMatchesFilter(
  op: {
    isJointOperation: boolean;
    jointOperationMemberCount: number;
    requiresHumanReview: boolean;
  },
  rows: FmEmployeeScheduleStagingRecord[],
  filter: FmScheduleViewFilter,
  context?: FmScheduleFilterContext,
): boolean {
  if (filter === "all") return true;
  if (filter === "attendance_holiday") return false;
  if (rows.some((r) => matchesFmScheduleFilter(r, filter, context))) {
    return true;
  }
  if (
    filter === "joint_two_man" &&
    op.isJointOperation &&
    op.jointOperationMemberCount === 2
  ) {
    return true;
  }
  if (
    filter === "joint_three_plus" &&
    op.isJointOperation &&
    op.jointOperationMemberCount >= 3
  ) {
    return true;
  }
  if (filter === "needs_review_joint" && op.isJointOperation && op.requiresHumanReview) {
    return true;
  }
  if (filter === "requires_human_review" && op.requiresHumanReview) return true;
  return false;
}

export function daySummaryMatchesFilter(
  rows: FmEmployeeScheduleStagingRecord[],
  filter: FmScheduleViewFilter,
  context?: FmScheduleFilterContext,
): boolean {
  if (filter === "all") return true;
  return rows.some((r) => matchesFmScheduleFilter(r, filter, context));
}
