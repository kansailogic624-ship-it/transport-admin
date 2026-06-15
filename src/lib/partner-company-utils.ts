import type { JobDetail } from "@/lib/types";
import type {
  PartnerAssignedJob,
  PartnerCompanyProfile,
} from "./partner-company-types";
import { SHIGA_FM_COURSE_MAPPING } from "@/lib/import-preprocessor/shiga-fm-reconciliation/course-mapping";
import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";
import type { MasterData } from "@/lib/types";
import {
  createPartnerCompanyId,
  type PartnerCompanyProfile as Profile,
} from "./partner-company-types";

export function getPartnerProfiles(masters: MasterData): Profile[] {
  return (masters.partnerProfiles ?? []).map(normalizePartnerProfileShape);
}

/** jobName から業務台帳の jobId を照合 */
export function resolveJobIdFromLedger(
  jobName: string,
  ledgerJobs: JobDetail[],
): string | null {
  const key = jobName.trim();
  const found = ledgerJobs.find((j) => j.jobName.trim() === key);
  return found?.jobId ?? null;
}

export function jobNamesToAssignedJobs(
  jobNames: string[],
  ledgerJobs: JobDetail[] = [],
): PartnerAssignedJob[] {
  return jobNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((jobName) => ({
      jobId: resolveJobIdFromLedger(jobName, ledgerJobs),
      jobName,
    }));
}

export function assignedJobsToNames(jobs: PartnerAssignedJob[]): string[] {
  return jobs.map((j) => j.jobName);
}

/** assignedJobs / assignedJobNames の整合を取る */
export function normalizePartnerProfileShape(
  profile: PartnerCompanyProfile,
): PartnerCompanyProfile {
  const assignedJobs =
    profile.assignedJobs?.length > 0
      ? profile.assignedJobs
      : jobNamesToAssignedJobs(profile.assignedJobNames ?? []);
  const assignedJobNames = assignedJobsToNames(assignedJobs);
  return { ...profile, assignedJobs, assignedJobNames };
}

/** 業務台帳を参照して jobId を補完 */
export function enrichPartnerProfileJobs(
  profile: PartnerCompanyProfile,
  ledgerJobs: JobDetail[],
): PartnerCompanyProfile {
  const assignedJobs = (profile.assignedJobs ?? []).map((job) => ({
    jobName: job.jobName,
    jobId: job.jobId ?? resolveJobIdFromLedger(job.jobName, ledgerJobs),
  }));
  return normalizePartnerProfileShape({
    ...profile,
    assignedJobs,
  });
}

/** 既存 partners[] を partnerProfiles に移行（初回のみ） */
export function ensurePartnerProfiles(masters: MasterData): MasterData {
  if (masters.partnerProfiles && masters.partnerProfiles.length > 0) {
    return syncPartnersList({
      ...masters,
      partnerProfiles: masters.partnerProfiles.map(normalizePartnerProfileShape),
    });
  }
  const now = new Date().toISOString();
  const profiles: Profile[] = (masters.partners ?? []).map((name) => ({
    id: createPartnerCompanyId(),
    name: name.trim(),
    assignedJobs: [],
    assignedJobNames: [],
    courseIds: [],
    note: null,
    activeFlag: true,
    createdAt: now,
    updatedAt: now,
  }));
  return syncPartnersList({ ...masters, partnerProfiles: profiles });
}

export function syncPartnersList(masters: MasterData): MasterData {
  const profiles = (masters.partnerProfiles ?? []).map(normalizePartnerProfileShape);
  const names = profiles
    .filter((p) => p.activeFlag)
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b, "ja"));
  return { ...masters, partners: names, partnerProfiles: profiles };
}

export function findPartnerProfileById(
  masters: MasterData,
  partnerId: string,
): Profile | null {
  return getPartnerProfiles(masters).find((p) => p.id === partnerId) ?? null;
}

export function findPartnerProfileByName(
  masters: MasterData,
  name: string,
): Profile | null {
  const key = name.trim();
  return (
    getPartnerProfiles(masters).find((p) => p.name.trim() === key) ?? null
  );
}

export function jobNamesForCourses(
  courseIds: ShigaDeliveryCourseId[],
): string[] {
  const jobs = new Set<string>();
  for (const courseId of courseIds) {
    const mapping = SHIGA_FM_COURSE_MAPPING.find(
      (m) => m.courseId === courseId,
    );
    if (!mapping) continue;
    for (const job of mapping.fmJobNames) jobs.add(job);
    for (const job of mapping.aggregateFmJobNames ?? []) jobs.add(job);
  }
  return [...jobs];
}

export function courseLabelsForProfile(profile: Profile): string[] {
  return profile.courseIds.map((id) => {
    const m = SHIGA_FM_COURSE_MAPPING.find((c) => c.courseId === id);
    return m ? `${m.courseName}（${id}）` : id;
  });
}

export function buildPartnerProfileForSave(input: {
  profile: Profile | null;
  name: string;
  assignedJobs: PartnerAssignedJob[];
  courseIds: ShigaDeliveryCourseId[];
  note: string;
  activeFlag: boolean;
}): Profile {
  const now = new Date().toISOString();
  const assignedJobNames = assignedJobsToNames(input.assignedJobs);
  if (input.profile) {
    return {
      ...input.profile,
      name: input.name.trim(),
      assignedJobs: input.assignedJobs,
      assignedJobNames,
      courseIds: input.courseIds,
      note: input.note.trim() || null,
      activeFlag: input.activeFlag,
      updatedAt: now,
    };
  }
  return {
    id: createPartnerCompanyId(),
    name: input.name.trim(),
    assignedJobs: input.assignedJobs,
    assignedJobNames,
    courseIds: input.courseIds,
    note: input.note.trim() || null,
    activeFlag: input.activeFlag,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertPartnerProfile(
  masters: MasterData,
  profile: Profile,
): MasterData {
  const normalized = normalizePartnerProfileShape(profile);
  const profiles = [...getPartnerProfiles(masters)];
  const index = profiles.findIndex((p) => p.id === normalized.id);
  if (index >= 0) profiles[index] = normalized;
  else profiles.push(normalized);
  return syncPartnersList({
    ...masters,
    partnerProfiles: profiles.sort((a, b) =>
      a.name.localeCompare(b.name, "ja"),
    ),
  });
}

export function removePartnerProfile(
  masters: MasterData,
  partnerId: string,
): MasterData {
  const profiles = getPartnerProfiles(masters).filter((p) => p.id !== partnerId);
  return syncPartnersList({ ...masters, partnerProfiles: profiles });
}

export function addPartnerProfile(
  masters: MasterData,
  input: {
    name: string;
    assignedJobs: PartnerAssignedJob[];
    courseIds: ShigaDeliveryCourseId[];
    note?: string;
  },
): MasterData {
  const profile = buildPartnerProfileForSave({
    profile: null,
    name: input.name,
    assignedJobs: input.assignedJobs,
    courseIds: input.courseIds,
    note: input.note ?? "",
    activeFlag: true,
  });
  return upsertPartnerProfile(masters, profile);
}
