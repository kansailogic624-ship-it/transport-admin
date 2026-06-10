/**
 * npm run test:day-revenue
 */
import { applyDayRevenueToTrips, dailyRevenueFromTrips } from "../src/lib/day-revenue";
import type { TripEntry } from "../src/lib/types";

function trip(revenue: string): TripEntry {
  return {
    id: "1",
    runType: "own",
    vehicleNumber: "1",
    shipperName: "荷主",
    jobName: "個配",
    revenue,
    tollFee: "",
    startMeter: "",
    endMeter: "",
    crew: [],
    partnerName: "",
    partnerFee: "",
  };
}

const thirty = Array.from({ length: 30 }, () => trip("32000"));
const applied = applyDayRevenueToTrips(thirty, "32000");
const total = dailyRevenueFromTrips(applied);

const ok = total === 32000 && applied.filter((t) => t.revenue).length === 1;

console.log("30 trips x 32000 -> daily total:", total);
console.log(ok ? "✓ DAY REVENUE OK" : "✗ FAIL");
process.exit(ok ? 0 : 1);
