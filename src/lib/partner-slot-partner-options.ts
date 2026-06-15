import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";
import type { PartnerCompanyProfile } from "@/lib/partner-company-types";

export type PartnerSlotEmptyReason = "none" | "no_profiles" | "all_inactive";

export type PartnerSlotPartnerGroups = {
  allProfiles: PartnerCompanyProfile[];
  activeProfiles: PartnerCompanyProfile[];
  recommended: PartnerCompanyProfile[];
  other: PartnerCompanyProfile[];
  emptyReason: PartnerSlotEmptyReason;
};

export function partnerCourseMatches(
  profile: PartnerCompanyProfile,
  courseId: ShigaDeliveryCourseId | null | undefined,
): boolean {
  if (!courseId) return true;
  if (profile.courseIds.length === 0) return true;
  return profile.courseIds.includes(courseId);
}

export function partnerJobMatches(
  profile: PartnerCompanyProfile,
  jobName: string | null | undefined,
): boolean {
  const key = jobName?.trim();
  if (!key) return true;
  if (profile.assignedJobNames.length === 0) return true;
  return profile.assignedJobNames.some((j) => j.trim() === key);
}

export function isRecommendedPartnerForSlot(
  profile: PartnerCompanyProfile,
  courseId: ShigaDeliveryCourseId | null | undefined,
  jobName: string | null | undefined,
): boolean {
  return (
    partnerCourseMatches(profile, courseId) &&
    partnerJobMatches(profile, jobName)
  );
}

/** 業務不一致のみ（コースは一致）のときの補足ラベル */
export function partnerJobMismatchNote(
  profile: PartnerCompanyProfile,
  courseId: ShigaDeliveryCourseId | null | undefined,
  jobName: string | null | undefined,
): string | null {
  if (!partnerCourseMatches(profile, courseId)) return null;
  if (partnerJobMatches(profile, jobName)) return null;
  return "業務は未登録ですが、対象コースは一致しています";
}

export function classifyPartnerOptionsForSlot(
  profiles: PartnerCompanyProfile[],
  courseId: ShigaDeliveryCourseId | null | undefined,
  jobName: string | null | undefined,
): PartnerSlotPartnerGroups {
  const allProfiles = profiles;
  const activeProfiles = profiles.filter((p) => p.activeFlag);

  if (allProfiles.length === 0) {
    return {
      allProfiles,
      activeProfiles,
      recommended: [],
      other: [],
      emptyReason: "no_profiles",
    };
  }

  if (activeProfiles.length === 0) {
    return {
      allProfiles,
      activeProfiles,
      recommended: [],
      other: [],
      emptyReason: "all_inactive",
    };
  }

  const recommended = activeProfiles.filter((p) =>
    isRecommendedPartnerForSlot(p, courseId, jobName),
  );
  const recommendedIds = new Set(recommended.map((p) => p.id));
  const other = activeProfiles.filter((p) => !recommendedIds.has(p.id));

  return {
    allProfiles,
    activeProfiles,
    recommended,
    other,
    emptyReason: "none",
  };
}

export function needsCourseMismatchConfirm(
  profile: PartnerCompanyProfile,
  courseId: ShigaDeliveryCourseId | null | undefined,
): boolean {
  if (!courseId) return false;
  if (profile.courseIds.length === 0) return false;
  return !profile.courseIds.includes(courseId);
}
