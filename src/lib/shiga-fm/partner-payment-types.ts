import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";

/** 高速代の請求方法（支払側） */
export type TollBillingMethod = "actual_cost" | "included" | "none";

export const TOLL_BILLING_METHOD_LABELS: Record<TollBillingMethod, string> = {
  actual_cost: "実費",
  included: "運賃込み",
  none: "なし",
};

/** 協力会社支払契約 */
export type PartnerPaymentContract = {
  id: string;
  partnerId: string | null;
  partnerName: string;
  courseId: ShigaDeliveryCourseId;
  courseName: string;
  /** コース別デフォルト単価（④以降入力補助用） */
  isCourseDefault: boolean;
  /** 将来の業務別単価用（今回未使用） */
  jobId?: string | null;
  jobName?: string | null;
  baseUnitPrice: number;
  overtimeUnitPrice: number;
  tollBillingMethod: TollBillingMethod;
  effectiveFrom: string;
  effectiveTo: string | null;
  activeFlag: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerPaymentContractDraft = Omit<
  PartnerPaymentContract,
  "id" | "createdAt" | "updatedAt"
>;

export const COURSE_DEFAULT_CONTRACT_LABEL = "コース別デフォルト単価";

export type PartnerPaymentCalcInput = {
  overtimeHours: number;
  tollAmount: number;
};

export type PartnerPaymentCalcResult = {
  paymentAmount: number;
  breakdown: {
    baseUnitPrice: number;
    overtimeAmount: number;
    tollPayment: number;
  };
};
