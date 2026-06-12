import { readFileSync } from "fs";
import {
  countShabanKeiBlocks,
  extractShabanKeiBlocksForAi,
  parseKashimaFuelBill,
  parseVehicleSummariesFromBill,
} from "../src/lib/fuel-bill-parser.ts";

const pdfjsText = readFileSync(
  new URL("./kashima-raw-pdfjs.txt", import.meta.url),
  "utf8",
);

const fileName = "13340-01-20260520-株式会社　カンサイロジック.pdf";

const summaries = parseVehicleSummariesFromBill(pdfjsText);
const aiText = extractShabanKeiBlocksForAi(pdfjsText);
console.log("summary count:", summaries.length);
console.log("shabanKei blocks:", countShabanKeiBlocks(pdfjsText));
if (/05\/04\s+9766/.test(aiText)) {
  console.error("FAIL: AI text must not contain daily detail lines");
  process.exit(1);
}
if (!/車番計/.test(aiText) || !/車番:\s*0600/.test(aiText)) {
  console.error("FAIL: AI text missing shabanKei blocks");
  process.exit(1);
}
console.log("first:", summaries[0]);

const v0600 = summaries.find((s) => s.vehicleCode === "0600");
console.log("0600:", v0600);

const r = parseKashimaFuelBill(pdfjsText, fileName);
console.log("billingMonth:", r.billingMonth);
console.log("vehicles:", r.vehicles.length);
console.log(
  "total:",
  r.vehicles.reduce((s, v) => s + v.totalAmount, 0),
);

const formatted = readFileSync(
  new URL("./kashima-formatted-output.txt", import.meta.url),
  "utf8",
);
const r2 = parseKashimaFuelBill(formatted);
console.log("formatted count:", r2.vehicles.length);

if (summaries.length < 20) {
  console.error("FAIL: expected 20+ vehicle summaries");
  process.exit(1);
}
if (!v0600 || v0600.totalAmount !== 221202) {
  console.error("FAIL: 0600 amount expected 221202, got", v0600);
  process.exit(1);
}
if (!v0600 || Math.abs(v0600.totalQuantity - 1643.4) > 0.01) {
  console.error("FAIL: 0600 quantity expected 1643.4, got", v0600?.totalQuantity);
  process.exit(1);
}
console.log("OK");
