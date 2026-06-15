import { SHIGA_DELIVERY_COURSES } from "@/lib/import-preprocessor/shiga-delivery/course-definitions";
import { findShipperProfileById } from "@/lib/shipper-company-utils";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";

export type ShipperBillingContractFormState = {
  shipperId: string;
  courseId: string;
  jobId: string;
  jobName: string;
  freightInvoiceRatePercent: number;
  tollInvoiceRatePercent: number;
  effectiveFrom: string;
  effectiveTo: string;
  activeFlag: boolean;
  note: string;
};

export const EMPTY_SHIPPER_BILLING_CONTRACT_FORM: ShipperBillingContractFormState =
  {
    shipperId: "",
    courseId: "",
    jobId: "",
    jobName: "",
    freightInvoiceRatePercent: 98,
    tollInvoiceRatePercent: 100,
    effectiveFrom: "2026-04-01",
    effectiveTo: "",
    activeFlag: true,
    note: "",
  };

export function courseLabel(courseId: string): string {
  if (!courseId) return "全コース";
  return (
    SHIGA_DELIVERY_COURSES.find((c) => c.courseId === courseId)?.courseName ??
    courseId
  );
}

export function contractToBillingForm(
  contract: ShipperBillingContract,
): ShipperBillingContractFormState {
  return {
    shipperId: contract.shipperId,
    courseId: contract.courseId ?? "",
    jobId: contract.jobId ?? "",
    jobName: contract.jobName ?? "",
    freightInvoiceRatePercent:
      Math.round(contract.freightInvoiceRate * 10_000) / 100,
    tollInvoiceRatePercent:
      Math.round(contract.tollInvoiceRate * 10_000) / 100,
    effectiveFrom: contract.effectiveFrom,
    effectiveTo: contract.effectiveTo ?? "",
    activeFlag: contract.activeFlag,
    note: contract.note ?? "",
  };
}

export function formToShipperBillingContractDraft(
  form: ShipperBillingContractFormState,
  masters: import("@/lib/types").MasterData,
): Omit<ShipperBillingContract, "id" | "createdAt" | "updatedAt"> {
  const profile = findShipperProfileById(masters, form.shipperId);
  return {
    shipperId: form.shipperId,
    shipperName: profile?.name ?? "",
    courseId: (form.courseId || null) as ShipperBillingContract["courseId"],
    jobId: form.jobId.trim() || null,
    jobName: form.jobName.trim() || null,
    freightInvoiceRate: form.freightInvoiceRatePercent / 100,
    tollInvoiceRate: form.tollInvoiceRatePercent / 100,
    effectiveFrom: form.effectiveFrom,
    effectiveTo: form.effectiveTo.trim() || null,
    activeFlag: form.activeFlag,
    note: form.note.trim() || null,
  };
}

export function filterShipperBillingContracts(
  contracts: ShipperBillingContract[],
  shipperId: string,
  options?: { currentOnly?: boolean },
): ShipperBillingContract[] {
  const today = new Date().toISOString().slice(0, 10);
  return contracts
    .filter((c) => c.shipperId === shipperId)
    .filter((c) => {
      if (!options?.currentOnly) return c.effectiveTo == null;
      return (
        c.effectiveFrom <= today &&
        (c.effectiveTo == null || c.effectiveTo >= today)
      );
    })
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

export function filterShipperBillingHistory(
  contracts: ShipperBillingContract[],
  shipperId: string,
): ShipperBillingContract[] {
  return contracts
    .filter((c) => c.shipperId === shipperId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}
