import type { DailyRecord, TripEntry } from "./types";

export function isPartnerTrip(trip: TripEntry): boolean {
  return trip.runType === "partner";
}

export function isPartnerRecord(record: DailyRecord): boolean {
  if (record.operationType === "partner") return true;
  return (
    record.trips.length > 0 && record.trips.every((t) => t.runType === "partner")
  );
}

export function hasOwnTrip(record: DailyRecord): boolean {
  return record.trips.some((t) => t.runType !== "partner");
}
