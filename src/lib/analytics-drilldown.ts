import { normalizeDriverName } from "./driving-report-parser";
import { resolveVehicleMasterLabel } from "./import-match-keys";
import { isPartnerTrip } from "./run-type";
import { isExcludedFromVehicleCostAggregation } from "./vehicle-cost-exclude";
import {
  normalizeJobNameForAggregation,
  tripJobLabelForAggregation,
} from "./task-name-normalize";
import {
  normalizeKey,
  parseRevenue,
  recordInMonth,
} from "./trip-utils";
import type { DailyRecord, TripEntry } from "./types";

export type AnalyticsTripLine = {
  recordId: string;
  tripId: string;
  date: string;
  driverName: string;
  /** 乗務員2以降（ツーマン運行の副乗務員） */
  coDriverName?: string;
  shipperName: string;
  jobName: string;
  vehicleNumber: string;
  revenue: number;
};

function coDriverLabel(trip: TripEntry, recordDriverName: string): string | undefined {
  if (isPartnerTrip(trip) || trip.crew.length < 2) return undefined;
  const names = trip.crew
    .slice(1)
    .map((member) => member.name.trim())
    .filter(Boolean);
  if (names.length === 0) return undefined;
  const primaryKey = normalizeDriverName(recordDriverName);
  const filtered = names.filter(
    (name) => normalizeDriverName(name) !== primaryKey,
  );
  return (filtered.length > 0 ? filtered : names).join("、");
}

export function collectTripsForVehicle(
  records: DailyRecord[],
  yearMonth: string,
  vehicleLabel: string,
  masterVehicles: string[],
): AnalyticsTripLine[] {
  const lines: AnalyticsTripLine[] = [];

  for (const record of records.filter((r) => recordInMonth(r.date, yearMonth))) {
    for (const trip of record.trips) {
      if (isPartnerTrip(trip)) continue;
      if (isExcludedFromVehicleCostAggregation(trip)) continue;
      const label = resolveVehicleMasterLabel(
        trip.vehicleNumber,
        masterVehicles,
      );
      if (label !== vehicleLabel) continue;
      lines.push(toTripLine(record, trip));
    }
  }

  return lines.sort(
    (a, b) => a.date.localeCompare(b.date) || a.tripId.localeCompare(b.tripId),
  );
}

export function collectTripsForShipperJob(
  records: DailyRecord[],
  yearMonth: string,
  shipperName: string,
  jobName: string | null,
): AnalyticsTripLine[] {
  const lines: AnalyticsTripLine[] = [];

  for (const record of records.filter((r) => recordInMonth(r.date, yearMonth))) {
    for (const trip of record.trips) {
      if (isPartnerTrip(trip)) continue;

      const shipper = normalizeKey(trip.shipperName, "（荷主未入力）");
      if (shipper !== shipperName) continue;

      if (jobName) {
        const job = normalizeKey(
          normalizeJobNameForAggregation(tripJobLabelForAggregation(trip)),
          "（業務未設定）",
        );
        if (job !== jobName) continue;
      }

      lines.push(toTripLine(record, trip));
    }
  }

  return lines.sort(
    (a, b) => a.date.localeCompare(b.date) || a.tripId.localeCompare(b.tripId),
  );
}

function toTripLine(record: DailyRecord, trip: TripEntry): AnalyticsTripLine {
  return {
    recordId: record.id,
    tripId: trip.id,
    date: record.date,
    driverName: record.driverName,
    coDriverName: coDriverLabel(trip, record.driverName),
    shipperName: trip.shipperName?.trim() || "—",
    jobName:
      trip.jobName?.trim() ||
      trip.linkedDispatchName?.trim() ||
      "—",
    vehicleNumber: trip.vehicleNumber ?? "",
    revenue: parseRevenue(trip.revenue),
  };
}

export type AnalyticsTripPatch = {
  vehicleNumber?: string;
  revenue?: string;
  shipperName?: string;
  jobName?: string;
  date?: string;
  driverName?: string;
};

export function patchAnalyticsTripLine(
  records: DailyRecord[],
  recordId: string,
  tripId: string,
  patch: AnalyticsTripPatch,
): DailyRecord[] {
  return records.map((record) => {
    if (record.id !== recordId) return record;

    const nextRecord: DailyRecord = {
      ...record,
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.driverName !== undefined
        ? { driverName: patch.driverName }
        : {}),
      trips: record.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        return {
          ...trip,
          ...(patch.vehicleNumber !== undefined
            ? { vehicleNumber: patch.vehicleNumber }
            : {}),
          ...(patch.revenue !== undefined ? { revenue: patch.revenue } : {}),
          ...(patch.shipperName !== undefined
            ? { shipperName: patch.shipperName }
            : {}),
          ...(patch.jobName !== undefined ? { jobName: patch.jobName } : {}),
        };
      }),
    };

    return nextRecord;
  });
}
