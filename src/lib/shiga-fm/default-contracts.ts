import { buildDefaultPaymentContractDrafts } from "./contract-migrate";
import type { PartnerPaymentContractDraft } from "./partner-payment-types";

/** @deprecated buildDefaultPaymentContractDrafts を使用 */
export function buildDefaultPartnerContractDrafts(): ReturnType<
  typeof buildDefaultPaymentContractDrafts
> {
  return buildDefaultPaymentContractDrafts();
}
