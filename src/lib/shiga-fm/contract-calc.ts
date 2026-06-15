import { allocatePerUnitAmounts } from "./contract-calc-allocate";
import type { PartnerPaymentContract } from "./partner-payment-types";
import type { ShipperBillingContract } from "./shipper-billing-types";
import { calcPartnerPaymentAmounts } from "./payment-calc";
import { calcShipperBillingAmounts } from "./billing-calc";
import { calcSlotAmounts } from "./slot-amount-calc";
import type { PartnerPaymentCalcInput } from "./partner-payment-types";
import type { SlotAmountCalcResult } from "./shipper-billing-types";

export { allocatePerUnitAmounts } from "./contract-calc-allocate";
export { calcPartnerPaymentAmounts } from "./payment-calc";
export { calcShipperBillingAmounts } from "./billing-calc";
export {
  calcSlotAmounts,
  formatPaymentContractLabel,
  formatBillingContractLabel,
  businessMonthFromDate,
} from "./slot-amount-calc";

/**
 * 後方互換: 支払+請求を一体計算していた旧API。
 * 請求率は billingContract から取得する。
 */
export function calcContractAmounts(
  paymentContract: PartnerPaymentContract,
  billingContract: ShipperBillingContract,
  input: PartnerPaymentCalcInput,
): SlotAmountCalcResult {
  return calcSlotAmounts(paymentContract, billingContract, input);
}

/** 支払のみ（プレビュー用） */
export function calcPaymentOnly(
  contract: PartnerPaymentContract,
  input: PartnerPaymentCalcInput,
) {
  return calcPartnerPaymentAmounts(contract, input);
}
