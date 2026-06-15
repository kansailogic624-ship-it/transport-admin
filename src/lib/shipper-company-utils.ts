import { SHIGA_FM_COURSE_MAPPING } from "@/lib/import-preprocessor/shiga-fm-reconciliation/course-mapping";
import type { JobDetail } from "@/lib/types";
import type { MasterData } from "@/lib/types";
import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";
import {
  createShipperCompanyId,
  type ShipperAssignedJob,
  type ShipperCompanyProfile,
} from "./shipper-company-types";

export function getShipperProfiles(masters: MasterData): ShipperCompanyProfile[] {
  return (masters.shipperProfiles ?? []).map(normalizeShipperProfileShape);
}

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
): ShipperAssignedJob[] {
  return jobNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((jobName) => ({
      jobId: resolveJobIdFromLedger(jobName, ledgerJobs),
      jobName,
    }));
}

export function assignedJobsToNames(jobs: ShipperAssignedJob[]): string[] {
  return jobs.map((j) => j.jobName);
}

export function normalizeShipperProfileShape(
  profile: ShipperCompanyProfile,
): ShipperCompanyProfile {
  const assignedJobs =
    profile.assignedJobs?.length > 0
      ? profile.assignedJobs
      : jobNamesToAssignedJobs(profile.assignedJobNames ?? []);
  return {
    ...profile,
    assignedJobs,
    assignedJobNames: assignedJobsToNames(assignedJobs),
  };
}

export function enrichShipperProfileJobs(
  profile: ShipperCompanyProfile,
  ledgerJobs: JobDetail[],
): ShipperCompanyProfile {
  const assignedJobs = (profile.assignedJobs ?? []).map((job) => ({
    jobName: job.jobName,
    jobId: job.jobId ?? resolveJobIdFromLedger(job.jobName, ledgerJobs),
  }));
  return normalizeShipperProfileShape({ ...profile, assignedJobs });
}

/** 既存 shippers[] を shipperProfiles に移行 */
export function ensureShipperProfiles(masters: MasterData): MasterData {
  if (masters.shipperProfiles && masters.shipperProfiles.length > 0) {
    return syncShippersList({
      ...masters,
      shipperProfiles: masters.shipperProfiles.map(normalizeShipperProfileShape),
    });
  }
  const now = new Date().toISOString();
  const profiles: ShipperCompanyProfile[] = masters.shippers.map((name) => ({
    id: createShipperCompanyId(),
    name,
    assignedJobs: jobNamesToAssignedJobs(masters.shipperJobs[name] ?? []),
    assignedJobNames: masters.shipperJobs[name] ?? [],
    courseIds: [],
    note: null,
    activeFlag: true,
    createdAt: now,
    updatedAt: now,
  }));
  return syncShippersList({ ...masters, shipperProfiles: profiles });
}

function syncShippersList(masters: MasterData): MasterData {
  const profiles = getShipperProfiles(masters);
  const shippers = profiles.map((p) => p.name);
  const shipperJobs: Record<string, string[]> = { ...masters.shipperJobs };
  for (const p of profiles) {
    shipperJobs[p.name] = p.assignedJobNames;
  }
  return { ...masters, shippers, shipperJobs, shipperProfiles: profiles };
}

export function findShipperProfileById(
  masters: MasterData,
  shipperId: string,
): ShipperCompanyProfile | null {
  return getShipperProfiles(masters).find((p) => p.id === shipperId) ?? null;
}

export function findShipperProfileByName(
  masters: MasterData,
  name: string,
): ShipperCompanyProfile | null {
  const key = name.trim();
  return getShipperProfiles(masters).find((p) => p.name.trim() === key) ?? null;
}

export function upsertShipperProfile(
  masters: MasterData,
  profile: ShipperCompanyProfile,
): MasterData {
  const normalized = normalizeShipperProfileShape(profile);
  const profiles = getShipperProfiles(masters);
  const idx = profiles.findIndex((p) => p.id === normalized.id);
  const next =
    idx >= 0
      ? profiles.map((p, i) => (i === idx ? normalized : p))
      : [...profiles, normalized];
  return syncShippersList({ ...masters, shipperProfiles: next });
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

export function buildShipperProfileForSave(input: {
  profile: ShipperCompanyProfile | null;
  name: string;
  assignedJobs: ShipperAssignedJob[];
  courseIds: ShigaDeliveryCourseId[];
  note: string;
  activeFlag: boolean;
}): ShipperCompanyProfile {
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
    id: createShipperCompanyId(),
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

export function courseIdsForJobNames(
  jobNames: string[],
): ShigaDeliveryCourseId[] {
  const ids = new Set<ShigaDeliveryCourseId>();
  for (const mapping of SHIGA_FM_COURSE_MAPPING) {
    if (mapping.fmJobNames.some((j) => jobNames.includes(j))) {
      ids.add(mapping.courseId);
    }
  }
  return [...ids];
}

export function courseLabelsForShipperProfile(
  profile: ShipperCompanyProfile,
): string[] {
  return profile.courseIds.map(
    (id) =>
      SHIGA_FM_COURSE_MAPPING.find((m) => m.courseId === id)?.courseName ?? id,
  );
}
