import {
  buildVehicleIndexKeys,
  extractPureVehicleDigits,
  extractVehiclePlateSortNumber,
  vehicleIndexKeysOverlap,
} from "../src/lib/import-match-keys";
import {
  buildActiveVehicleSelectOptions,
  filterVehicleSelectOptions,
  findVehicleInOptions,
  hyphenCodeCandidates,
  normalizeVehicleSelectInput,
  sortVehicleSelectOptions,
} from "../src/lib/vehicle-select-options";
import { normalizeVehicleForMaster } from "../src/components/vehicle-plate-select";
import type { VehicleDetail } from "../src/lib/types";

const sampleVehicles: VehicleDetail[] = [
  {
    id: "60-37",
    vehicleId: "60-37",
    vehicleCode: "60-37",
    plateNumber: "京都400あ60-37",
    tonnageDisplay: "",
    vehicleName: "",
    modelType: "",
    inspectionExpiry: "2027-01-01",
    firstYear: "",
    loadCapacity: 0,
    grossWeight: 0,
    registeredDate: "",
    scrappedDate: "",
    updatedAt: "",
  },
  {
    id: "60-30",
    vehicleId: "60-30",
    vehicleCode: "60-30",
    plateNumber: "京都400あ60-30",
    tonnageDisplay: "",
    vehicleName: "",
    modelType: "",
    inspectionExpiry: "2027-01-01",
    firstYear: "",
    loadCapacity: 0,
    grossWeight: 0,
    registeredDate: "",
    scrappedDate: "",
    updatedAt: "",
  },
  {
    id: "dot-600",
    vehicleId: "dot-600",
    vehicleCode: "600",
    plateNumber: "京都400あ・600",
    tonnageDisplay: "",
    vehicleName: "",
    modelType: "",
    inspectionExpiry: "2027-01-01",
    firstYear: "",
    loadCapacity: 0,
    grossWeight: 0,
    registeredDate: "",
    scrappedDate: "",
    updatedAt: "",
  },
  {
    id: "60-00",
    vehicleId: "60-00",
    vehicleCode: "60-00",
    plateNumber: "京都100い60-00",
    tonnageDisplay: "",
    vehicleName: "",
    modelType: "",
    inspectionExpiry: "2027-01-01",
    firstYear: "",
    loadCapacity: 0,
    grossWeight: 0,
    registeredDate: "",
    scrappedDate: "",
    updatedAt: "",
  },
  {
    id: "99",
    vehicleId: "99",
    vehicleCode: "99-01",
    plateNumber: "",
    tonnageDisplay: "",
    vehicleName: "",
    modelType: "",
    inspectionExpiry: "",
    firstYear: "",
    loadCapacity: 0,
    grossWeight: 0,
    registeredDate: "",
    scrappedDate: "2026-01-01",
    updatedAt: "",
  },
];

const options = buildActiveVehicleSelectOptions(sampleVehicles);
if (options.length !== 4) {
  throw new Error(
    `expected 4 options (active only) got ${options.length}: ${options.map((o) => o.label).join(", ")}`,
  );
}

const sorted = sortVehicleSelectOptions(options);
const sortNums = sorted.map((o) => extractVehiclePlateSortNumber(o.label));
for (let i = 1; i < sortNums.length; i++) {
  if (sortNums[i - 1]! > sortNums[i]!) {
    throw new Error(`sort order wrong: ${sorted.map((o) => o.label).join(", ")}`);
  }
}

const opt37 = options.find((o) => o.label.includes("60-37"));
if (!opt37) throw new Error("missing 60-37 vehicle");
if (opt37.label !== "京都400あ60-37") {
  throw new Error(`label should be full plate got ${opt37.label}`);
}
if (options.some((o) => o.label === "60-37")) {
  throw new Error("short code 60-37 must not appear as separate option label");
}

const fromObjects = normalizeVehicleSelectInput(
  sampleVehicles.filter((v) => !v.scrappedDate),
);
if (fromObjects.length !== 4) {
  throw new Error(`normalize objects expected 4 got ${fromObjects.length}`);
}

const vehicles = options;

const by6030 = filterVehicleSelectOptions(options, "6030");
if (by6030.length !== 1 || !by6030[0]!.label.includes("60-30")) {
  throw new Error(`filter 6030 failed: ${by6030.map((o) => o.label).join()}`);
}
const byDash = filterVehicleSelectOptions(options, "60-30");
if (byDash.length !== 1 || !byDash[0]!.label.includes("60-30")) {
  throw new Error(`filter 60-30 failed`);
}

const by600 = filterVehicleSelectOptions(options, "600");
if (by600.length < 1 || !by600.some((o) => o.label.includes("・600"))) {
  throw new Error(
    `filter 600 failed: ${by600.map((o) => o.label).join()}`,
  );
}

const mDot600 = normalizeVehicleForMaster("600", vehicles);
if (mDot600.vehicleNumber !== "京都400あ・600") {
  throw new Error(`600 should match 京都400あ・600 got ${mDot600.vehicleNumber}`);
}
const mDot0600 = normalizeVehicleForMaster("0600", vehicles);
if (mDot0600.vehicleNumber !== "京都400あ・600") {
  throw new Error(`0600 should match 京都400あ・600 got ${mDot0600.vehicleNumber}`);
}
const mFullWidth = normalizeVehicleForMaster("６００", vehicles);
if (mFullWidth.vehicleNumber !== "京都400あ・600") {
  throw new Error(`６００ should match 京都400あ・600 got ${mFullWidth.vehicleNumber}`);
}
if (extractPureVehicleDigits("京都400あ・６００") !== "600") {
  throw new Error("pure digits from fullwidth dot plate failed");
}

const m1 = normalizeVehicleForMaster("6037", vehicles);
if (m1.vehicleNumber !== "京都400あ60-37") {
  throw new Error(`6037 should match 京都400あ60-37 got ${m1.vehicleNumber}`);
}
const m2 = normalizeVehicleForMaster("60-37", vehicles);
if (m2.vehicleNumber !== "京都400あ60-37") {
  throw new Error(`60-37 should resolve to full plate got ${m2.vehicleNumber}`);
}
const m3 = findVehicleInOptions("6030", vehicles);
if (m3 !== "京都400あ60-30") {
  throw new Error(`findVehicleInOptions 6030 failed: ${m3}`);
}

const m0600 = normalizeVehicleForMaster("0600", vehicles);
if (m0600.vehicleNumber !== "京都400あ・600") {
  throw new Error(`0600 should prefer ・600 exact match got ${m0600.vehicleNumber}`);
}

if (!vehicleIndexKeysOverlap("0600", "60-00")) {
  throw new Error("index keys 0600 vs 60-00 should overlap");
}
const keys600 = buildVehicleIndexKeys("600");
if (!keys600.some((k) => k.includes("60") || k === "600" || k === "6000")) {
  throw new Error(`unexpected keys for 600: ${keys600.join(", ")}`);
}

const hy = hyphenCodeCandidates("6037");
if (!hy.includes("60-37")) throw new Error("hyphenCodeCandidates failed");
const hy600 = hyphenCodeCandidates("600");
if (!hy600.includes("60-00")) {
  throw new Error(`600 hyphen candidates missing 60-00: ${hy600.join(", ")}`);
}

console.log("test-vehicle-select-options: OK");
console.log("  sorted:", sorted.map((o) => o.label).join(", "));
console.log("  0600 ->", mDot0600.vehicleNumber);
console.log("  600 ->", mDot600.vehicleNumber);
console.log("  filter 600 ->", by600[0]!.label);
