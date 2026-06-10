import { buildShipperJobAnalysis } from "../src/lib/dashboard-analytics.ts";

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
        shipperName: "Amazon",
        jobName: "AmazonLP①",
        revenue: "30000",
        tollFee: "",
        startMeter: "",
        endMeter: "",
        crew: [{ id: "c1", memberType: "employee", name: "テスト", dailyCost: "" }],
        partnerName: "",
        partnerFee: "",
      },
      {
        id: "t2",
        runType: "own",
        vehicleNumber: "84-99",
        shipperName: "Amazon",
        jobName: "AmazonLP②",
        revenue: "34000",
        tollFee: "",
        startMeter: "",
        endMeter: "",
        crew: [{ id: "c2", memberType: "employee", name: "テスト", dailyCost: "" }],
        partnerName: "",
        partnerFee: "",
      },
    ],
    createdAt: "",
    clockIn: "06:00",
    clockOut: "18:00",
    rollCallTime: "",
    reportStatus: "submitted",
  },
];

const masters = {
  shippers: ["Amazon"],
  shipperJobs: { Amazon: ["AmazonLP①", "AmazonLP②"] },
  drivers: [],
  vehicles: [],
  partners: [],
  employeeSalaries: {},
};

const rows = buildShipperJobAnalysis(records, "2026-05", masters);
const amazon = rows.find((r) => r.shipperName === "Amazon");
if (!amazon || amazon.jobs.length !== 1) {
  console.error("FAIL merge count", amazon?.jobs);
  process.exit(1);
}
const job = amazon.jobs[0];
if (job.jobName !== "AmazonLP" || job.totalRevenue !== 64000 || job.tripCount !== 1) {
  console.error("FAIL merged job", job);
  process.exit(1);
}

console.log("OK");
