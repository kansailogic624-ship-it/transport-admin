/**
 * ツーマン運行の売上按分検証
 * npx tsx scripts/test-driver-revenue-share.ts
 */
import { buildDriverDayDetailRows, buildDriverMonthSummaries } from "../src/lib/driver-monthly-detail";
import { buildShipperJobAnalysis } from "../src/lib/dashboard-analytics";
import { driverShareRevenue } from "../src/lib/driver-revenue-share";
import type { DailyRecord, MasterData, TripEntry } from "../src/lib/types";

function trip(
  id: string,
  vehicle: string,
  revenue: string,
  crew: string[],
): TripEntry {
  return {
    id,
    runType: "own",
    vehicleNumber: vehicle,
    shipperName: "Amazon",
    jobName: "Amazon HB②",
    revenue,
    tollFee: "0",
    startMeter: "",
    endMeter: "",
    crew: crew.map((name) => ({
      id: name,
      memberType: "employee" as const,
      name,
      dailyCost: "",
    })),
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
    clockIn: "06:00",
    clockOut: "18:00",
    rollCallTime: "",
    reportStatus: "submitted",
    trips,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

const merged = record("a", "2026-05-02", "ディンヴィエットダン", [
  trip("t1", "京都100い84-73", "53000", [
    "ディンヴィエットダン",
    "駒阪大介",
  ]),
]);

const masters: MasterData = {
  shippers: ["Amazon"],
  shipperJobs: { Amazon: ["Amazon HB②"] },
  drivers: [],
  vehicles: ["京都100い84-73"],
  partners: [],
  employeeSalaries: {},
};

const share = driverShareRevenue(merged.trips[0]!);
if (share !== 26500) throw new Error(`expected 26500 share, got ${share}`);

const summaries = buildDriverMonthSummaries([merged], "2026-05");
const primary = summaries.find((s) => s.driverName === "ディンヴィエットダン");
const co = summaries.find((s) => s.driverName === "駒阪大介");
if (primary?.totalRevenue !== 26500) {
  throw new Error(`primary total ${primary?.totalRevenue}`);
}
if (co?.totalRevenue !== 26500) {
  throw new Error(`co-driver total ${co?.totalRevenue}`);
}

const dayRows = buildDriverDayDetailRows([merged], "2026-05", "駒阪大介");
const day = dayRows.find((r) => r.date === "2026-05-02");
if (day?.revenue !== 26500) {
  throw new Error(`co-driver day revenue ${day?.revenue}`);
}

const shipperRows = buildShipperJobAnalysis([merged], "2026-05", masters);
const amazon = shipperRows.find((r) => r.shipperName === "Amazon");
const job = amazon?.jobs[0];
if (job?.totalRevenue !== 53000) {
  throw new Error(`shipper revenue should stay 53000, got ${job?.totalRevenue}`);
}

console.log("OK driver split + shipper full");
