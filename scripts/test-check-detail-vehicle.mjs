import {
  applyVehicleMeterToTrips,
  extractDriverDayVehicleMeter,
  resolveTripDistanceDisplay,
} from "../src/lib/trip-utils.ts";

const records = [
  {
    id: "1",
    date: "2026-05-01",
    driverName: "串間盛寿",
    operationType: "own",
    trips: [
      {
        id: "t1",
        runType: "own",
        vehicleNumber: "京都100い84-73",
        shipperName: "A",
        jobName: "便1",
        revenue: "1000",
        tollFee: "",
        startMeter: "120000",
        endMeter: "120150",
        crew: [],
        partnerName: "",
        partnerFee: "",
      },
      {
        id: "t2",
        runType: "own",
        vehicleNumber: "京都100い84-73",
        shipperName: "B",
        jobName: "便2",
        revenue: "2000",
        tollFee: "",
        startMeter: "120150",
        endMeter: "120280",
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

const vm = extractDriverDayVehicleMeter(records, ["京都100い84-73"]);
if (vm.vehicleNumber !== "京都100い84-73" || vm.startMeter !== "120000") {
  console.error("FAIL extract", vm);
  process.exit(1);
}
if (vm.endMeter !== "120280" || vm.totalDistanceKm !== 280) {
  console.error("FAIL meter range", vm);
  process.exit(1);
}

if (resolveTripDistanceDisplay("120000", "120280", null) !== "280") {
  console.error("FAIL distance");
  process.exit(1);
}

const patched = applyVehicleMeterToTrips(records[0].trips, {
  vehicleNumber: "84-73",
  startMeter: "1",
  endMeter: "99",
});
if (patched[0].startMeter !== "1" || patched[1].endMeter !== "99") {
  console.error("FAIL apply", patched);
  process.exit(1);
}

console.log("OK");
