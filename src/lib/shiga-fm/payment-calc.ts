import type {
  PartnerPaymentCalcInput,
  PartnerPaymentCalcResult,
  PartnerPaymentContract,
} from "./partner-payment-types";

function roundYen(value: number): number {
  return Math.round(value);
}

/** 協力会社支払契約に基づく支払額を算出する */
export function calcPartnerPaymentAmounts(
  contract: PartnerPaymentContract,
  input: PartnerPaymentCalcInput,
): PartnerPaymentCalcResult {
  const overtimeHours = Math.max(0, input.overtimeHours);
  const tollAmount = Math.max(0, input.tollAmount);
  const overtimeAmount = roundYen(contract.overtimeUnitPrice * overtimeHours);
  const basePlusOvertime = contract.baseUnitPrice + overtimeAmount;

  let tollPayment = 0;
  if (contract.tollBillingMethod === "actual_cost") {
    tollPayment = roundYen(tollAmount);
  }

  return {
    paymentAmount: basePlusOvertime + tollPayment,
    breakdown: {
      baseUnitPrice: contract.baseUnitPrice,
      overtimeAmount,
      tollPayment,
    },
  };
}
