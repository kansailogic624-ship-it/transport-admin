import { readFileSync } from "fs";
import { parseKashimaFuelBill } from "../src/lib/fuel-bill-parser.ts";

const pdfjsText = readFileSync(
  new URL("./kashima-raw-pdfjs.txt", import.meta.url),
  "utf8",
);

const r = parseKashimaFuelBill(
  pdfjsText,
  "13340-01-20260520-株式会社　カンサイロジック.pdf",
);

console.log("billingMonth:", r.billingMonth);
console.log("vehicle count:", r.vehicles.length);
console.log(
  "total:",
  r.vehicles.reduce((s, v) => s + v.totalAmount, 0),
);
console.log("first 3:", r.vehicles.slice(0, 3));
console.log("amount=2:", r.vehicles.filter((v) => v.totalAmount === 2));
console.log("amount=16744:", r.vehicles.filter((v) => v.totalAmount === 16744));

const formatted = readFileSync(
  new URL("./kashima-formatted-output.txt", import.meta.url),
  "utf8",
);
const r2 = parseKashimaFuelBill(formatted);
console.log("formatted count:", r2.vehicles.length);
