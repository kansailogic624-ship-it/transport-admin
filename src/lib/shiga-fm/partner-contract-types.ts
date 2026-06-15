export type {
  PartnerPaymentContract,
  PartnerPaymentContractDraft,
  PartnerPaymentCalcInput,
  PartnerPaymentCalcResult,
  TollBillingMethod,
} from "./partner-payment-types";

export {
  TOLL_BILLING_METHOD_LABELS,
  COURSE_DEFAULT_CONTRACT_LABEL,
} from "./partner-payment-types";

/** 後方互換エイリアス */
export type { PartnerPaymentContract as PartnerContractRate } from "./partner-payment-types";
export type { PartnerPaymentContractDraft as PartnerContractDraft } from "./partner-payment-types";
export type { PartnerPaymentCalcInput as PartnerContractCalcInput } from "./partner-payment-types";

import type { SlotAmountCalcResult } from "./shipper-billing-types";

/** 後方互換: 旧一体計算結果型 */
export type PartnerContractCalcResult = SlotAmountCalcResult;

/** 移行期間のみ: 旧 partner_contract_rates ドキュメント */
export type LegacyPartnerContractRate = {
  id: string;
  partnerId: string | null;
  vendorName: string;
  courseId: import("@/lib/import-preprocessor/shiga-delivery/types").ShigaDeliveryCourseId;
  courseName: string;
  isCourseDefault: boolean;
  baseUnitPrice: number;
  overtimeUnitPrice: number;
  tollBillingMethod: import("./partner-payment-types").TollBillingMethod;
  invoiceRate?: number;
  tollInvoiceRate?: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  activeFlag: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};
