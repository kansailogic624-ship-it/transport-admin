import {
  planVehicleMasterEdit,
  rewriteVehicleNumberInRecords,
} from "../src/lib/vehicle-master-merge.ts";

const vehicles = ["京都100い84-73", "84-99", "60-30"];

const mergePlan = planVehicleMasterEdit(vehicles, "84-73", "京都100い84-73");
if (!mergePlan || mergePlan.mode !== "merge") {
  console.error("FAIL merge plan", mergePlan);
  process.exit(1);
}
if (mergePlan.mergeTo !== "京都100い84-73") {
  console.error("FAIL merge target");
  process.exit(1);
}
if (mergePlan.vehicles.includes("84-73")) {
  console.error("FAIL duplicate not removed");
  process.exit(1);
}

const records = [
  {
    id: "1",
    date: "2026-05-01",
    driverName: "テスト",
    operationType: "own",
    trips: [
      {
        id: "t1",
        runType: "own",
        vehicleNumber: "84-73",
        shipperName: "A",
        jobName: "",
        revenue: "1000",
        tollFee: "",
        startMeter: "",
        endMeter: "",
        crew: [],
        partnerName: "",
        partnerFee: "",
      },
    ],
    createdAt: "",
    clockIn: "",
    clockOut: "",
    rollCallTime: "",
    reportStatus: "submitted",
  },
];

const { records: next, updatedTripCount } = rewriteVehicleNumberInRecords(
  records,
  "84-73",
  "京都100い84-73",
);
if (updatedTripCount !== 1 || next[0].trips[0].vehicleNumber !== "京都100い84-73") {
  console.error("FAIL rewrite", updatedTripCount, next[0]?.trips[0]?.vehicleNumber);
  process.exit(1);
}

// Need to add 84-73 to vehicles for merge test - plan uses vehicles without 84-73
const vehicles2 = ["京都100い84-73", "84-73"];
const mergePlan2 = planVehicleMasterEdit(vehicles2, "84-73", "京都100い84-73");
if (!mergePlan2 || mergePlan2.mode !== "merge") {
  console.error("FAIL merge plan 2", mergePlan2);
  process.exit(1);
}

console.log("OK");
