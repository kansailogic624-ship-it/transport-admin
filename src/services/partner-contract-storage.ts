/**
 * 後方互換ラッパー — 新実装は partner-payment-contract-storage.ts
 */
export {
  loadPartnerPaymentContracts as loadPartnerContractRates,
  savePartnerPaymentContracts as savePartnerContractRates,
  upsertPartnerPaymentContract as upsertPartnerContractRate,
  deletePartnerPaymentContract as deletePartnerContractRate,
  createPartnerPaymentContractId as createPartnerContractId,
  loadPartnerPaymentContracts,
  savePartnerPaymentContracts,
  upsertPartnerPaymentContract,
  deletePartnerPaymentContract,
  createPartnerPaymentContractId,
  loadPartnerPaymentContractsLinked,
} from "./partner-payment-contract-storage";
