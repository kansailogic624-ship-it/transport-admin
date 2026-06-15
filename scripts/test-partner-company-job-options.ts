/**
 * 協力会社業務候補・コース連携テスト
 * npx tsx scripts/test-partner-company-job-options.ts
 */
import {
  buildPartnerJobOptions,
  courseIdsForJobNames,
  orphanSelectedJobNames,
} from "../src/lib/partner-company-job-options";
import type { JobDetail } from "../src/lib/types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function job(name: string, shipper = "テスト荷主"): JobDetail {
  return {
    id: name,
    jobId: name,
    shipperName: shipper,
    jobName: name,
    revenue: 10000,
    priceHistory: [],
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

function main() {
  const empty = buildPartnerJobOptions([]);
  assert(empty.length >= 6, "compat jobs when ledger empty");
  assert(
    empty.some((o) => o.jobName === "Joshin②" && o.source === "shiga_compat"),
    "Joshin② compat",
  );

  const withLedger = buildPartnerJobOptions([
    job("Joshin②", "エフピコ"),
    job("トレー搬送", "エフピコ"),
  ]);
  const joshin = withLedger.find((o) => o.jobName === "Joshin②");
  assert(joshin?.source === "job_ledger", "ledger wins over compat");
  assert(joshin?.shipperName === "エフピコ", "shipper from ledger");
  assert(
    withLedger.some((o) => o.jobName === "トレー搬送"),
    "general job included",
  );
  assert(
    !withLedger.some(
      (o) => o.jobName === "Joshin②" && o.source === "shiga_compat",
    ),
    "no duplicate Joshin②",
  );

  const courses = courseIdsForJobNames(["Joshin②", "トレー搬送"]);
  assert(courses.length === 1 && courses[0] === "SHIGA_02", "Joshin② course");

  const joshin4 = courseIdsForJobNames(["Joshin⑤"]);
  assert(joshin4[0] === "SHIGA_04", "Joshin⑤ -> SHIGA_04 aggregate");

  const orphans = orphanSelectedJobNames(
    ["旧業務名", "Joshin②"],
    withLedger,
  );
  assert(orphans.length === 1 && orphans[0] === "旧業務名", "orphan kept");

  console.log("OK partner company job options", {
    emptyCount: empty.length,
    ledgerCount: withLedger.length,
    courses,
  });
}

main();
