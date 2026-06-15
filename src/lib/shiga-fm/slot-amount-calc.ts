import { calcShipperBillingAmounts } from "./billing-calc";
import { calcPartnerPaymentAmounts } from "./payment-calc";
import type { PartnerPaymentContract } from "./partner-payment-types";
import type {
  ShipperBillingContract,
  SlotAmountCalcResult,
} from "./shipper-billing-types";
import type { PartnerPaymentCalcInput } from "./partner-payment-types";

function roundRate(value: number): number | null {
  return value > 0 ? Math.round(value * 10_000) / 100 : null;
}

/** 支払契約 + 請求契約で傭車スロットの金額を算出する */
export function calcSlotAmounts(
  paymentContract: PartnerPaymentContract,
  billingContract: ShipperBillingContract,
  input: PartnerPaymentCalcInput,
): SlotAmountCalcResult {
  const payment = calcPartnerPaymentAmounts(paymentContract, input);
  const basePlusOvertime =
    payment.breakdown.baseUnitPrice + payment.breakdown.overtimeAmount;
  const billing = calcShipperBillingAmounts(billingContract, {
    basePlusOvertime,
    tollAmount: input.tollAmount,
  });

  const grossProfitAmount = billing.invoiceAmount - payment.paymentAmount;

  return {
    paymentAmount: payment.paymentAmount,
    invoiceAmount: billing.invoiceAmount,
    grossProfitAmount,
    grossProfitRate: roundRate(grossProfitAmount / billing.invoiceAmount),
    breakdown: {
      baseUnitPrice: payment.breakdown.baseUnitPrice,
      overtimeAmount: payment.breakdown.overtimeAmount,
      tollPayment: payment.breakdown.tollPayment,
      freightInvoice: billing.breakdown.freightInvoice,
      tollInvoice: billing.breakdown.tollInvoice,
    },
  };
}

export function formatPaymentContractLabel(
  contract: PartnerPaymentContract,
): string {
  const toll =
    contract.tollBillingMethod === "actual_cost"
      ? "高速実費"
      : contract.tollBillingMethod === "included"
        ? "高速込み"
        : "高速なし";
  return `基本${contract.baseUnitPrice.toLocaleString()} / 残業${contract.overtimeUnitPrice.toLocaleString()}/h / ${toll}`;
}

export function formatBillingContractLabel(
  contract: ShipperBillingContract,
): string {
  const freight = Math.round(contract.freightInvoiceRate * 10_000) / 100;
  const toll = Math.round(contract.tollInvoiceRate * 10_000) / 100;
  return `運賃${freight}% / 高速${toll}%`;
}

export function businessMonthFromDate(businessDate: string): string {
  return businessDate.slice(0, 7);
}
