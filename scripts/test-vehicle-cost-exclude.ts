/**
 * 事務所・倉庫業務の車両コスト集計除外検証
 * npx tsx scripts/test-vehicle-cost-exclude.ts
 */
import { collectTripsForVehicle } from "../src/lib/analytics-drilldown";
import { buildVehicleCostBreakdown } from "../src/lib/dashboard-analytics";
import { isExcludedFromVehicleCostAggregation } from "../src/lib/vehicle-cost-exclude";
import type { DailyRecord, MasterData, TripEntry } from "../src/lib/types";

function trip(
  id: string,
  shipper: string,
  job: string,
  revenue: string,
  vehicle = "",
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
        id: "d1",
        memberType: "employee",
        name: "山田太郎",
        dailyCost: "",
      },
    ],
    partnerName: "",
    partnerFee: "",
  };
}

function record(id: string, date: string, trips: TripEntry[]): DailyRecord {
  return {
    id,
    date,
    operationType: "own",
    driverName: "山田太郎",
    clockIn: "08:00",
    clockOut: "17:00",
    rollCallTime: "",
    reportStatus: "submitted",
    trips,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

const officeTrip = trip("o1", "ニトリ", "ニトリ滋賀事務所", "24875");
const warehouseTrip = trip("w1", "カンロジ", "カンロジ京都倉庫", "24875");
const deliveryTrip = trip("d1", "Amazon", "宅配滋賀②", "53000", "京都100い84-73");

if (!isExcludedFromVehicleCostAggregation(officeTrip)) {
  throw new Error("office trip should be excluded");
}
if (!isExcludedFromVehicleCostAggregation(warehouseTrip)) {
  throw new Error("warehouse trip should be excluded");
}
if (isExcludedFromVehicleCostAggregation(deliveryTrip)) {
  throw new Error("delivery trip should not be excluded");
}

const records = [
  record("r1", "2026-05-10", [officeTrip, warehouseTrip, deliveryTrip]),
];

const masters: MasterData = {
  shippers: ["ニトリ", "カンロジ", "Amazon"],
  shipperJobs: {
    ニトリ: ["ニトリ滋賀事務所"],
    カンロジ: ["カンロジ京都倉庫"],
    Amazon: ["宅配滋賀②"],
  },
  drivers: [],
  vehicles: ["京都100い84-73"],
  partners: [],
  employeeSalaries: {},
};

const rows = buildVehicleCostBreakdown(
  records,
  "2026-05",
  masters,
  new Map(),
  new Map(),
);

const unassigned = rows.find((r) => r.vehicleNumber === "（車両未入力）");
if (unassigned) {
  throw new Error(
    `（車両未入力） should be absent, got revenue ${unassigned.totalRevenue}`,
  );
}

const truck = rows.find((r) => r.vehicleNumber === "京都100い84-73");
if (!truck || truck.totalRevenue !== 53000) {
  throw new Error(`expected truck revenue 53000, got ${truck?.totalRevenue}`);
}

const unassignedLines = collectTripsForVehicle(
  records,
  "2026-05",
  "（車両未入力）",
  masters.vehicles,
);
if (unassignedLines.length !== 0) {
  throw new Error(`expected 0 unassigned drilldown lines, got ${unassignedLines.length}`);
}

const truckLines = collectTripsForVehicle(
  records,
  "2026-05",
  "京都100い84-73",
  masters.vehicles,
);
if (truckLines.length !== 1 || truckLines[0]?.jobName !== "宅配滋賀②") {
  throw new Error("truck drilldown should contain only delivery trip");
}

console.log("test-vehicle-cost-exclude: OK");
