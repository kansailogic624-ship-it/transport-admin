import { readFileSync } from "fs";
import XLSX from "xlsx";
import { parseAmazonPerformanceSheet } from "../src/lib/amazon-performance-parser.ts";
import { classifyAmazonRouteType } from "../src/lib/amazon-route-type.ts";

const path =
  "C:/Users/大西本社/OneDrive/デスクトップ/経営/Amazon実績.xlsx";
const wb = XLSX.read(readFileSync(path), { type: "buffer" });
const sheet = wb.Sheets["Sheet1"];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
const parsed = parseAmazonPerformanceSheet(rows);

const mayRows = parsed.filter((r) => r.date.startsWith("2026-05"));
const counts = { "1マン": 0, "2マン": 0, other: 0 };
const misclassified = [];

for (const row of mayRows) {
  const kind = classifyAmazonRouteType(row.routeLabel);
  counts[kind === "other" ? "other" : kind] += 1;
}

console.log("May 2026 rows:", mayRows.length);
console.log("Route type counts:", counts);

const expected = { "1マン": 310, "2マン": 124 };
let ok = true;
for (const [k, v] of Object.entries(expected)) {
  if (counts[k] !== v) {
    console.error(`FAIL: ${k} expected ${v}, got ${counts[k]}`);
    ok = false;
  }
}

// 旧ロジックで 2マン→1マン に落ちていた便名を抽出
const oldIs2Man = (t) => /2マン|2ｔ2マン|２マン/i.test(String(t).trim());
const oldIs1Man = (t) => /1マン|１マン|1ｔ/i.test(String(t).trim());
for (const row of mayRows) {
  const raw = row.routeLabel;
  const newKind = classifyAmazonRouteType(raw);
  const old2 = oldIs2Man(raw);
  const old1 = !old2 && oldIs1Man(raw);
  const oldKind = old2 ? "2マン" : old1 ? "1マン" : "other";
  if (oldKind !== newKind && (newKind === "2マン" || oldKind === "2マン")) {
    misclassified.push({ raw, oldKind, newKind });
  }
}
if (misclassified.length > 0) {
  console.log("Reclassified samples (first 10):");
  console.log(misclassified.slice(0, 10));
}

if (!ok) process.exit(1);
console.log("OK route type counts match expected");
