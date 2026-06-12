import type { JobDetail } from "./types";

export function suggestNextJobId(jobs: JobDetail[]): string {
  const numericIds = jobs
    .map((j) => Number(j.jobId))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numericIds.length === 0) return "1";
  return String(Math.max(...numericIds) + 1);
}

export function sortJobs(jobs: JobDetail[]): JobDetail[] {
  return [...jobs].sort((a, b) =>
    a.jobId.localeCompare(b.jobId, "ja", { numeric: true }),
  );
}

export function jobNamesForShipper(
  jobs: JobDetail[],
  shipperName: string,
): string[] {
  const shipper = shipperName.trim();
  if (!shipper) return [];
  const names = jobs
    .filter((job) => job.shipperName.trim() === shipper)
    .map((job) => job.jobName.trim())
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ja"));
}

export function isJobIdTaken(
  jobs: JobDetail[],
  jobId: string,
  excludeId?: string,
): boolean {
  const normalized = jobId.trim();
  return jobs.some(
    (j) =>
      j.jobId.trim() === normalized &&
      (excludeId === undefined || j.id !== excludeId),
  );
}
