import { readFileSync } from "fs";
import {
  detectFuelTaxRateFromText,
  parseVehicleSummariesFromBill,
} from "../src/lib/fuel-bill-parser.ts";
import {
  computeFuelBillTaxTotals,
  DEFAULT_FUEL_TAX_RATE,
  resolveFuelTaxRate,
} from "../src/lib/fuel-tax-calc.ts";

const text = readFileSync(
  new URL("./kashima-raw-pdfjs.txt", import.meta.url),
  "utf8",
);

const rate = detectFuelTaxRateFromText(text);
if (rate !== 15) {
  console.error("FAIL: expected PDF rate 15, got", rate);
  process.exit(1);
}

const emptyRate = detectFuelTaxRateFromText("車番計のみのテキスト");
if (emptyRate !== null) {
  console.error("FAIL: expected null for text without tax lines");
  process.exit(1);
}

const resolved = resolveFuelTaxRate("no tax lines", { fuel_tax_rate: 28.5 });
if (resolved.rate !== 28.5 || resolved.source !== "ai") {
  console.error("FAIL: AI rate resolution", resolved);
  process.exit(1);
}

const fallback = resolveFuelTaxRate("no tax lines");
if (fallback.rate !== DEFAULT_FUEL_TAX_RATE || fallback.source !== "default") {
  console.error("FAIL: default fallback", fallback);
  process.exit(1);
}

const rows = parseVehicleSummariesFromBill(text);
const totals = computeFuelBillTaxTotals(rows, rate);
console.log("rate:", rate, "totals:", totals);
console.log("OK");
