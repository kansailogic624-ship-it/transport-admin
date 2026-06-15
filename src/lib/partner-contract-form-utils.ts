import { SHIGA_DELIVERY_COURSES } from "@/lib/import-preprocessor/shiga-delivery/course-definitions";
import { findPartnerProfileById } from "@/lib/partner-company-utils";
import {
  COURSE_DEFAULT_CONTRACT_LABEL,
  type PartnerPaymentContract,
  type TollBillingMethod,
} from "@/lib/shiga-fm/partner-payment-types";

export type PartnerPaymentContractFormState = {
  partnerId: string;
  courseId: PartnerPaymentContract["courseId"];
  jobId: string;
  jobName: string;
  baseUnitPrice: number;
  overtimeUnitPrice: number;
  tollBillingMethod: TollBillingMethod;
  effectiveFrom: string;
  effectiveTo: string;
  activeFlag: boolean;
  note: string;
};

/** @deprecated PartnerPaymentContractFormState */
export type PartnerContractFormState = PartnerPaymentContractFormState;

export const EMPTY_PARTNER_PAYMENT_CONTRACT_FORM: PartnerPaymentContractFormState =
  {
    partnerId: "",
    courseId: "SHIGA_02",
    jobId: "",
    jobName: "",
    baseUnitPrice: 0,
    overtimeUnitPrice: 0,
    tollBillingMethod: "actual_cost",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
    activeFlag: true,
    note: "",
  };

/** @deprecated EMPTY_PARTNER_PAYMENT_CONTRACT_FORM */
export const EMPTY_PARTNER_CONTRACT_FORM = EMPTY_PARTNER_PAYMENT_CONTRACT_FORM;

export function courseLabel(courseId: string): string {
  return (
    SHIGA_DELIVERY_COURSES.find((c) => c.courseId === courseId)?.courseName ??
    courseId
  );
}

export function contractToForm(
  contract: PartnerPaymentContract,
): PartnerPaymentContractFormState {
  return {
    partnerId: contract.partnerId ?? "",
    courseId: contract.courseId,
    jobId: contract.jobId ?? "",
    jobName: contract.jobName ?? "",
    baseUnitPrice: contract.baseUnitPrice,
    overtimeUnitPrice: contract.overtimeUnitPrice,
    tollBillingMethod: contract.tollBillingMethod,
    effectiveFrom: contract.effectiveFrom,
    effectiveTo: contract.effectiveTo ?? "",
    activeFlag: contract.activeFlag,
    note: contract.note ?? "",
  };
}

export function formToPartnerPaymentContractDraft(
  form: PartnerPaymentContractFormState,
  masters: import("@/lib/types").MasterData,
  options?: { isCourseDefault?: boolean },
): Omit<PartnerPaymentContract, "id" | "createdAt" | "updatedAt"> {
  const profile = findPartnerProfileById(masters, form.partnerId);
  const isCourseDefault = options?.isCourseDefault ?? false;
  return {
    partnerId: isCourseDefault ? null : form.partnerId,
    partnerName: isCourseDefault
      ? COURSE_DEFAULT_CONTRACT_LABEL
      : (profile?.name ?? ""),
    courseId: form.courseId,
    courseName: courseLabel(form.courseId),
    isCourseDefault,
    jobId: form.jobId.trim() || null,
    jobName: form.jobName.trim() || null,
    baseUnitPrice: Math.round(form.baseUnitPrice),
    overtimeUnitPrice: Math.round(form.overtimeUnitPrice),
    tollBillingMethod: form.tollBillingMethod,
    effectiveFrom: form.effectiveFrom,
    effectiveTo: form.effectiveTo.trim() || null,
    activeFlag: form.activeFlag,
    note: form.note.trim() || null,
  };
}

/** @deprecated formToPartnerPaymentContractDraft */
export const formToPartnerContractDraft = formToPartnerPaymentContractDraft;

export function filterPartnerPaymentContracts(
  contracts: PartnerPaymentContract[],
  partnerId: string,
  options?: { currentOnly?: boolean; includeHistory?: boolean },
): PartnerPaymentContract[] {
  const today = new Date().toISOString().slice(0, 10);
  return contracts
    .filter((c) => c.partnerId === partnerId && !c.isCourseDefault)
    .filter((c) => {
      if (options?.includeHistory) return true;
      if (options?.currentOnly) {
        return (
          c.effectiveFrom <= today &&
          (c.effectiveTo == null || c.effectiveTo >= today)
        );
      }
      return c.effectiveTo == null;
    })
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

/** @deprecated filterPartnerPaymentContracts */
export const filterPartnerContracts = filterPartnerPaymentContracts;

export function filterPartnerPaymentContractHistory(
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

/** @deprecated filterPartnerPaymentContractHistory */
export const filterPartnerContractHistory = filterPartnerPaymentContractHistory;
