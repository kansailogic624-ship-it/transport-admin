import { SHIGA_FM_BILLING_PARTY } from "../../src/lib/import-preprocessor/shiga-fm-reconciliation/cost-classifier";
import { buildDefaultShipperBillingDraft } from "../../src/lib/shiga-fm/contract-migrate";
import { buildDefaultPartnerContractDrafts } from "../../src/lib/shiga-fm/default-contracts";
import type { PartnerPaymentContract } from "../../src/lib/shiga-fm/partner-payment-types";
import type { ShipperBillingContract } from "../../src/lib/shiga-fm/shipper-billing-types";

/** 滋賀FM突合テスト用の荷主ID（請求契約解決に使用） */
export const TEST_BILLING_SHIPPER_ID = "test-billing-shipper";

export function buildTestPaymentContracts(): PartnerPaymentContract[] {
  const now = new Date().toISOString();
  return buildDefaultPartnerContractDrafts().map((draft, index) => ({
    id: `test-contract-${index}`,
    ...draft,
    createdAt: now,
    updatedAt: now,
  }));
}

export function buildTestBillingContracts(): ShipperBillingContract[] {
  const now = new Date().toISOString();
  return [
    {
      id: "test-billing-default",
      ...buildDefaultShipperBillingDraft(
        TEST_BILLING_SHIPPER_ID,
        SHIGA_FM_BILLING_PARTY,
      ),
      createdAt: now,
      updatedAt: now,
    },
  ];
}
