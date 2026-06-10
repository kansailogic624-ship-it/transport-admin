import {
  enumerateIsoDates,
  missingScheduleDatesForDriver,
} from "../src/lib/schedule-gap-detection";
import type { DailyRecord } from "../src/lib/types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(
  enumerateIsoDates("2026-05-01", "2026-05-03").join(",") ===
    "2026-05-01,2026-05-02,2026-05-03",
  "enumerateIsoDates",
);

const records: DailyRecord[] = [
  {
    id: "1",
    date: "2026-05-01",
    operationType: "own",
    driverName: "坪田孝之",
    clockIn: "08:00",
    clockOut: "17:00",
    rollCallTime: "",
    reportStatus: "submitted",
    trips: [{ id: "t1", runType: "own", vehicleNumber: "6-00", shipperName: "A", jobName: "便", revenue: "10000", tollFee: "", startMeter: "", endMeter: "", crew: [], partnerName: "", partnerFee: "" }],
    createdAt: "2026-05-01",
  },
  {
    id: "2",
    date: "2026-05-03",
    operationType: "own",
    driverName: "坪田孝之",
    clockIn: "08:00",
    clockOut: "17:00",
    rollCallTime: "",
    reportStatus: "submitted",
    trips: [{ id: "t2", runType: "own", vehicleNumber: "6-00", shipperName: "A", jobName: "便", revenue: "10000", tollFee: "", startMeter: "", endMeter: "", crew: [], partnerName: "", partnerFee: "" }],
    createdAt: "2026-05-03",
  },
  {
    id: "3",
    date: "2026-05-06",
    operationType: "own",
    driverName: "坪田孝之",
    clockIn: "",
    clockOut: "",
    rollCallTime: "",
    reportStatus: "not_required",
    dayStatus: "公休",
    trips: [],
    createdAt: "2026-05-06",
  },
  {
    id: "4",
    date: "2026-05-08",
    operationType: "own",
    driverName: "坪田孝之",
    clockIn: "08:00",
    clockOut: "17:00",
    rollCallTime: "",
    reportStatus: "submitted",
    trips: [{ id: "t4", runType: "own", vehicleNumber: "6-00", shipperName: "A", jobName: "便", revenue: "10000", tollFee: "", startMeter: "", endMeter: "", crew: [], partnerName: "", partnerFee: "" }],
    createdAt: "2026-05-08",
  },
];

const missing = missingScheduleDatesForDriver(records, "2026-05", "坪田孝之");
assert(missing.includes("2026-05-02"), "5/2 missing");
assert(missing.includes("2026-05-04"), "5/4 missing");
assert(missing.includes("2026-05-05"), "5/5 missing");
assert(missing.includes("2026-05-07"), "5/7 missing");
assert(!missing.includes("2026-05-06"), "公休日は欠落扱いにしない");
assert(!missing.includes("2026-05-09"), "max日より後は含めない");

console.log("test-schedule-gap: OK", missing);
