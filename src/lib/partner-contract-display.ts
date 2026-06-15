import { formatYen } from "@/lib/currency-format";
import {
  TOLL_BILLING_METHOD_LABELS,
  type PartnerPaymentContract,
} from "@/lib/shiga-fm/partner-payment-types";

export type PartnerPaymentContractSummary = {
  hasContract: boolean;
  statusLabel: string;
  statusTone: "ok" | "warn" | "muted";
  baseUnitPrice: number | null;
  overtimeUnitPrice: number | null;
  tollLabel: string | null;
  effectiveFrom: string | null;
  lastUpdatedAt: string | null;
  contract: PartnerPaymentContract | null;
};

/** @deprecated PartnerPaymentContractSummary */
export type PartnerContractSummary = PartnerPaymentContractSummary;

export function summarizePartnerPaymentContracts(
  contracts: PartnerPaymentContract[],
  partnerId: string,
  today = new Date().toISOString().slice(0, 10),
): PartnerPaymentContractSummary {
  const partnerContracts = contracts.filter(
    (c) => c.partnerId === partnerId && c.activeFlag && !c.isCourseDefault,
  );
  if (partnerContracts.length === 0) {
    return {
      hasContract: false,
      statusLabel: "支払契約未登録",
      statusTone: "warn",
      baseUnitPrice: null,
      overtimeUnitPrice: null,
      tollLabel: null,
      effectiveFrom: null,
      lastUpdatedAt: null,
      contract: null,
    };
  }

  const current = partnerContracts
    .filter(
      (c) =>
        c.effectiveFrom <= today &&
        (c.effectiveTo == null || c.effectiveTo >= today),
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

  const latest = current ?? partnerContracts[0]!;

  return {
    hasContract: true,
    statusLabel: current ? "有効" : "期限外",
    statusTone: current ? "ok" : "muted",
    baseUnitPrice: latest.baseUnitPrice,
    overtimeUnitPrice: latest.overtimeUnitPrice,
    tollLabel: TOLL_BILLING_METHOD_LABELS[latest.tollBillingMethod],
    effectiveFrom: latest.effectiveFrom,
    lastUpdatedAt: latest.updatedAt,
    contract: latest,
  };
}

/** @deprecated summarizePartnerPaymentContracts を使用 */
export function summarizePartnerContracts(
  contracts: PartnerPaymentContract[],
  partnerId: string,
  today?: string,
): PartnerPaymentContractSummary {
  return summarizePartnerPaymentContracts(contracts, partnerId, today);
}

export function formatEffectivePeriod(contract: PartnerPaymentContract): string {
  const to = contract.effectiveTo ?? "現行";
  return `${contract.effectiveFrom} 〜 ${to}`;
}

export function formatContractAmounts(summary: PartnerPaymentContractSummary): string {
  if (!summary.hasContract || summary.baseUnitPrice == null) return "—";
  return `基本 ${formatYen(summary.baseUnitPrice)} / 残業 ${formatYen(summary.overtimeUnitPrice ?? 0)}/h`;
}
