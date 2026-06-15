import type { ShigaDeliveryCourseId } from "../shiga-delivery/types";

export type ShigaFmCourseMapping = {
  courseId: ShigaDeliveryCourseId;
  courseName: string;
  fmJobNames: string[];
  /** SHIGA_04 のみ: 合算候補 */
  aggregateFmJobNames?: string[];
};

export const SHIGA_FM_COURSE_MAPPING: ShigaFmCourseMapping[] = [
  {
    courseId: "SHIGA_01",
    courseName: "滋賀地区①",
    fmJobNames: ["Joshin①"],
  },
  {
    courseId: "SHIGA_02",
    courseName: "滋賀地区②",
    fmJobNames: ["Joshin②"],
  },
  {
    courseId: "SHIGA_03",
    courseName: "滋賀地区③",
    fmJobNames: ["Joshin③"],
  },
  {
    courseId: "SHIGA_04",
    courseName: "滋賀地区④",
    fmJobNames: ["Joshin④"],
    aggregateFmJobNames: ["Joshin⑤", "Joshin⑥"],
  },
];

/** 突合対象外（滋賀を含む別業務） */
export const SHIGA_FM_EXCLUDED_JOB_NAMES = [
  "宅配滋賀①",
  "宅配滋賀②",
  "宅配滋賀③",
  "宅配滋賀④",
  "宅配滋賀⑤",
  "ニトリ滋賀",
  "ニトリ滋賀事務所",
  "ニトリ滋賀倉庫",
  "HL店戻し 滋賀",
  "滋賀ﾆﾄﾘ助手",
] as const;

const JOB_TO_COURSE = new Map<string, ShigaFmCourseMapping>();
for (const m of SHIGA_FM_COURSE_MAPPING) {
  for (const job of m.fmJobNames) {
    JOB_TO_COURSE.set(job, m);
  }
}

export function isExcludedFmJob(jobName: string): boolean {
  const j = jobName.trim();
  return SHIGA_FM_EXCLUDED_JOB_NAMES.some((ex) => ex === j);
}

export function mapFmJobToCourse(
  jobName: string,
): ShigaFmCourseMapping | null {
  const j = jobName.trim();
  if (isExcludedFmJob(j)) return null;
  return JOB_TO_COURSE.get(j) ?? null;
}

export function isAggregateOnlyFmJob(jobName: string): boolean {
  const j = jobName.trim();
  return SHIGA_FM_COURSE_MAPPING.some((m) =>
    m.aggregateFmJobNames?.includes(j),
  );
}

export function getAggregateJobsForCourse(
  courseId: ShigaDeliveryCourseId,
): string[] {
  return (
    SHIGA_FM_COURSE_MAPPING.find((m) => m.courseId === courseId)
      ?.aggregateFmJobNames ?? []
  );
}

/** Joshin⑤ 等、合算専用業務の所属コース */
export function mapAggregateFmJobToCourse(
  jobName: string,
): ShigaFmCourseMapping | null {
  const j = jobName.trim();
  return (
    SHIGA_FM_COURSE_MAPPING.find((m) => m.aggregateFmJobNames?.includes(j)) ??
    null
  );
}

export function resolveFmJobCourseMapping(
  jobName: string,
): ShigaFmCourseMapping | null {
  return mapFmJobToCourse(jobName) ?? mapAggregateFmJobToCourse(jobName);
}
