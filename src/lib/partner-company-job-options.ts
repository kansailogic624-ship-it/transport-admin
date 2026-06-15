import {
  SHIGA_FM_COURSE_MAPPING,
  resolveFmJobCourseMapping,
} from "@/lib/import-preprocessor/shiga-fm-reconciliation/course-mapping";
import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";
import type { JobDetail } from "@/lib/types";

export type PartnerJobOptionSource = "job_ledger" | "shiga_compat";

export type PartnerJobOption = {
  jobName: string;
  shipperName: string | null;
  source: PartnerJobOptionSource;
  courseId: ShigaDeliveryCourseId | null;
};

const SHIGA_COMPAT_JOB_NAMES: string[] = [
  ...new Set(
    SHIGA_FM_COURSE_MAPPING.flatMap((m) => [
      ...m.fmJobNames,
      ...(m.aggregateFmJobNames ?? []),
    ]),
  ),
];

export function buildPartnerJobOptions(
  jobs: JobDetail[],
): PartnerJobOption[] {
  const byName = new Map<string, PartnerJobOption>();

  for (const job of jobs) {
    const jobName = job.jobName.trim();
    if (!jobName) continue;
    const mapping = resolveFmJobCourseMapping(jobName);
    byName.set(jobName, {
      jobName,
      shipperName: job.shipperName.trim() || null,
      source: "job_ledger",
      courseId: mapping?.courseId ?? null,
    });
  }

  for (const jobName of SHIGA_COMPAT_JOB_NAMES) {
    if (byName.has(jobName)) continue;
    const mapping = resolveFmJobCourseMapping(jobName);
    byName.set(jobName, {
      jobName,
      shipperName: null,
      source: "shiga_compat",
      courseId: mapping?.courseId ?? null,
    });
  }

  return [...byName.values()].sort((a, b) =>
    a.jobName.localeCompare(b.jobName, "ja"),
  );
}

/** 業務名から滋賀店配突合用コースIDを導出 */
export function courseIdsForJobNames(
  jobNames: string[],
): ShigaDeliveryCourseId[] {
  const ids = new Set<ShigaDeliveryCourseId>();
  for (const name of jobNames) {
    const mapping = resolveFmJobCourseMapping(name.trim());
    if (mapping) ids.add(mapping.courseId);
  }
  return [...ids];
}

/** 選択済み業務名のうち、候補に無いもの（既存データ保持用） */
export function orphanSelectedJobNames(
  selected: string[],
  options: PartnerJobOption[],
): string[] {
  const known = new Set(options.map((o) => o.jobName));
  return selected.filter((name) => name.trim() && !known.has(name.trim()));
}
