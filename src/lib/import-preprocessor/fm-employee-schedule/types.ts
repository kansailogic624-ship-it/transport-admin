import type { AliasResolveStatus } from "@/lib/alias-engine";

export const FM_EMPLOYEE_SCHEDULE_SCHEMA_VERSION = "1.0" as const;

export type FmScheduleWarningCode =
  | "UNRESOLVED_EMPLOYEE"
  | "UNRESOLVED_SHIPPER"
  | "UNRESOLVED_JOB"
  | "UNRESOLVED_VEHICLE"
  | "MISSING_BUSINESS_DATE"
  | "MISSING_REVENUE"
  | "ATTENDANCE_ROW"
  | "HOLIDAY_ROW"
  | "DUPLICATE_EMPLOYEE_JOB_KEY"
  | "INCONSISTENT_TIMECARD"
  | "NIGHT_SHIFT_CROSSOVER"
  | "MULTIPLE_VEHICLES_SAME_DAY"
  | "REVENUE_WITHOUT_VEHICLE"
  | "AMBIGUOUS_ALIAS_EMPLOYEE"
  | "AMBIGUOUS_ALIAS_SHIPPER"
  | "AMBIGUOUS_ALIAS_JOB"
  | "AMBIGUOUS_ALIAS_VEHICLE"
  | "JOINT_OPERATION_REVENUE_DUPLICATE"
  | "JOINT_OPERATION_REVENUE_CONFLICT"
  | "JOINT_OPERATION_MISSING_VEHICLE"
  | "JOINT_OPERATION_AMBIGUOUS"
  | "POSSIBLE_RIDE_ALONG_TRAINING"
  | "REQUIRES_HUMAN_REVIEW"
  | "INACTIVE_EMPLOYEE_ON_REVENUE_ROW"
  | "EXTERNAL_PARTNER_UNAPPROVED";

/** 将来の人手確認後分類（MVP では未設定） */
export type FmOperationHumanReviewCategory =
  | "joint_two_man"
  | "ride_along_training"
  | "duplicate_input"
  | "ignore"
  | null;

export type FmReviewDecisionType =
  | "joint_operation"
  | "separate_operations"
  | "ride_along_training"
  | "needs_review";

export type FmReviewDecisionScope =
  | "this_row_only"
  | "this_date_only"
  | "same_shipper_job"
  | "same_shipper_job_vehicle_pattern";

export type FmReviewDecisionRule = {
  id: string;
  sourceType: "filemaker_employee_schedule";
  decisionKey: string;
  decisionType: FmReviewDecisionType;
  scope: FmReviewDecisionScope;
  shipperCanonical: string;
  jobCanonical: string;
  businessDate?: string;
  recordIds?: string[];
  createdAt: string;
  note?: string;
};

export type FmScheduleInfoCode =
  | "VEHICLE_FILLED_FROM_EMPLOYEE_DAY"
  | "VEHICLE_FILLED_FROM_JOINT_JOB"
  | "VEHICLE_FILLED_MANUAL"
  | "JOINT_OPERATION_DETECTED"
  | "NOTE_RIDE_ALONG_PARTNER_DETECTED"
  | "EXTERNAL_PARTNER_LABEL"
  | "INACTIVE_EMPLOYEE_ATTENDANCE_ONLY"
  | "ATTENDANCE_ROW_INFO"
  | "HOLIDAY_ROW_INFO";

export const FM_SCHEDULE_INFO_LABELS: Record<FmScheduleInfoCode, string> = {
  VEHICLE_FILLED_FROM_EMPLOYEE_DAY: "車両補完済み（社員日）",
  VEHICLE_FILLED_FROM_JOINT_JOB: "車両補完済み（共同作業）",
  VEHICLE_FILLED_MANUAL: "車両補完済み（手動）",
  JOINT_OPERATION_DETECTED: "2マン作業（共同乗務）を検出",
  NOTE_RIDE_ALONG_PARTNER_DETECTED: "備考欄から2マン作業を検出",
  EXTERNAL_PARTNER_LABEL: "外注ラベル",
  INACTIVE_EMPLOYEE_ATTENDANCE_ONLY: "退職者休み行",
  ATTENDANCE_ROW_INFO: "勤怠行",
  HOLIDAY_ROW_INFO: "休み・有給行",
};

export type FmJointOperationMemberKind = "employee" | "part_time" | "external";

export type FmJointOperationMember = {
  employeeCanonicalId: string | null;
  employeeNameCanonical: string | null;
  employeeNameOriginal: string;
  revenueAmount: number;
  vehicleNumberOriginal: string;
  vehicleNumberFilled: string | null;
  vehicleNumberCanonical: string | null;
  /** 表示用（アルバイト等）。未設定時は employeeNameCanonical ?? employeeNameOriginal */
  displayLabel?: string;
  memberKind?: FmJointOperationMemberKind;
  /** 備考欄から検出した同乗相手 */
  isNoteDetectedPartner?: boolean;
};

export type FmManualVehicleFill = {
  vehicleValue: string;
  sourceRowNumber: number;
  editedAt: string;
  editedBy: string;
};

export type FmManualEditHistoryField =
  | "vehicle"
  | "joint_operation"
  | "joint_partner";

export type FmVehicleFillRationale = {
  kind: "vehicle_fill";
  sameDay: boolean;
  sameEmployee: boolean;
  sourceRowNumber: number;
  matchScorePercent: number;
  matchScoreLabel: string;
  basisLines: string[];
};

export type FmManualEditHistoryEntry = {
  id: string;
  field: FmManualEditHistoryField;
  fieldLabel: string;
  beforeLabel: string;
  afterLabel: string;
  editedAt: string;
  editedBy: string;
  rationale?: FmVehicleFillRationale;
  revertedAt?: string;
};

/** 警告の人手対応状態 */
export type FmWarningDispositionStatus =
  | "needs_action"
  | "dismissed_ok"
  | "on_hold";

export const FM_WARNING_DISPOSITION_LABELS: Record<
  FmWarningDispositionStatus,
  string
> = {
  needs_action: "要修正",
  dismissed_ok: "問題なし",
  on_hold: "保留",
};

export type FmJointDetectionReasonCode =
  | "same_joint_job"
  | "same_vehicle"
  | "time_overlap"
  | "same_job"
  | "note_detected"
  | "excel_multi_member";

export type FmJointDetectionReason = {
  code: FmJointDetectionReasonCode;
  label: string;
  detail?: string;
};

export const FM_JOINT_DETECTION_REASON_LABELS: Record<
  FmJointDetectionReasonCode,
  string
> = {
  same_joint_job: "同業務（日付・荷主・業務一致）",
  same_vehicle: "同車番",
  time_overlap: "時間重複",
  same_job: "同業務名",
  note_detected: "備考欄検出",
  excel_multi_member: "Excel複数社員行",
};

export const FM_SCHEDULE_WARNING_LABELS: Record<FmScheduleWarningCode, string> = {
  UNRESOLVED_EMPLOYEE: "社員名が未解決",
  UNRESOLVED_SHIPPER: "荷主名が未解決",
  UNRESOLVED_JOB: "業務名が未解決",
  UNRESOLVED_VEHICLE: "車両番号が未解決",
  MISSING_BUSINESS_DATE: "日付が空白",
  MISSING_REVENUE: "実売上が空白",
  ATTENDANCE_ROW: "勤怠用行",
  HOLIDAY_ROW: "休み・有給行",
  DUPLICATE_EMPLOYEE_JOB_KEY: "同一業務キーの重複",
  INCONSISTENT_TIMECARD: "同一社員日で出勤退勤が不一致",
  NIGHT_SHIFT_CROSSOVER: "夜勤跨ぎ（退勤<出勤）",
  MULTIPLE_VEHICLES_SAME_DAY: "同一社員日で複数車両",
  REVENUE_WITHOUT_VEHICLE: "売上ありだが車両番号が空白",
  AMBIGUOUS_ALIAS_EMPLOYEE: "社員名が曖昧一致",
  AMBIGUOUS_ALIAS_SHIPPER: "荷主名が曖昧一致",
  AMBIGUOUS_ALIAS_JOB: "業務名が曖昧一致",
  AMBIGUOUS_ALIAS_VEHICLE: "車両番号が曖昧一致",
  JOINT_OPERATION_REVENUE_DUPLICATE: "2マン同一運行で売上が重複入力",
  JOINT_OPERATION_REVENUE_CONFLICT: "2マン同一運行で売上が不一致",
  JOINT_OPERATION_MISSING_VEHICLE: "2マン運行の車両が未解決",
  JOINT_OPERATION_AMBIGUOUS: "2マン売上の計上方法が判断不能",
  POSSIBLE_RIDE_ALONG_TRAINING: "同乗教育の可能性（同一社員の重複行）",
  REQUIRES_HUMAN_REVIEW: "人手確認が必要",
  INACTIVE_EMPLOYEE_ON_REVENUE_ROW: "退職者が売上行に含まれる",
  EXTERNAL_PARTNER_UNAPPROVED: "外注ラベル未承認",
};

export type FmScheduleMatchStatus =
  | "unmatched"
  | "candidate"
  | "matched"
  | "not_applicable";

export type FmEmployeeScheduleStagingRecord = {
  id: string;
  schemaVersion: typeof FM_EMPLOYEE_SCHEDULE_SCHEMA_VERSION;
  sourceType: "filemaker_employee_schedule";
  sourceFileName: string;
  sourceSheetName: string;
  sourceRowNumber: number;
  businessDate: string;

  employeeNameOriginal: string;
  /** 傭車・外注ラベル（社員列に入った外注名。isPartnerLikeRow 時に設定） */
  partnerNameOriginal: string | null;
  shipperNameOriginal: string;
  jobNameOriginal: string;
  vehicleNumberOriginal: string;
  /** 同一社員日の他行から補完した車両番号（Excel原文。未補完時は null） */
  vehicleNumberFilled: string | null;
  vehicleNumberFilledSource: string | null;
  vehicleNumberFilledReason: string | null;
  /** 補完元の sourceRowNumber */
  vehicleNumberFilledFromRowNumber: number | null;
  /** ユーザー手動補完の記録（再編集可能） */
  manualVehicleFill: FmManualVehicleFill | null;
  /** 手動修正の変更履歴（車番・共同作業など） */
  manualEditHistory: FmManualEditHistoryEntry[];
  /** 保存直前スナップショット（Undo用、最大10件） */
  saveSnapshots?: import("./record-snapshot").FmRecordSaveSnapshot[];
  /** 最終手動修正者 */
  lastManualEditBy: string | null;
  /** 最終手動修正日時 */
  lastManualEditAt: string | null;
  /** 最終手動修正の概要 */
  lastManualEditSummary: string | null;
  personalNote: string;

  employeeNameCanonical: string | null;
  employeeCanonicalId: string | null;
  shipperNameCanonical: string | null;
  shipperCanonicalId: string | null;
  jobNameCanonical: string | null;
  jobCanonicalId: string | null;
  vehicleNumberCanonical: string | null;
  vehicleCanonicalId: string | null;

  aliasStatus: {
    employee: AliasResolveStatus;
    shipper: AliasResolveStatus;
    job: AliasResolveStatus;
    vehicle: AliasResolveStatus;
  };

  revenueAmount: number | null;
  clockInTime: string;
  clockOutTime: string;

  isAttendanceOnlyRow: boolean;
  isHolidayRow: boolean;
  /** 社員列が傭車・外注ラベル（社員別売上・労働時間の対象外） */
  isPartnerLikeRow: boolean;
  /** activeFlag=0 の台帳社員として解決済み */
  resolvedInactiveEmployee: boolean;
  isRevenueRow: boolean;
  dayStatus: "公休" | "有給" | null;

  employeeDayKey: string;
  countsForLaborTime: boolean;
  laborTimeGroupRank: number;
  bindingMinutes: number | null;

  employeeJobKey: string;
  employeeJobKeyProvisional: boolean;

  /** 共同作業キー（日付・荷主・業務。車両・社員・行番号は含まない） */
  jointJobKey: string;
  /** @deprecated jointJobKey と同値。後方互換用 */
  operationKey: string;
  isJointOperation: boolean;
  jointOperationMemberCount: number;
  jointOperationMembers: FmJointOperationMember[];
  /** jointJobKey 単位の会社売上（社員行 revenueAmount の合計） */
  operationRevenueAmount: number | null;
  /** 社員別売上（revenueAmount をそのまま使用。外注行は 0） */
  employeeRevenueShareAmount: number;
  /** @deprecated FM社員スケジュールでは使用しない（常に false） */
  countsForCompanyRevenue: boolean;
  /** 社員按分が確定できず人手確認が必要 */
  requiresHumanReview: boolean;
  /** 将来: 通常2マン / 同乗教育 / 重複入力 / 無視（MVP では null） */
  humanReviewCategory: FmOperationHumanReviewCategory;
  /** ユーザーが確定した共同作業判断（null = 自動判定のみ） */
  jointOperationReviewDecision: FmReviewDecisionType | null;
  /** 確認画面・サマリー用のグループキー（別作業時は employeeJobKey） */
  operationGroupKey: string;

  matchStatus: FmScheduleMatchStatus;

  /** @deprecated currentWarningFlags と同期。表示・集計は currentWarningFlags を優先 */
  warningFlags: FmScheduleWarningCode[];
  /** 取込直後の全警告（監査用・不変） */
  originalWarningFlags: FmScheduleWarningCode[];
  /** 現在未対応の警告 */
  currentWarningFlags: FmScheduleWarningCode[];
  /** ユーザー判断で解消済みの警告（問題なし） */
  resolvedWarningFlags: FmScheduleWarningCode[];
  /** 保留中の警告 */
  onHoldWarningFlags: FmScheduleWarningCode[];
  /** 警告に対する判断履歴 */
  reviewDecisions: import("./warning-tracking").FmWarningReviewDecision[];
  infoFlags: FmScheduleInfoCode[];
  /** 取込直後の判断・警告スナップショット（ユーザー修正前。元に戻す用） */
  originalState?: import("./record-snapshot").FmRecordOriginalState;
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type { FmReviewDecisionHistoryEntry } from "./record-snapshot";

export type FmEmployeeDaySummary = {
  employeeDayKey: string;
  businessDate: string;
  employeeNameCanonical: string | null;
  employeeNameOriginal: string;
  rowCount: number;
  revenueTotal: number;
  clockInTime: string;
  clockOutTime: string;
  bindingMinutes: number | null;
  countsForLaborRowNumber: number | null;
  warningFlags: FmScheduleWarningCode[];
};

export type FmOperationSummary = {
  operationGroupKey: string;
  jointJobKey: string;
  /** @deprecated jointJobKey と同値 */
  operationKey: string;
  businessDate: string;
  shipperNameCanonical: string | null;
  jobNameCanonical: string | null;
  vehicleNumberCanonical: string | null;
  isJointOperation: boolean;
  jointOperationMemberCount: number;
  jointOperationMembers: FmJointOperationMember[];
  operationRevenueAmount: number | null;
  rowCount: number;
  requiresHumanReview: boolean;
  jointOperationReviewDecision: FmReviewDecisionType | null;
  warningFlags: FmScheduleWarningCode[];
  infoFlags: FmScheduleInfoCode[];
};

export type FmScheduleRevenueReconciliation = {
  /** Excel原文の売上合計（isRevenueRow の revenueAmount 合計） */
  excelOriginalTotal: number;
  /** 会社売上合計（= excelOriginalTotal。各行 revenueAmount の合算） */
  companyTotal: number;
  /** 社員別売上合計（外注行を除く employeeRevenueShareAmount 合計） */
  employeeShareTotal: number;
  isBalanced: boolean;
  mismatchReasons: string[];
};

export type FmScheduleAmountTotals = {
  sales: number;
  rowCount: number;
  employeeDayCount: number;
  operationCount: number;
  /** @deprecated jointTwoManCount + jointThreePlusCount を使用 */
  jointOperationCount: number;
  /** isJointOperation && memberCount === 2 の業務単位数 */
  jointTwoManCount: number;
  /** isJointOperation && memberCount >= 3 の業務単位数 */
  jointThreePlusCount: number;
  /** isJointOperation && requiresHumanReview の業務単位数 */
  needsReviewJointCount: number;
  /** 勤怠・休み行（フィルタと同条件） */
  attendanceHolidayRowCount: number;
  /** 要修正（未対応）警告フラグの総件数 */
  pendingWarningCount: number;
  /** 問題なしにした警告フラグの総件数 */
  dismissedWarningCount: number;
  /** 保留中の警告フラグの総件数 */
  onHoldWarningCount: number;
  /** 手動修正履歴を持つ行数 */
  manualEditedRowCount: number;
  /** 共同作業を手動判定した行数 */
  jointManualDecisionRowCount: number;
  /** 車番を手動補完した行数 */
  manualVehicleFillRowCount: number;
  /** 取込時の全警告件数 */
  totalOriginalWarningCount: number;
  /** 修正により消えた警告件数 */
  fixedByEditWarningCount: number;
  /** 解消済み警告件数（問題なし + 修正済み） */
  resolvedWarningCount: number;
  /** 解消率（0–100） */
  warningResolutionRatePercent: number;
  /** 未対応警告を1件以上持つ行数 */
  warningRowCount: number;
  /** requiresHumanReview の行数 */
  needsReviewCount: number;
  /** 未対応 MISSING_BUSINESS_DATE を持つ行数 */
  errorRowCount: number;
  attendanceRowCount: number;
  unresolvedEmployeeCount: number;
  unresolvedVehicleCount: number;
  unresolvedShipperCount: number;
  unresolvedJobCount: number;
  revenueReconciliation: FmScheduleRevenueReconciliation;
};
