import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";
import type { PartnerPaymentContract } from "./partner-payment-types";
import type { ShipperBillingContract } from "./shipper-billing-types";

function isDateInRange(
  businessDate: string,
  effectiveFrom: string,
  effectiveTo: string | null,
): boolean {
  if (businessDate < effectiveFrom) return false;
  if (effectiveTo != null && businessDate > effectiveTo) return false;
  return true;
}

function pickLatestContract<T extends { effectiveFrom: string }>(
  matches: T[],
): T | null {
  if (matches.length === 0) return null;
  return matches.sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom),
  )[0]!;
}

function specificityScore(contract: {
  jobId: string | null;
  jobName: string | null;
  courseId: ShigaDeliveryCourseId | null;
}): number {
  if (contract.jobId || contract.jobName) return 3;
  if (contract.courseId) return 2;
  return 1;
}

/**
 * 荷主請求契約の解決優先順位:
 * jobId一致 → courseId一致 → 荷主デフォルト
 */
export function resolveShipperBillingContract(
  contracts: ShipperBillingContract[],
  input: {
    shipperId: string;
    courseId: ShigaDeliveryCourseId | null;
    jobId?: string | null;
    jobName?: string | null;
    businessDate: string;
  },
): ShipperBillingContract | null {
  const jobId = input.jobId?.trim() || null;
  const jobName = input.jobName?.trim() || null;

  const eligible = contracts.filter(
    (c) =>
      c.activeFlag &&
      c.shipperId === input.shipperId &&
      isDateInRange(input.businessDate, c.effectiveFrom, c.effectiveTo),
  );

  const scored = eligible
    .map((c) => {
      const jobMatch =
        (jobId && c.jobId === jobId) ||
        (jobName && c.jobName?.trim() === jobName);
      const courseMatch =
        input.courseId != null && c.courseId === input.courseId;
      const isDefault = !c.jobId && !c.jobName && !c.courseId;

      if (jobMatch) return { c, tier: 3 };
      if (courseMatch && !c.jobId && !c.jobName) return { c, tier: 2 };
      if (isDefault) return { c, tier: 1 };
      return null;
    })
    .filter((x): x is { c: ShipperBillingContract; tier: number } => x != null);

  if (scored.length === 0) return null;

  const bestTier = Math.max(...scored.map((s) => s.tier));
  const tierMatches = scored.filter((s) => s.tier === bestTier).map((s) => s.c);
  return pickLatestContract(tierMatches);
}

/**
 * 協力会社支払契約の解決優先順位（将来拡張）:
 * partnerId + jobId → partnerId + courseId → コース別デフォルト
 */
export function resolvePartnerPaymentContract(
  contracts: PartnerPaymentContract[],
  input: {
    partnerId?: string | null;
    partnerName?: string;
    courseId: ShigaDeliveryCourseId;
    jobId?: string | null;
    jobName?: string | null;
    businessDate: string;
  },
): PartnerPaymentContract | null {
  const jobId = input.jobId?.trim() || null;
  const jobName = input.jobName?.trim() || null;
  const partnerName = input.partnerName?.trim();

  const eligible = contracts.filter(
    (c) =>
      c.activeFlag &&
      isDateInRange(input.businessDate, c.effectiveFrom, c.effectiveTo),
  );

  const partnerMatches = eligible.filter((c) => {
    if (c.isCourseDefault) return false;
    if (input.partnerId && c.partnerId === input.partnerId) return true;
    if (partnerName && c.partnerName.trim() === partnerName) return true;
    return false;
  });

  const scored = partnerMatches
    .map((c) => {
      const jobMatch =
        (jobId && c.jobId === jobId) ||
        (jobName && c.jobName?.trim() === jobName);
      const courseMatch = c.courseId === input.courseId;
      if (jobMatch && courseMatch) return { c, tier: 3 };
      if (courseMatch && !c.jobId && !c.jobName) return { c, tier: 2 };
      return null;
    })
    .filter((x): x is { c: PartnerPaymentContract; tier: number } => x != null);

  if (scored.length > 0) {
    const bestTier = Math.max(...scored.map((s) => s.tier));
    return pickLatestContract(
      scored.filter((s) => s.tier === bestTier).map((s) => s.c),
    );
  }

  const defaults = eligible.filter(
    (c) => c.isCourseDefault && c.courseId === input.courseId,
  );
  return pickLatestContract(defaults);
}

export function resolveShipperBillingContractById(
  contracts: ShipperBillingContract[],
  contractId: string | null | undefined,
): ShipperBillingContract | null {
  if (!contractId) return null;
  return contracts.find((c) => c.id === contractId) ?? null;
}

export function resolvePartnerPaymentContractById(
  contracts: PartnerPaymentContract[],
  contractId: string | null | undefined,
): PartnerPaymentContract | null {
  if (!contractId) return null;
  return contracts.find((c) => c.id === contractId) ?? null;
}

export function listShipperBillingHistory(
  contracts: ShipperBillingContract[],
  shipperId: string,
): ShipperBillingContract[] {
  return contracts
    .filter((c) => c.shipperId === shipperId)
    .sort((a, b) => {
      const scope =
        specificityScore(b) - specificityScore(a);
      if (scope !== 0) return scope;
      return b.effectiveFrom.localeCompare(a.effectiveFrom);
    });
}

export function listPartnerPaymentHistory(
  contracts: PartnerPaymentContract[],
  partnerId: string,
): PartnerPaymentContract[] {
  return contracts
    .filter((c) => c.partnerId === partnerId && !c.isCourseDefault)
    .sort((a, b) => {
      const course = a.courseId.localeCompare(b.courseId);
      if (course !== 0) return course;
      return b.effectiveFrom.localeCompare(a.effectiveFrom);
    });
}
