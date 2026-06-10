/**
 * npx tsx scripts/test-shipper-marginal-profit.ts
 */
import { buildShipperJobAnalysis } from "../src/lib/dashboard-analytics";
import {
  enrichShipperJobMarginalProfit,
  sortShipperAnalysisRows,
} from "../src/lib/shipper-marginal-profit";
import type { DailyRecord, MasterData, TripEntry } from "../src/lib/types";

function trip(
  id: string,
  shipper: string,
  job: string,
  revenue: string,
  toll: string,
): TripEntry {
  return {
    id,
    runType: "own",
    vehicleNumber: "84-73",
    shipperName: shipper,
    jobName: job,
    revenue,
    tollFee: toll,
    startMeter: "",
    endMeter: "",
    crew: [{ id: "d", memberType: "employee", name: "テスト", dailyCost: "" }],
    partnerName: "",
    partnerFee: "",
  };
}

function record(date: string, trips: TripEntry[]): DailyRecord {
  return {
    id: date,
    date,
    operationType: "own",
    driverName: "テスト",
    clockIn: "06:00",
    clockOut: "18:00",
    rollCallTime: "",
    reportStatus: "submitted",
    trips,
    createdAt: "",
  };
}

const masters: MasterData = {
  shippers: ["A", "B"],
  shipperJobs: {},
  drivers: [],
  vehicles: [],
  partners: [],
  employeeSalaries: {},
};

const records = [
  record("2026-05-01", [
    trip("t1", "A", "JobHigh", "100000", "5000"),
  ]),
  record("2026-05-02", [
    trip("t2", "A", "JobHigh", "100000", "5000"),
  ]),
  record("2026-05-03", [
    trip("t3", "B", "JobLow", "20000", "8000"),
  ]),
];

const base = buildShipperJobAnalysis(records, "2026-05", masters);
const enriched = enrichShipperJobMarginalProfit(base, 30000);

const jobLow = enriched
  .find((s) => s.shipperName === "B")
  ?.jobs.find((j) => j.jobName === "JobLow");
const jobHigh = enriched
  .find((s) => s.shipperName === "A")
  ?.jobs.find((j) => j.jobName === "JobHigh");

if (!jobLow || !jobHigh) throw new Error("jobs missing");
if (jobLow.netProfitPerTrip! >= jobHigh.netProfitPerTrip!) {
  throw new Error("JobLow should be worse per trip");
}

const worst = sortShipperAnalysisRows(enriched, "worstPerTrip");
if (worst[0]!.shipperName !== "B") {
  throw new Error("B should be first in worst sort");
}

console.log("OK", {
  jobHighPerTrip: jobHigh.netProfitPerTrip,
  jobLowPerTrip: jobLow.netProfitPerTrip,
});
