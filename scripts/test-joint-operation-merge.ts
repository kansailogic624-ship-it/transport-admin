/**
 * 共同業務名寄せロジックの検証
 * npx tsx scripts/test-joint-operation-merge.ts
 */
import { applyJointOperationMerge } from "../src/lib/joint-operation-merge";
import type { DailyRecord, TripEntry } from "../src/lib/types";

function trip(
  id: string,
  vehicle: string,
  shipper: string,
  job: string,
  revenue: string,
  crew: { name: string }[],
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
    crew: crew.map((c) => ({
      id: c.name,
      memberType: "employee" as const,
      name: c.name,
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
    clockIn: "",
    clockOut: "",
    rollCallTime: "",
    reportStatus: "submitted",
    trips,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

const recordA = record(
  "a",
  "2026-05-01",
  "中出真敬",
  [
    trip("t1", "京都400あ52-88", "Amazon", "Amazon HB②", "26500", [
      { name: "中出真敬" },
      { name: "ディンヴィエットダン" },
    ]),
  ],
);

const recordB = record(
  "b",
  "2026-05-01",
  "ディンヴィエットダン",
  [
    trip("t2", "京都400あ52-88", "Amazon", "Amazon HB②", "26500", [
      { name: "ディンヴィエットダン" },
    ]),
  ],
);

const { records, mergedCount } = applyJointOperationMerge(
  [recordA, recordB],
  recordA,
);

console.log("mergedCount:", mergedCount);
console.log("remaining records:", records.length);
console.log("record ids:", records.map((r) => r.driverName));
const merged = records.find((r) => r.driverName === "中出真敬");
console.log("merged revenue:", merged?.trips[0]?.revenue);
console.log(
  "merged crew:",
  merged?.trips[0]?.crew.map((c) => c.name).join(", "),
);

if (mergedCount !== 1) throw new Error("expected 1 merge");
if (records.length !== 1) throw new Error("expected 1 record after merge");
if (merged?.trips[0]?.revenue !== "53000") {
  throw new Error(`expected revenue 53000, got ${merged?.trips[0]?.revenue}`);
}

// 車両番号が異なっても同日・同荷主・同業務なら統合
const recordA2 = record(
  "a2",
  "2026-05-08",
  "藤原大介",
  [
    trip("t3", "京都400あ59-39", "Amazon", "Amazon HB②", "26500", [
      { name: "藤原大介" },
      { name: "ディンヴィエットダン" },
    ]),
  ],
);

const recordB2 = record(
  "b2",
  "2026-05-08",
  "ディンヴィエットダン",
  [
    trip("t4", "", "Amazon", "Amazon HB②", "26500", [
      { name: "ディンヴィエットダン" },
    ]),
  ],
);

const merged2 = applyJointOperationMerge([recordA2, recordB2], recordA2);
const primary2 = merged2.records.find((r) => r.driverName === "藤原大介");
if (merged2.mergedCount !== 1) throw new Error("expected merge without vehicle match");
if (primary2?.trips[0]?.revenue !== "53000") {
  throw new Error(`expected 53000, got ${primary2?.trips[0]?.revenue}`);
}
if (primary2?.trips[0]?.vehicleNumber !== "京都400あ59-39") {
  throw new Error("primary vehicle should be kept");
}

console.log("OK");
