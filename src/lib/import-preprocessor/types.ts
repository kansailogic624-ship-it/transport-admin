/**
 * データ前処理の共通型（schemaVersion 1.0）
 * Firestore には保存せず、JSON/CSV 出力用の安定スキーマ。
 */

import type { TripCrewMember } from "@/lib/types";
import type {
  FmEmployeeDaySummary,
  FmEmployeeScheduleStagingRecord,
  FmOperationSummary,
  FmReviewDecisionRule,
  FmScheduleAmountTotals,
} from "./fm-employee-schedule/types";

export const PREPROCESS_SCHEMA_VERSION = "1.0" as const;

export type PreprocessSourceType =
  | "amazon"
  | "driving_report"
  | "roll_call"
  | "filemaker_dispatch"
  | "filemaker_employee_schedule"
  | "vehicle_expense"
  | "fuel"
  | "toll"
  | "other";

export type PreprocessIssue = {
  code: string;
  message: string;
  sourceRowNumber?: number;
  recordId?: string;
};

/** 自社 / 傭車 / 判定不明 */
export type PreprocessOperationType = "own" | "partner" | "unknown";

/** 警告の確認状態（メモリ上のみ） */
export type PreprocessWarningStatus =
  | "pending"
  | "confirmed_duplicate"
  | "confirmed_valid"
  | "ignored";

export type PreprocessWarningStatusSummary = {
  pending: number;
  confirmedDuplicate: number;
  confirmedValid: number;
  ignored: number;
};

export type PreprocessedRecord = {
  id: string;
  sourceType: PreprocessSourceType;
  sourceFileName: string;
  sourceRowNumber: number;
  businessDate: string;
  driverNameOriginal: string;
  driverNameNormalized: string;
  vehicleNoOriginal: string;
  vehicleNoNormalized: string;
  shipperNameOriginal: string;
  shipperNameNormalized: string;
  jobNameOriginal: string;
  jobNameNormalized: string;
  routeNameOriginal: string;
  routeNameNormalized: string;
  companyOriginal: string;
  companyNormalized: string;
  operationType: PreprocessOperationType;
  /** 互換用（= salesAmount） */
  amount: number;
  /** @deprecated cost は paymentAmount と同義 */
  cost: number;
  salesAmount: number;
  paymentAmount: number;
  /** @deprecated differenceAmount は excelDifferenceAmount と同義 */
  differenceAmount: number;
  /** Excel の差異列 */
  excelDifferenceAmount: number;
  /** 粗利（自社: 売上-人件費 / 傭車: 売上-支払） */
  calculatedGrossProfitAmount: number;
  laborCostAmount: number;
  workStartTime: string;
  workEndTime: string;
  /** FM配車: 一意キー（日付×ドライバー×車両×荷主×業務×売上×時刻等） */
  sourceDispatchKey?: string;
  /** FM配車: 運行開始時刻 */
  startTime?: string;
  /** FM配車: 運行終了時刻 */
  endTime?: string;
  /** FM配車: 高速代（円） */
  tollFeeAmount?: number;
  /** FM配車: 乗務員リスト */
  crewMembers?: TripCrewMember[];
  /** FM配車: 主運転手 */
  mainDriverName?: string;
  /** FM配車: 助手名 */
  assistantDriverNames?: string[];
  /** FM配車: 傭車会社名 */
  partnerName?: string;
  /** FM配車: タイムカード出勤 */
  timecardIn?: string;
  /** FM配車: タイムカード退勤 */
  timecardOut?: string;
  /** FM配車: 休日ステータス（公休・有給） */
  dayStatus?: "公休" | "有給";
  warnings: string[];
  errors: string[];
  /** 警告の確認状態（デフォルト: pending） */
  warningStatus: PreprocessWarningStatus;
  isManuallyEdited: boolean;
  /** 元データ（デバッグ・再処理用） */
  raw: Record<string, unknown>;
};

export const OPERATION_TYPE_LABELS: Record<PreprocessOperationType, string> = {
  own: "自社",
  partner: "傭車",
  unknown: "判定不明",
};

/** Amazon 金額集計ブロック */
export type AmazonAmountTotals = {
  sales: number;
  payment: number;
  /** Excel 差異列の合計 */
  difference: number;
  /** 粗利合計（区分別計算式） */
  grossProfit: number;
  laborCost: number;
  count: number;
  ownCount: number;
  partnerCount: number;
  unknownCount: number;
};

/** Excel 上部の合計行（読み取り結果） */
export type AmazonExcelHeaderTotals = {
  sales: number | null;
  payment: number | null;
  difference: number | null;
  laborCost: number | null;
  found: boolean;
};

export type AmazonTotalsComparison = {
  excel: AmazonExcelHeaderTotals;
  imported: AmazonAmountTotals;
  byOperation: {
    all: AmazonAmountTotals;
    own: AmazonAmountTotals;
    partner: AmazonAmountTotals;
  };
  matches: {
    sales: boolean | null;
    payment: boolean | null;
    difference: boolean | null;
    laborCost: boolean | null;
    allMatch: boolean | null;
  };
};

export type PreprocessWarningDetailRow = {
  recordId: string;
  sourceRowNumber: number;
  businessDate: string;
  driverName: string;
  companyName: string;
  routeName: string;
  salesAmount: number;
  warningReason: string;
  warningStatus: PreprocessWarningStatus;
};

export type PreprocessResult = {
  sourceType: PreprocessSourceType;
  sourceFileName: string;
  totalRows: number;
  successRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  records: PreprocessedRecord[];
  warnings: PreprocessIssue[];
  errors: PreprocessIssue[];
  createdAt: string;
  /** Amazon 専用: Excel 上部合計（再集計時に参照） */
  amazonExcelHeaderTotals?: AmazonExcelHeaderTotals;
  /** Amazon 専用: 金額集計・Excel照合 */
  amazonTotals?: AmazonTotalsComparison;
  /** 警告行の詳細（1行×1理由） */
  warningDetails?: PreprocessWarningDetailRow[];
  /** 警告確認状態の内訳 */
  warningStatusSummary?: PreprocessWarningStatusSummary;
  /** FM配車専用: 金額・区分集計 */
  fmTotals?: FmDispatchAmountTotals;
  /** FM社員スケジュール専用: Staging 行 */
  fmScheduleRecords?: FmEmployeeScheduleStagingRecord[];
  /** FM社員スケジュール専用: 社員日サマリー */
  fmEmployeeDaySummaries?: FmEmployeeDaySummary[];
  /** FM社員スケジュール専用: 運行単位サマリー */
  fmOperationSummaries?: FmOperationSummary[];
  /** FM社員スケジュール専用: 集計 */
  fmScheduleTotals?: FmScheduleAmountTotals;
  /** FM社員スケジュール専用: 共同作業判断ルール（メモリ / localStorage） */
  fmReviewDecisionRules?: FmReviewDecisionRule[];
  /** FM社員スケジュール専用: セッション内の判断変更履歴 */
  fmReviewDecisionHistory?: import("./fm-employee-schedule/record-snapshot").FmReviewDecisionHistoryEntry[];
};

/** FM配車 金額・区分集計 */
export type FmDispatchAmountTotals = {
  sales: number;
  tollFee: number;
  count: number;
  ownCount: number;
  partnerCount: number;
  unknownCount: number;
};

export type PreprocessExportJson = {
  schemaVersion: typeof PREPROCESS_SCHEMA_VERSION;
  sourceType: PreprocessSourceType;
  sourceFileName: string;
  createdAt: string;
  summary: {
    totalRows: number;
    successRows: number;
    warningRows: number;
    errorRows: number;
    duplicateRows: number;
    warningStatusSummary?: PreprocessWarningStatusSummary;
    fmScheduleTotals?: FmScheduleAmountTotals;
  };
  records: PreprocessedRecord[];
  fmScheduleRecords?: FmEmployeeScheduleStagingRecord[];
  fmEmployeeDaySummaries?: FmEmployeeDaySummary[];
  fmOperationSummaries?: FmOperationSummary[];
  warnings: PreprocessIssue[];
  errors: PreprocessIssue[];
};

export type PreprocessNormalizeContext = {
  driverMasterNames?: string[];
  vehicleMasterNumbers?: string[];
  shipperMasterNames?: string[];
};

export const PREPROCESS_SOURCE_LABELS: Record<PreprocessSourceType, string> = {
  amazon: "Amazon実績",
  driving_report: "運転日報",
  roll_call: "点呼記録簿",
  filemaker_dispatch: "FM配車",
  filemaker_employee_schedule: "FM社員スケジュール",
  vehicle_expense: "車両経費",
  fuel: "燃料費",
  toll: "高速代",
  other: "その他",
};
