import { SHIGA_DELIVERY_COURSES } from "@/lib/import-preprocessor/shiga-delivery/course-definitions";
import { SHIGA_FM_BILLING_PARTY } from "@/lib/import-preprocessor/shiga-fm-reconciliation/cost-classifier";
import type { MasterData } from "@/lib/types";
import { findPartnerProfileByName } from "@/lib/partner-company-utils";
import { findShipperProfileByName } from "@/lib/shipper-company-utils";
import type { PartnerPaymentContract } from "./partner-payment-types";
import type { LegacyPartnerContractRate } from "./partner-contract-types";
import type { ShipperBillingContract } from "./shipper-billing-types";

function courseName(courseId: string): string {
  return (
    SHIGA_DELIVERY_COURSES.find((c) => c.courseId === courseId)?.courseName ??
    courseId
  );
}

/** 旧契約を支払契約へ変換（請求率は除外） */
export function legacyToPaymentContract(
  legacy: LegacyPartnerContractRate,
): PartnerPaymentContract {
  return {
    id: legacy.id,
    partnerId: legacy.partnerId,
    partnerName: legacy.vendorName,
    courseId: legacy.courseId,
    courseName: legacy.courseName,
    isCourseDefault: legacy.isCourseDefault,
    jobId: null,
    jobName: null,
    baseUnitPrice: legacy.baseUnitPrice,
    overtimeUnitPrice: legacy.overtimeUnitPrice,
    tollBillingMethod: legacy.tollBillingMethod,
    effectiveFrom: legacy.effectiveFrom,
    effectiveTo: legacy.effectiveTo,
    activeFlag: legacy.activeFlag,
    note: legacy.note,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  };
}

/** 旧契約から荷主請求契約の初期データを抽出 */
export function extractBillingContractsFromLegacy(
  legacyContracts: LegacyPartnerContractRate[],
  masters: MasterData,
): ShipperBillingContract[] {
  const shipperProfile = findShipperProfileByName(masters, SHIGA_FM_BILLING_PARTY);
  if (!shipperProfile) return [];

  const rates = new Map<string, { freight: number; toll: number }>();
  for (const c of legacyContracts) {
    if (c.isCourseDefault) continue;
    const freight = c.invoiceRate ?? 0.98;
    const toll = c.tollInvoiceRate ?? 1;
    const key = `${freight}:${toll}`;
    rates.set(key, { freight, toll });
  }

  const now = new Date().toISOString();
  return [...rates.entries()].map(([key, rate]) => ({
    id: crypto.randomUUID(),
    shipperId: shipperProfile.id,
    shipperName: shipperProfile.name,
    courseId: null,
    jobId: null,
    jobName: null,
    freightInvoiceRate: rate.freight,
    tollInvoiceRate: rate.toll,
    effectiveFrom: "2026-04-01",
    effectiveTo: null,
    activeFlag: true,
    note: `旧 partner_contract_rates から移行（${key}）`,
    createdAt: now,
    updatedAt: now,
  }));
}

/** 既存支払契約に partnerId を付与 */
export function linkPaymentContractsToPartnerProfiles(
  contracts: PartnerPaymentContract[],
  masters: MasterData,
): PartnerPaymentContract[] {
  return contracts.map((c) => {
    if (c.isCourseDefault || c.partnerId) return c;
    const profile = findPartnerProfileByName(masters, c.partnerName);
    if (!profile) return c;
    return {
      ...c,
      partnerId: profile.id,
      partnerName: profile.name,
    };
  });
}

/** 旧型との互換（partner-contract-migrate.ts から） */
export function linkContractsToPartnerProfiles(
  contracts: PartnerPaymentContract[],
  masters: MasterData,
): PartnerPaymentContract[] {
  return linkPaymentContractsToPartnerProfiles(contracts, masters);
}

export function buildDefaultShipperBillingDraft(
  shipperId: string,
  shipperName: string,
): Omit<ShipperBillingContract, "id" | "createdAt" | "updatedAt"> {
  return {
    shipperId,
    shipperName,
    courseId: null,
    jobId: null,
    jobName: null,
    freightInvoiceRate: 0.98,
    tollInvoiceRate: 1,
    effectiveFrom: "2026-04-01",
    effectiveTo: null,
    activeFlag: true,
    note: "滋賀店配 Joshin 業務の荷主請求率（初期データ）",
  };
}

export function buildDefaultPaymentContractDrafts(): Omit<
  PartnerPaymentContract,
  "id" | "createdAt" | "updatedAt"
>[] {
  return [
    {
      partnerId: null,
      partnerName: "潤生輸送",
      courseId: "SHIGA_02",
      courseName: courseName("SHIGA_02"),
      isCourseDefault: false,
      jobId: null,
      jobName: null,
      baseUnitPrice: 27_500,
      overtimeUnitPrice: 1_400,
      tollBillingMethod: "actual_cost",
      effectiveFrom: "2020-01-01",
      effectiveTo: null,
      activeFlag: true,
      note: "Joshin② / 滋賀地区② 初期支払契約",
    },
    {
      partnerId: null,
      partnerName: "コース別デフォルト単価",
      courseId: "SHIGA_04",
      courseName: courseName("SHIGA_04"),
      isCourseDefault: true,
      jobId: null,
      jobName: null,
      baseUnitPrice: 25_740,
      overtimeUnitPrice: 1_600,
      tollBillingMethod: "actual_cost",
      effectiveFrom: "2020-01-01",
      effectiveTo: null,
      activeFlag: true,
      note: "滋賀地区④ コース別デフォルト単価（入力補助用）",
    },
  ];
}
