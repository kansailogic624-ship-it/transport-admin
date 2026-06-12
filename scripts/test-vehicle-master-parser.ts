/**
 * npm run test:vehicle-master
 */
import * as fs from "node:fs";
import * as XLSX from "xlsx";
import { parseVehicleMasterSheet } from "../src/lib/vehicle-master-parser";
import { isVehicleActive } from "../src/lib/vehicle-ledger-utils";

const defaultPath =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/車両マスタ.xlsx";

const filePath = process.argv[2] ?? defaultPath;

if (!fs.existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
const ws = wb.Sheets[wb.SheetNames[0]!]!;
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

const { vehicles, warnings } = parseVehicleMasterSheet(rows);
const active = vehicles.filter(isVehicleActive).length;

console.log("parsed", vehicles.length, "vehicles");
console.log("active", active, "scrapped", vehicles.length - active);
if (vehicles[0]) {
  console.log("sample", JSON.stringify(vehicles[0], null, 2));
}
if (warnings.length > 0) {
  console.log("warnings", warnings);
}

if (vehicles.length < 1) {
  process.exit(1);
}
