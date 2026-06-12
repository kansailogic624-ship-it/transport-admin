/**
 * ドライバー生産性ランキング。
 */

import { buildDriverAnalysis } from "@/lib/dashboard-analytics";
import { driverOnTripCrew } from "@/lib/driver-revenue-share";
import { isPartnerRecord, isPartnerTrip } from "@/lib/run-type";
import { parseTollFee, recordInMonth } from "@/lib/trip-utils";
import type { DailyRecord, MasterData, TripEntry } from "@/lib/types";

export type DriverProductivityRankingRow = {
  rank: number;
  driverName: string;
  totalRevenue: number;
  totalRestraintMinutes: number;
  revenuePerRestraintHour: number;
  profitPerRestraintHour: number;
  netProfit: number;
  operatingDays: number;
};

function driverOnTrip(trip: TripEntry, driverName: string): boolean {
  return driverOnTripCrew(trip, driverName);
}

function tripsForDriver(record: DailyRecord, driverName: string) {
  if (isPartnerRecord(record)) return [];
  const isPrimary = record.driverName.trim() === driverName;
  return record.trips.filter(
    (t) => !isPartnerTrip(t) && (isPrimary || driverOnTrip(t, driverName)),
  );
}

function tollForDriver(
  records: DailyRecord[],
  yearMonth: string,
  driverName: string,
): number {
  const monthRecords = records.filter((r) => recordInMonth(r.date, yearMonth));
  let total = 0;
  for (const record of monthRecords) {
    for (const trip of tripsForDriver(record, driverName)) {
      total += parseTollFee(trip.tollFee);
    }
  }
  return total;
}

export function buildDriverProductivityRankings(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
): DriverProductivityRankingRow[] {
  const driverRows = buildDriverAnalysis(records, yearMonth, masters);

  const unsorted = driverRows
    .filter((row) => row.operatingDays > 0)
    .map((row) => {
      const toll = tollForDriver(records, yearMonth, row.driverName);
      const netProfit = row.totalRevenue - row.totalLaborCost - toll;
      const restraintHours = row.totalRestraintMinutes / 60;
      const revenuePerRestraintHour =
        restraintHours > 0 ? row.totalRevenue / restraintHours : 0;
      const profitPerRestraintHour =
        restraintHours > 0 ? netProfit / restraintHours : 0;

      return {
        driverName: row.driverName,
        totalRevenue: row.totalRevenue,
        totalRestraintMinutes: row.totalRestraintMinutes,
        revenuePerRestraintHour,
        profitPerRestraintHour,
        netProfit,
        operatingDays: row.operatingDays,
      };
    });

  const sorted = [...unsorted].sort(
    (a, b) => b.revenuePerRestraintHour - a.revenuePerRestraintHour,
  );

  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}
