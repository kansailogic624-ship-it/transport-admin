import {
  normalizeVehicleNumber,
  vehiclesMatch,
  resolveVehicleMasterLabel,
} from "../src/lib/import-match-keys.ts";

const a = "(京都100い84-73)";
const b = "京都100い84-73";
const c = "京都100い84－73";

if (normalizeVehicleNumber(a) !== normalizeVehicleNumber(b)) {
  console.error("FAIL parens", normalizeVehicleNumber(a), normalizeVehicleNumber(b));
  process.exit(1);
}
if (!vehiclesMatch(a, b)) {
  console.error("FAIL vehiclesMatch");
  process.exit(1);
}
if (!vehiclesMatch(b, c)) {
  console.error("FAIL fullwidth hyphen");
  process.exit(1);
}

const masters = ["京都100い84-73"];
const resolved = resolveVehicleMasterLabel(a, masters);
if (resolved !== "京都100い84-73") {
  console.error("FAIL resolve", resolved);
  process.exit(1);
}

console.log("OK");
