import {
  aggregateVehicleDayKmForMonth,
  recordDailyKm,
} from "../src/lib/trip-utils";
import { normalizeRecord } from "../src/lib/trip-normalize";
import type { DailyRecord } from "../src/lib/types";

/** 寺田さん・5/30相当: 3業務すべて同一メーター220km */
const teradaMay30 = normalizeRecord({
  date: "2026-05-30",
  operationType: "own",
  driverName: "寺田恵昇",
  clockIn: "00:15",
  clockOut: "10:09",
  rollCallTime: "00:15",
  dailyReportSubmitted: true,
  trips: [
    {
      vehicleNumber: "34-88",
      shipperName: "エフピコ",
      jobName: "関西ハブ第一センター",
      startMeter: "378365",
      endMeter: "378585",
      revenue: "50000",
    },
    {
      vehicleNumber: "34-88",
      shipperName: "エフピコ",
      jobName: "東大阪LC",
      startMeter: "378365",
      endMeter: "378585",
      revenue: "40000",
    },
    {
      vehicleNumber: "34-88",
      shipperName: "エフピコ",
      jobName: "久御山回収",
      startMeter: "378365",
      endMeter: "378585",
      revenue: "30000",
    },
  ],
} as Partial<DailyRecord>);

const recordKm = recordDailyKm(teradaMay30);
const { totalKm, vehicleMonthKm } = aggregateVehicleDayKmForMonth(
  [teradaMay30],
  "2026-05",
);

console.log("recordDailyKm:", recordKm);
console.log("month totalKm:", totalKm);
console.log("vehicle 34-88:", vehicleMonthKm.get("34-88"));

const ok =
  recordKm === 220 &&
  totalKm === 220 &&
  vehicleMonthKm.get("34-88") === 220;

console.log(ok ? "\n✓ KM DEDUP OK" : "\n✗ KM DEDUP FAILED");
process.exit(ok ? 0 : 1);
