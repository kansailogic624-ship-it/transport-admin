/**
 * 稼働台数が日付×業務名のユニーク数になることを検証
 * npx tsx scripts/test-vehicle-day-trip-count.ts
 */
import { buildShipperJobAnalysis } from "../src/lib/dashboard-analytics";
import type { DailyRecord, MasterData, TripEntry } from "../src/lib/types";

function trip(
  id: string,
  vehicle: string,
  shipper: string,
  job: string,
  revenue: string,
  driver: string,
): TripEntry {
  return {
    id,
    runType: "own",
    vehicleNumber: vehicle,
    shipperName: shipper,
    jobName: job,
    revenue,
    tollFee: "0",
    startMeter: "",
    endMeter: "",
    crew: [
      {
        id: driver,
        memberType: "employee",
        name: driver,
        dailyCost: "",
      },
    ],
    partnerName: "",
    partnerFee: "",
  };
}

function record(
  id: string,
  date: string,
  driver: string,
  trips: TripEntry[],
): DailyRecord {
  return {
    id,
    date,
    operationType: "own",
    driverName: driver,
    clockIn: "",
    clockOut: "",
    rollCallTime: "",
    reportStatus: "submitted",
    trips,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

const masters: MasterData = {
  shippers: ["Amazon"],
  shipperJobs: { Amazon: ["Amazon HB②"] },
  drivers: [],
  vehicles: ["京都400あ52-88"],
  partners: [],
  employeeSalaries: {},
};

const duplicateVehicleDay = [
  record("a", "2026-05-01", "中出真敬", [
    trip("t1", "京都400あ52-88", "Amazon", "Amazon HB②", "53000", "中出真敬"),
  ]),
  record("b", "2026-05-01", "ディンヴィエットダン", [
    trip(
      "t2",
      "京都400あ52-88",
      "Amazon",
      "Amazon HB②",
      "26500",
      "ディンヴィエットダン",
    ),
  ]),
];

const rows = buildShipperJobAnalysis(duplicateVehicleDay, "2026-05", masters);
const amazon = rows.find((r) => r.shipperName === "Amazon");
const job = amazon?.jobs.find((j) => j.jobName === "Amazon HB");

if (!job) throw new Error("job not found");
if (job.tripCount !== 1) {
  throw new Error(`expected tripCount 1, got ${job.tripCount}`);
}
if (job.totalRevenue !== 79500) {
  throw new Error(`expected revenue 79500, got ${job.totalRevenue}`);
}

// 車両が異なっても同日・同業務なら1台
const differentVehicle = [
  record("c", "2026-05-08", "藤原大介", [
    trip("t3", "京都400あ59-39", "Amazon", "Amazon HB②", "26500", "藤原大介"),
  ]),
  record("d", "2026-05-08", "ディンヴィエットダン", [
    trip("t4", "", "Amazon", "Amazon HB②", "26500", "ディンヴィエットダン"),
  ]),
];
const rows2 = buildShipperJobAnalysis(differentVehicle, "2026-05", masters);
const job2 = rows2
  .find((r) => r.shipperName === "Amazon")
  ?.jobs.find((j) => j.jobName === "Amazon HB");
if (job2?.tripCount !== 1) {
  throw new Error(`expected 1 for different vehicles, got ${job2?.tripCount}`);
}

console.log("OK tripCount dedup:", job.tripCount);
