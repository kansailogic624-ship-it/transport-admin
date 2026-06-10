import { normalizeDriverName } from "./driving-report-parser";
import { isPartnerTrip } from "./run-type";
import { normalizeRecord } from "./trip-normalize";
import { normalizeKey, parseRevenue, parseTollFee } from "./trip-utils";
import type { DailyRecord, TripCrewMember, TripEntry } from "./types";

export type JointOperationMergeResult = {
  records: DailyRecord[];
  /** 統合した副乗務員レコードの件数 */
  mergedCount: number;
};

function cloneTrip(trip: TripEntry): TripEntry {
  return {
    ...trip,
    crew: trip.crew.map((m) => ({ ...m })),
  };
}

/** 日付は呼び出し側で照合。ここでは荷主・業務名のみ一致すれば統合対象。 */
function tripsMatchForJointMerge(a: TripEntry, b: TripEntry): boolean {
  if (isPartnerTrip(a) || isPartnerTrip(b)) return false;

  const shipperA = normalizeKey(a.shipperName, "");
  const shipperB = normalizeKey(b.shipperName, "");
  if (!shipperA || shipperA !== shipperB) return false;

  const jobA = normalizeKey(a.jobName || a.linkedDispatchName || "", "");
  const jobB = normalizeKey(b.jobName || b.linkedDispatchName || "", "");
  if (!jobA || jobA !== jobB) return false;

  return true;
}

function sumRevenueField(a: string, b: string): string {
  const total = parseRevenue(a) + parseRevenue(b);
  return total > 0 ? String(total) : "";
}

function sumTollField(a: string, b: string): string {
  const total = parseTollFee(a) + parseTollFee(b);
  return total > 0 ? String(total) : "";
}

function pickMinMeter(a: string, b: string): string {
  const na = Number(a);
  const nb = Number(b);
  if (a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb)) {
    return String(Math.min(na, nb));
  }
  return a || b;
}

function pickMaxMeter(a: string, b: string): string {
  const na = Number(a);
  const nb = Number(b);
  if (a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb)) {
    return String(Math.max(na, nb));
  }
  return a || b;
}

function mergeCrewMembers(
  primary: TripCrewMember[],
  secondary: TripCrewMember[],
  primaryDriverName: string,
): TripCrewMember[] {
  const seen = new Set<string>();
  const out: TripCrewMember[] = [];

  const add = (member: TripCrewMember) => {
    const key = normalizeDriverName(member.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...member });
  };

  const primaryKey = normalizeDriverName(primaryDriverName);
  const primaryMember =
    primary.find((m) => normalizeDriverName(m.name) === primaryKey) ??
    primary[0];
  if (primaryMember) add(primaryMember);

  for (const member of primary) add(member);
  for (const member of secondary) add(member);

  return out;
}

function mergeTripPair(
  tripA: TripEntry,
  tripB: TripEntry,
  primaryDriverName: string,
): TripEntry {
  return {
    ...tripA,
    vehicleNumber: tripA.vehicleNumber,
    revenue: sumRevenueField(tripA.revenue, tripB.revenue),
    tollFee: sumTollField(tripA.tollFee, tripB.tollFee),
    startMeter: pickMinMeter(tripA.startMeter, tripB.startMeter),
    endMeter: pickMaxMeter(tripA.endMeter, tripB.endMeter),
    crew: mergeCrewMembers(tripA.crew, tripB.crew, primaryDriverName),
  };
}

function getAdditionalCrewNames(trip: TripEntry): string[] {
  if (isPartnerTrip(trip) || trip.crew.length < 2) return [];
  return trip.crew
    .slice(1)
    .map((member) => member.name.trim())
    .filter(Boolean);
}

export function recordHasJointCrew(record: DailyRecord): boolean {
  return record.trips.some((trip) => getAdditionalCrewNames(trip).length > 0);
}

type MergeCandidate = {
  recordB: DailyRecord;
  tripBIndex: number;
};

function findMergeCandidate(
  allRecords: DailyRecord[],
  recordA: DailyRecord,
  tripA: TripEntry,
  additionalCrewName: string,
  removeIds: Set<string>,
  patches: Map<string, DailyRecord>,
): MergeCandidate | null {
  const crewKey = normalizeDriverName(additionalCrewName);
  if (!crewKey) return null;

  for (const recordB of allRecords) {
    if (recordB.id === recordA.id) continue;
    if (removeIds.has(recordB.id)) continue;
    if (recordB.date !== recordA.date) continue;
    if (normalizeDriverName(recordB.driverName) !== crewKey) continue;

    const currentB = patches.get(recordB.id) ?? recordB;
    const tripBIndex = currentB.trips.findIndex((tripB) =>
      tripsMatchForJointMerge(tripA, tripB),
    );
    if (tripBIndex < 0) continue;

    return { recordB: currentB, tripBIndex };
  }

  return null;
}

/**
 * 共同業務（2名以上乗務）の日次明細を名寄せする。
 * レコードA（編集中・主乗務員）に対し、副乗務員の単独レコードBを検索して売上を合算し、Bを削除する。
 */
export function applyJointOperationMerge(
  allRecords: DailyRecord[],
  recordA: DailyRecord,
): JointOperationMergeResult {
  if (!recordHasJointCrew(recordA)) {
    return { records: allRecords, mergedCount: 0 };
  }

  let primary: DailyRecord = {
    ...recordA,
    trips: recordA.trips.map(cloneTrip),
  };
  const removeIds = new Set<string>();
  const patches = new Map<string, DailyRecord>();
  let mergedCount = 0;

  for (let tripIndex = 0; tripIndex < primary.trips.length; tripIndex++) {
    const additionalNames = getAdditionalCrewNames(primary.trips[tripIndex]!);

    for (const crewName of additionalNames) {
      const tripA = primary.trips[tripIndex]!;
      const candidate = findMergeCandidate(
        allRecords,
        primary,
        tripA,
        crewName,
        removeIds,
        patches,
      );
      if (!candidate) continue;

      const { recordB, tripBIndex } = candidate;
      const tripB = recordB.trips[tripBIndex]!;

      primary.trips[tripIndex] = mergeTripPair(
        tripA,
        tripB,
        primary.driverName,
      );

      mergedCount++;

      const remainingTrips = recordB.trips.filter((_, index) => index !== tripBIndex);
      if (remainingTrips.length === 0) {
        removeIds.add(recordB.id);
        patches.delete(recordB.id);
      } else {
        patches.set(
          recordB.id,
          normalizeRecord({ ...recordB, trips: remainingTrips }),
        );
      }
    }
  }

  const records = allRecords
    .filter((record) => !removeIds.has(record.id))
    .map((record) => {
      if (record.id === primary.id) {
        return normalizeRecord(primary);
      }
      return patches.get(record.id) ?? record;
    });

  return { records, mergedCount };
}
