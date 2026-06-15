import type {
  ShipperBillingCalcInput,
  ShipperBillingCalcResult,
  ShipperBillingContract,
} from "./shipper-billing-types";

function roundYen(value: number): number {
  return Math.round(value);
}

/** 荷主請求契約に基づく請求額を算出する */
export function calcShipperBillingAmounts(
  contract: ShipperBillingContract,
  input: ShipperBillingCalcInput,
): ShipperBillingCalcResult {
  const basePlusOvertime = Math.max(0, input.basePlusOvertime);
  const tollAmount = Math.max(0, input.tollAmount);

  const freightInvoice = roundYen(
    basePlusOvertime * contract.freightInvoiceRate,
  );
  const tollInvoice = roundYen(tollAmount * contract.tollInvoiceRate);

  return {
    invoiceAmount: freightInvoice + tollInvoice,
    breakdown: {
      freightInvoice,
      tollInvoice,
    },
  };
}
