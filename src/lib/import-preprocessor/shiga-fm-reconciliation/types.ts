import type { FmEmployeeScheduleStagingRecord } from "../fm-employee-schedule/types";
import type {
  ShigaDeliveryCourseId,
  ShigaDeliveryStagingRecord,
} from "../shiga-delivery/types";
import type { ReconcileIssue } from "@/lib/reconcile-core/types";
import type { ShigaFmCostCategory } from "./cost-classifier";

export type ShigaFmInputMode = "both" | "shiga_only" | "fm_only";

export type ShigaFmFileStatus = {
  shigaLoaded: boolean;
  fmLoaded: boolean;
  shigaFileName: string | null;
  fmFileName: string | null;
};

export type ShigaFmShigaPreview = {
  dayCount: number;
  rowCount: number;
  payTotal: number;
  courseCounts: Record<string, number>;
};

export type ShigaFmFmPreview = {
  rowCount: number;
  salesTotal: number;
  employeeCount: number;
  dayCount: number;
};

export type ShigaFmMatchStatus =
  | "matched"
  | "matched_sum"
  | "shiga_only"
  | "fm_only"
  | "amount_mismatch"
  | "mapping_failed"
  | "unregistered"
  | "fm_shortage";

export const SHIGA_FM_MATCH_STATUS_LABELS: Record<ShigaFmMatchStatus, string> = {
  matched: "一致",
  matched_sum: "合算一致",
  shiga_only: "滋賀のみ",
  fm_only: "FMのみ",
  amount_mismatch: "金額不一致",
  mapping_failed: "マップ失敗",
  unregistered: "未登録",
  fm_shortage: "FM不足",
};

export type ShigaFmMatchedFmRow = {
  recordId: string;
  sourceRowNumber: number;
  jobNameOriginal: string;
  shipperNameOriginal: string;
  employeeNameOriginal: string;
  vehicleNumber: string;
  revenueAmount: number;
};

export type ShigaFmReconciliationRow = {
  id: string;
  matchKey: string;
  businessDate: string;
  courseId: ShigaDeliveryCourseId | null;
  courseName: string | null;
  vendorCode: string;
  vendorName: string;

  /** スロット一意キー（Firestore保存用） */
  slotKey: string;
  /** 適用中の手入力ID */
  assignmentId: string | null;

  /** 1始まりのスロット番号 */
  slotIndex: number;
  unitCount: number;
  jobName: string;

  status: ShigaFmMatchStatus;
  costCategory: ShigaFmCostCategory;
  billingParty: string;
  paymentParty: string;
  contractTypeLabel: string | null;
  contractId: string | null;
  /** 支払契約ID（再突合時のみ更新） */
  paymentContractId: string | null;
  /** 請求契約ID（再突合時のみ更新） */
  billingContractId: string | null;
  paymentContractLabel: string | null;
  billingContractLabel: string | null;
  billingPartyId: string | null;
  paymentPartyId: string | null;
  businessMonth: string;

  /** 請求額（売上） */
  salesAmount: number;
  /** 支払原価 */
  paymentAmount: number;
  grossProfitAmount: number;
  grossProfitRate: number | null;
  notes: string[];

  shigaRecord: ShigaDeliveryStagingRecord | null;
  fmRecords: ShigaFmMatchedFmRow[];
  fmJobNames: string[];

  mismatchReasons: string[];
  matchNotes: string[];
  /**
   * 派生フィールド: status + mismatchReasons から生成。
   * Firestore には保存しない。読込・突合後に enrich で付与。
   */
  reconcileIssues?: ReconcileIssue[];
};

export type ShigaFmCourseProfitSummary = {
  courseId: ShigaDeliveryCourseId;
  courseName: string;
  count: number;
  salesTotal: number;
  paymentTotal: number;
  grossProfitTotal: number;
  grossProfitRate: number | null;
};

export type ShigaFmReconciliationTotals = {
  matchedCount: number;
  matchedSumCount: number;
  shigaOnlyCount: number;
  fmOnlyCount: number;
  amountMismatchCount: number;
  mappingFailedCount: number;
  unregisteredCount: number;
  fmShortageCount: number;
  totalSales: number;
  totalPayment: number;
  totalGrossProfit: number;
  grossProfitRate: number | null;
  employeeProfitTotal: number;
  partnerProfitTotal: number;
  partTimeProfitTotal: number;
  grossProfitAvailable: boolean;
  unreconciledCount: number;
  courseSummaries: ShigaFmCourseProfitSummary[];
};

export type ShigaFmReconcileDiagnostics = {
  employeeCount: number;
  partnerCount: number;
  unregisteredCount: number;
  fmShortageCount: number;
  excludedTotalRowCount: number;
};

export type ShigaFmReconciliationResult = {
  createdAt: string;
  inputMode: ShigaFmInputMode;
  fileStatus: ShigaFmFileStatus;
  shigaFileName: string | null;
  fmFileName: string | null;
  monthPeriod: string | null;
  rows: ShigaFmReconciliationRow[];
  totals: ShigaFmReconciliationTotals;
  diagnostics?: ShigaFmReconcileDiagnostics;
  warnings: string[];
  notices: string[];
  shigaPreview?: ShigaFmShigaPreview;
  fmPreview?: ShigaFmFmPreview;
};

export type FmRowForReconciliation = FmEmployeeScheduleStagingRecord;
