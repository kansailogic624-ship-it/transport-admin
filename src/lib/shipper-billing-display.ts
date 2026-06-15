import { formatYen } from "@/lib/currency-format";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";

export type ShipperBillingContractSummary = {
  hasContract: boolean;
  statusLabel: string;
  statusTone: "ok" | "warn" | "muted";
  freightInvoiceRatePercent: number | null;
  tollInvoiceRatePercent: number | null;
  effectiveFrom: string | null;
  lastUpdatedAt: string | null;
  contract: ShipperBillingContract | null;
};

export function summarizeShipperBillingContracts(
  contracts: ShipperBillingContract[],
  shipperId: string,
  today = new Date().toISOString().slice(0, 10),
): ShipperBillingContractSummary {
  const shipperContracts = contracts.filter(
    (c) => c.shipperId === shipperId && c.activeFlag,
  );
  if (shipperContracts.length === 0) {
    return {
      hasContract: false,
      statusLabel: "請求契約未登録",
      statusTone: "warn",
      freightInvoiceRatePercent: null,
      tollInvoiceRatePercent: null,
      effectiveFrom: null,
      lastUpdatedAt: null,
      contract: null,
    };
  }

  const current = shipperContracts
    .filter(
      (c) =>
        c.effectiveFrom <= today &&
        (c.effectiveTo == null || c.effectiveTo >= today),
    )
    .sort((a, b) => {
      const scope = specificity(b) - specificity(a);
      if (scope !== 0) return scope;
      return b.effectiveFrom.localeCompare(a.effectiveFrom);
    })[0];

  const latest = current ?? shipperContracts[0]!;

  return {
    hasContract: true,
    statusLabel: current ? "有効" : "期限外",
    statusTone: current ? "ok" : "muted",
    freightInvoiceRatePercent:
      Math.round(latest.freightInvoiceRate * 10_000) / 100,
    tollInvoiceRatePercent:
      Math.round(latest.tollInvoiceRate * 10_000) / 100,
    effectiveFrom: latest.effectiveFrom,
    lastUpdatedAt: latest.updatedAt,
    contract: latest,
  };
}

function specificity(c: ShipperBillingContract): number {
  if (c.jobId || c.jobName) return 3;
  if (c.courseId) return 2;
  return 1;
}

export function formatBillingEffectivePeriod(
  contract: ShipperBillingContract,
): string {
  const to = contract.effectiveTo ?? "現行";
  const scope = contract.jobName
    ? contract.jobName
    : contract.courseId
      ? contract.courseId
      : "全業務";
  return `${scope}: ${contract.effectiveFrom} 〜 ${to}`;
}

export function formatBillingRates(summary: ShipperBillingContractSummary): string {
  if (!summary.hasContract) return "—";
  return `運賃 ${summary.freightInvoiceRatePercent}% / 高速 ${summary.tollInvoiceRatePercent}%`;
}
