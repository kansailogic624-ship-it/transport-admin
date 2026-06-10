import { newCrewMember } from "./crew-utils";
import { coerceReportStatus } from "./report-status";
import type { DailyRecord, TripCrewMember, TripEntry } from "./types";

export function normalizeCrewMember(raw: Partial<TripCrewMember>): TripCrewMember {
  return {
    id: raw.id ?? crypto.randomUUID(),
    memberType: raw.memberType ?? "employee",
    name: raw.name ?? "",
    dailyCost: raw.dailyCost ?? "",
  };
}

export function normalizeTripCrew(
  trip: Partial<TripEntry>,
  fallbackDriverName: string,
): TripCrewMember[] {
  if (trip.crew && trip.crew.length > 0) {
    return trip.crew.map((m) => normalizeCrewMember(m));
  }
  const member = newCrewMember("employee");
  member.name = fallbackDriverName;
  return [member];
}

export function normalizeTrip(
  trip: Partial<TripEntry>,
  fallbackDriverName: string,
): TripEntry {
  const runType = trip.runType ?? "own";
  return {
    id: trip.id ?? crypto.randomUUID(),
    runType,
    vehicleNumber: trip.vehicleNumber ?? "",
    shipperName: trip.shipperName ?? "",
    jobName: trip.jobName ?? "",
    revenue: trip.revenue ?? "",
    tollFee: trip.tollFee ?? "",
    startMeter: trip.startMeter ?? "",
    endMeter: trip.endMeter ?? "",
    crew: runType === "partner" ? [] : normalizeTripCrew(trip, fallbackDriverName),
    partnerName: trip.partnerName ?? "",
    partnerFee: trip.partnerFee ?? "",
    reportSourceLabel: trip.reportSourceLabel,
    linkedDispatchName: trip.linkedDispatchName,
    dropCount:
      typeof trip.dropCount === "number" && trip.dropCount > 0
        ? Math.round(trip.dropCount)
        : undefined,
  };
}

export function normalizeRecord(record: Partial<DailyRecord>): DailyRecord {
  const operationType = record.operationType ?? "own";
  const driverName = record.driverName ?? "";
  return {
    id: record.id ?? crypto.randomUUID(),
    date: record.date ?? "",
    operationType,
    driverName,
    clockIn: record.clockIn ?? "",
    clockOut: record.clockOut ?? "",
    rollCallTime: record.rollCallTime ?? "",
    rollCallEndTime:
      typeof record.rollCallEndTime === "string" && record.rollCallEndTime
        ? record.rollCallEndTime
        : undefined,
    reportStatus: coerceReportStatus(
      record.reportStatus,
      record.dailyReportSubmitted,
    ),
    trips: (record.trips ?? []).map((t) => normalizeTrip(t, driverName)),
    createdAt: record.createdAt ?? new Date().toISOString(),
    reportedDistanceKm:
      typeof record.reportedDistanceKm === "number" &&
      record.reportedDistanceKm > 0
        ? record.reportedDistanceKm
        : undefined,
    isFusionDraft: record.isFusionDraft,
    fusionDispatchOptions: record.fusionDispatchOptions,
    primaryLinkedDispatchName: record.primaryLinkedDispatchName,
    rollCallPreRecorded: record.rollCallPreRecorded,
    rollCallPostRecorded: record.rollCallPostRecorded,
    employeeId: record.employeeId?.trim() || undefined,
    reportStatusManualOverride: record.reportStatusManualOverride === true,
    clockInManualOverride: record.clockInManualOverride === true,
    clockOutManualOverride: record.clockOutManualOverride === true,
    timecardIn: typeof record.timecardIn === "string" && record.timecardIn ? record.timecardIn : undefined,
    timecardOut: typeof record.timecardOut === "string" && record.timecardOut ? record.timecardOut : undefined,
    dayStatus:
      record.dayStatus === "公休" || record.dayStatus === "有給"
        ? record.dayStatus
        : undefined,
  };
}
