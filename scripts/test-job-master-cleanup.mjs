import {
  cleanupImportedJobMasterNoise,
  collectKnownFileMakerJobs,
  collectReportDerivedJobNames,
  isLegitimateRegisteredJob,
  looksLikePersonalDeliveryLabel,
} from "../src/lib/job-master-cleanup.ts";

const fmDispatches = [
  {
    shipperName: "エフピコ",
    dispatchName: "選別ロング",
    driverName: "",
    vehicleNumber: "",
    date: "2026-05-01",
    revenue: "10000",
    tollFee: "",
    sourceFileName: "fm.xlsx",
    warnings: [],
  },
];

if (!looksLikePersonalDeliveryLabel("いしだ")) {
  console.error("FAIL personal label");
  process.exit(1);
}
if (looksLikePersonalDeliveryLabel("選別ロング")) {
  console.error("FAIL course name flagged as personal");
  process.exit(1);
}

const reportRecords = [
  {
    id: "1",
    date: "2026-05-01",
    driverName: "テスト",
    operationType: "own",
    trips: [
      {
        id: "t1",
        runType: "own",
        shipperName: "マナベインテリアハーツ",
        jobName: "いしだ",
        revenue: "",
        tollFee: "",
        vehicleNumber: "",
        startMeter: "",
        endMeter: "",
        crew: [],
        partnerName: "",
        partnerFee: "",
      },
      {
        id: "t2",
        runType: "own",
        shipperName: "エフピコ",
        jobName: "京都①",
        revenue: "",
        tollFee: "",
        vehicleNumber: "",
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

const reportDerived = collectReportDerivedJobNames(reportRecords);
if (!reportDerived.get("マナベインテリアハーツ")?.has("いしだ")) {
  console.error("FAIL report derived");
  process.exit(1);
}

if (
  isLegitimateRegisteredJob(
    "マナベインテリアハーツ",
    "いしだ",
    new Map(),
    reportDerived,
  )
) {
  console.error("FAIL junk should be illegitimate");
  process.exit(1);
}

if (
  !isLegitimateRegisteredJob("エフピコ", "選別ロング", collectKnownFileMakerJobs({ fmDispatches }), reportDerived)
) {
  console.error("FAIL FM job should stay when in FM");
  process.exit(1);
}

const { removed } = cleanupImportedJobMasterNoise(
  {
    shippers: ["マナベインテリアハーツ", "エフピコ"],
    shipperJobs: {
      マナベインテリアハーツ: ["いしだ", "安村様", "山本"],
      エフピコ: ["選別ロング", "京都①", "久御山C①"],
    },
    drivers: [],
    partners: [],
    vehicles: [],
    employeeSalaries: {},
    mappingRules: [],
  },
  { fmDispatches, records: reportRecords },
);

const removedSet = new Set(removed.map((r) => `${r.shipper}/${r.job}`));
for (const expect of [
  "マナベインテリアハーツ/いしだ",
  "マナベインテリアハーツ/安村様",
  "マナベインテリアハーツ/山本",
  "エフピコ/京都①",
  "エフピコ/久御山C①",
]) {
  if (!removedSet.has(expect)) {
    console.error("FAIL missing removal", expect, removed);
    process.exit(1);
  }
}
if (removedSet.has("エフピコ/選別ロング")) {
  console.error("FAIL FM job removed", removed);
  process.exit(1);
}

console.log("OK", removed.length, "removed");
