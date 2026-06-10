import {
  extractVehicleLast4,
  isSameVehicle,
  resolveVehicleMasterLabel,
} from "../src/lib/import-match-keys.ts";
import {
  applyVehicleUpgradesToRecords,
  upsertVehicleInMaster,
} from "../src/lib/vehicle-import-merge.ts";

const a = "59-39";
const b = "京都400あ59-39";
if (!isSameVehicle(a, b)) {
  console.error("FAIL isSameVehicle 59-39 vs 京都400あ59-39");
  process.exit(1);
}
if (extractVehicleLast4(a) !== "5939" || extractVehicleLast4(b) !== "5939") {
  console.error("FAIL extractVehicleLast4");
  process.exit(1);
}

let vehicles = ["59-39", "96-57"];
const roll = upsertVehicleInMaster(vehicles, "京都400あ59-39", "rollcall");
if (!roll.upgrade || roll.upgrade.to !== "京都400あ59-39") {
  console.error("FAIL rollcall upsert upgrade", roll);
  process.exit(1);
}
if (roll.vehicles.includes("59-39")) {
  console.error("FAIL short plate should be removed from master");
  process.exit(1);
}

const fm = upsertVehicleInMaster(roll.vehicles, "59-39", "filemaker");
if (fm.vehicles.length !== roll.vehicles.length) {
  console.error("FAIL filemaker should not add duplicate short plate");
  process.exit(1);
}

const label = resolveVehicleMasterLabel("59-39", roll.vehicles);
if (label !== "京都400あ59-39") {
  console.error("FAIL resolveVehicleMasterLabel", label);
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
        vehicleNumber: "59-39",
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

const next = applyVehicleUpgradesToRecords(records, [
  { from: "59-39", to: "京都400あ59-39" },
]);
if (next[0].trips[0].vehicleNumber !== "京都400あ59-39") {
  console.error("FAIL record rewrite");
  process.exit(1);
}

console.log("OK");
