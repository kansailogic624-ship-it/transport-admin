import { buildShipperExpenseBreakdown } from "../src/lib/shipper-expense-breakdown.ts";

const b = buildShipperExpenseBreakdown({
  labor: 12000,
  fuel: 8000,
  toll: 3400,
  partner: 5000,
  other: 1600,
});

if (b.total !== 30000 || b.lines.length !== 5) {
  console.error("FAIL breakdown", b);
  process.exit(1);
}
if (!b.lines.some((l) => l.key === "partner" && l.amount === 5000)) {
  console.error("FAIL partner line", b);
  process.exit(1);
}

const b2 = buildShipperExpenseBreakdown({
  labor: 10000,
  fuel: 5000,
  toll: 2000,
  partner: 0,
});

if (b2.lines.length !== 4 || b2.total !== 17000) {
  console.error("FAIL no other", b2);
  process.exit(1);
}

console.log("OK");
