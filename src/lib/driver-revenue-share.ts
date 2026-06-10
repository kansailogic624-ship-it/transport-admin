import { normalizeDriverName } from "./driving-report-parser";
import { isPartnerTrip } from "./run-type";
import { parseRevenue } from "./trip-utils";
import type { TripEntry } from "./types";

/** ツーマン運行（乗務員2名以上）かどうか */
export function isJointOperationTrip(trip: TripEntry): boolean {
  if (isPartnerTrip(trip)) return false;
  return trip.crew.filter((member) => member.name.trim()).length >= 2;
}

/** 売上按分の母数（共同乗務員の人数。単独運行は1） */
export function jointCrewShareCount(trip: TripEntry): number {
  if (!isJointOperationTrip(trip)) return 1;
  return trip.crew.filter((member) => member.name.trim()).length;
}

/**
 * ドライバー個人実績用の売上（ツーマン運行時は乗務員数で均等按分）。
 * 荷主・車両の全体集計には使わないこと。
 */
export function driverShareRevenue(trip: TripEntry): number {
  const revenue = parseRevenue(trip.revenue);
  if (revenue <= 0) return 0;
  const shares = jointCrewShareCount(trip);
  return Math.round(revenue / shares);
}

export function driverOnTripCrew(trip: TripEntry, driverName: string): boolean {
  if (isPartnerTrip(trip)) return false;
  const key = normalizeDriverName(driverName);
  if (!key) return false;
  return trip.crew.some(
    (member) =>
      member.name.trim() &&
      normalizeDriverName(member.name) === key,
  );
}
