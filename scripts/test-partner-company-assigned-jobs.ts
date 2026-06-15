/**
 * 協力会社 assignedJobs 移行テスト
 * npx tsx scripts/test-partner-company-assigned-jobs.ts
 */
import {
  enrichPartnerProfileJobs,
  jobNamesToAssignedJobs,
  normalizePartnerProfileShape,
} from "../src/lib/partner-company-utils";
import type { PartnerCompanyProfile } from "../src/lib/partner-company-types";
import type { JobDetail } from "../src/lib/types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function job(name: string, jobId: string): JobDetail {
  return {
    id: jobId,
    jobId,
    shipperName: "荷主",
    jobName: name,
    revenue: 1000,
    priceHistory: [],
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

function main() {
  const legacy: PartnerCompanyProfile = {
    id: "p1",
    name: "潤生輸送",
    assignedJobNames: ["Joshin②", "旧業務"],
    assignedJobs: [],
    courseIds: ["SHIGA_02"],
    note: null,
    activeFlag: true,
    createdAt: "2020-01-01",
    updatedAt: "2020-01-01",
  };

  const normalized = normalizePartnerProfileShape(legacy);
  assert(normalized.assignedJobs.length === 2, "migrated job count");
  assert(
    normalized.assignedJobNames.join(",") === "Joshin②,旧業務",
    "names synced",
  );

  const ledger = [job("Joshin②", "JOB-002")];
  const enriched = enrichPartnerProfileJobs(normalized, ledger);
  const joshin = enriched.assignedJobs.find((j) => j.jobName === "Joshin②");
  assert(joshin?.jobId === "JOB-002", "jobId from ledger");
  const orphan = enriched.assignedJobs.find((j) => j.jobName === "旧業務");
  assert(orphan?.jobId === null, "orphan jobId null");

  const fromNames = jobNamesToAssignedJobs(["トレー搬送"], ledger);
  assert(fromNames[0]?.jobName === "トレー搬送", "name kept");
  assert(fromNames[0]?.jobId === null, "no id without ledger match");

  console.log("OK assignedJobs migration", {
    jobs: enriched.assignedJobs,
  });
}

main();
