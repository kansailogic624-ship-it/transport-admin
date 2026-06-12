import {
  calcTimecardDeviation,
  getRecordAlerts,
  getTripAlerts,
  type AlertItem,
  type TimecardDeviation,
} from "./alerts";
import {
  buildEmployeeNameIndex,
  resolveCanonicalEmployeeName,
  type EmployeeNameIndex,
} from "./employee-name-resolve";
import { normalizeDriverName } from "./driving-report-parser";
import type { EmployeeDetail, MasterData } from "./types";
import {
  driverOnTripCrew,
  driverShareRevenue,
} from "./driver-revenue-share";
import { isPartnerRecord, isPartnerTrip } from "./run-type";
import {
  dailyKmByVehicleFromTrips,
  parseTollFee,
  recordDailyKm,
  recordInMonth,
} from "./trip-utils";
import {
  missingScheduleDatesForDriver,
  SCHEDULE_MISSING_MESSAGE,
} from "./schedule-gap-detection";
import type { DailyRecord, DailyReportStatus, TripEntry } from "./types";
import type { DayStatus } from "./schedule-day-status";

export type DriverMonthSummary = {
  driverName: string;
  totalRevenue: number;
  operatingDays: number;
  totalKm: number;
  /** 拘束時間（分） */
  totalRestraintMinutes: number;
};

export type DriverTripDetailRow = {
  id: string;
  date: string;
  clockIn: string;
  clockOut: string;
  restraintLabel: string;
  vehicleNumber: string;
  shipperName: string;
  jobName: string;
  revenue: number;
  toll: number;
  alerts: AlertItem[];
  isPrimaryDriver: boolean;
};

/** ドライバー別実績：1人×1日＝1行 */
export type DriverDayDetailRow = {
  id: string;
  date: string;
  clockIn: string;
  clockOut: string;
  /** FileMaker タイムカードの出勤時刻（HH:MM）。未取得時は undefined */
  timecardIn?: string;
  /** FileMaker タイムカードの退勤時刻（HH:MM）。未取得時は undefined */
  timecardOut?: string;
  /** タイムカードと点呼簿の乖離情報 */
  timecardDeviation: TimecardDeviation;
  restraintLabel: string;
  vehicleNumber: string;
  dispatchName: string;
  revenue: number;
  toll: number;
  km: number;
  tripCount: number;
  reportStatus: DailyReportStatus;
  dayStatus?: DayStatus;
  /** 元Excelに当該日の行が無い欠落日プレースホルダー */
  isMissing?: boolean;
  missingMessage?: string;
  alerts: AlertItem[];
  trips: DriverTripDetailRow[];
};

function parseClockMinutes(time: string): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function formatRestraintDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "—";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

function restraintMinutesForRecord(record: DailyRecord): number {
  const start = parseClockMinutes(record.clockIn);
  const end = parseClockMinutes(record.clockOut);
  if (start === null || end === null) return 0;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff > 0 ? diff : 0;
}

function driverOnTrip(trip: TripEntry, driverName: string): boolean {
  return driverOnTripCrew(trip, driverName);
}

function driverNamesMatch(a: string, b: string): boolean {
  return normalizeDriverName(a) === normalizeDriverName(b);
}

function tripsForDriver(record: DailyRecord, driverName: string): TripEntry[] {
  if (isPartnerRecord(record)) return [];
  const isPrimary = driverNamesMatch(record.driverName, driverName);
  return record.trips.filter(
    (t) =>
      !isPartnerTrip(t) &&
      (isPrimary || driverOnTrip(t, driverName)),
  );
}

function collectDriverNames(
  monthRecords: DailyRecord[],
  nameIndex: EmployeeNameIndex,
): string[] {
  const byKey = new Map<string, string>();

  const addName = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const key = normalizeDriverName(trimmed);
    if (!key) return;
    const canonical = resolveCanonicalEmployeeName(trimmed, nameIndex);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, canonical);
      return;
    }
    if (prev === canonical) return;
    const preferSpace = (a: string, b: string) => {
      const aSpace = /[\s\u3000]/.test(a);
      const bSpace = /[\s\u3000]/.test(b);
      if (aSpace !== bSpace) return aSpace ? a : b;
      return a.localeCompare(b, "ja") <= 0 ? a : b;
    };
    byKey.set(key, preferSpace(prev, canonical));
  };

  for (const record of monthRecords) {
    if (isPartnerRecord(record)) continue;
    addName(record.driverName);
    for (const trip of record.trips) {
      if (isPartnerTrip(trip)) continue;
      for (const member of trip.crew) {
        addName(member.name);
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "ja"));
}

function driverKmForDay(
  records: DailyRecord[],
  date: string,
  driverName: string,
): number {
  let sum = 0;
  for (const record of records.filter((r) => r.date === date)) {
    const trips = tripsForDriver(record, driverName);
    if (trips.length === 0) continue;

    if (driverNamesMatch(record.driverName, driverName)) {
      sum += recordDailyKm(record);
    } else {
      for (const km of dailyKmByVehicleFromTrips(trips).values()) {
        sum += km;
      }
    }
  }
  return sum;
}

export type DriverMonthlyDetailOptions = {
  employees?: EmployeeDetail[];
  masters?: MasterData;
};

function resolveNameIndex(
  options?: DriverMonthlyDetailOptions,
): EmployeeNameIndex {
  return buildEmployeeNameIndex(options?.employees ?? [], options?.masters);
}

export function buildDriverMonthSummaries(
  records: DailyRecord[],
  yearMonth: string,
  options?: DriverMonthlyDetailOptions,
): DriverMonthSummary[] {
  const monthRecords = records.filter((r) => recordInMonth(r.date, yearMonth));
  const nameIndex = resolveNameIndex(options);
  const driverNames = collectDriverNames(monthRecords, nameIndex);

  return driverNames.map((driverName) => {
    const operatingDates = new Set<string>();
    let totalRevenue = 0;

    for (const record of monthRecords) {
      const trips = tripsForDriver(record, driverName);
      if (trips.length === 0) continue;
      operatingDates.add(record.date);
      for (const trip of trips) {
        totalRevenue += driverShareRevenue(trip);
      }
    }

    let totalKm = 0;
    for (const date of operatingDates) {
      totalKm += driverKmForDay(monthRecords, date, driverName);
    }

    let totalRestraintMinutes = 0;
    for (const record of monthRecords) {
      if (!driverNamesMatch(record.driverName, driverName)) continue;
      if (isPartnerRecord(record)) continue;
      if (tripsForDriver(record, driverName).length === 0) continue;
      totalRestraintMinutes += restraintMinutesForRecord(record);
    }

    return {
      driverName,
      totalRevenue,
      operatingDays: operatingDates.size,
      totalKm,
      totalRestraintMinutes,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

export function buildDriverTripDetailRows(
  records: DailyRecord[],
  yearMonth: string,
  driverName: string,
): DriverTripDetailRow[] {
  const monthRecords = records
    .filter((r) => recordInMonth(r.date, yearMonth))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const rows: DriverTripDetailRow[] = [];

  for (const record of monthRecords) {
    const isPrimary = driverNamesMatch(record.driverName, driverName);
    const relevantTrips = tripsForDriver(record, driverName);
    let firstOnRecord = true;

    for (let i = 0; i < record.trips.length; i++) {
      const trip = record.trips[i]!;
      if (!relevantTrips.includes(trip)) continue;

      const tripIndex = i;
      const tripAlerts = getTripAlerts(trip, tripIndex);
      let alerts: AlertItem[] = tripAlerts;
      if (isPrimary && firstOnRecord) {
        const recordAlerts = getRecordAlerts(record).filter(
          (a) => !a.id.startsWith("trip-"),
        );
        alerts = [...recordAlerts, ...tripAlerts];
        firstOnRecord = false;
      }

      const restraintMin = isPrimary ? restraintMinutesForRecord(record) : 0;

      rows.push({
        id: `${record.id}-${trip.id}`,
        date: record.date,
        clockIn: isPrimary ? record.clockIn : "—",
        clockOut: isPrimary ? record.clockOut : "—",
        restraintLabel: isPrimary
          ? formatRestraintDuration(restraintMin)
          : "（同乗）",
        vehicleNumber: trip.vehicleNumber || "—",
        shipperName: trip.shipperName || "—",
        jobName: trip.jobName || "—",
        revenue: driverShareRevenue(trip),
        toll: parseTollFee(trip.tollFee),
        alerts,
        isPrimaryDriver: isPrimary,
      });
    }
  }

  return rows;
}

export function buildDriverDayDetailRows(
  records: DailyRecord[],
  yearMonth: string,
  driverName: string,
): DriverDayDetailRow[] {
  const tripRows = buildDriverTripDetailRows(records, yearMonth, driverName);
  const byDate = new Map<string, DriverTripDetailRow[]>();

  for (const row of tripRows) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }

  const monthRecords = records.filter((r) => recordInMonth(r.date, yearMonth));

  const dayRows: DriverDayDetailRow[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, trips]) => {
      const primaryTrip = trips[0]!;
      const dayRecords = monthRecords.filter(
        (r) =>
          r.date === date &&
          normalizeDriverName(r.driverName) === normalizeDriverName(driverName),
      );

      const km = driverKmForDay(monthRecords, date, driverName);

      const allDayTrips = monthRecords
        .filter((r) => r.date === date)
        .flatMap((record) => tripsForDriver(record, driverName));
      let revenue = allDayTrips.reduce(
        (sum, trip) => sum + driverShareRevenue(trip),
        0,
      );
      if (revenue === 0) {
        revenue = trips.reduce((s, t) => s + t.revenue, 0);
      }

      let toll = 0;
      for (const t of allDayTrips) {
        toll += parseTollFee(t.tollFee);
      }
      if (toll === 0) {
        toll = trips.reduce((s, t) => s + t.toll, 0);
      }

      const alerts: AlertItem[] = [];
      const alertIds = new Set<string>();

      for (const record of dayRecords) {
        for (const a of getRecordAlerts(record)) {
          if (!alertIds.has(a.id)) {
            alertIds.add(a.id);
            alerts.push(a);
          }
        }
      }

      for (const t of trips) {
        for (const a of t.alerts) {
          if (!alertIds.has(a.id)) {
            alertIds.add(a.id);
            alerts.push(a);
          }
        }
      }

      const dispatchName =
        dayRecords[0]?.primaryLinkedDispatchName ??
        dayRecords[0]?.trips[0]?.jobName ??
        primaryTrip.jobName;

      const reportStatus =
        dayRecords[0]?.reportStatus ?? "not_submitted";

      const primaryRecord = dayRecords[0];
      const timecardIn = primaryRecord?.timecardIn || undefined;
      const timecardOut = primaryRecord?.timecardOut || undefined;
      const timecardDeviation = primaryRecord
        ? calcTimecardDeviation(primaryRecord)
        : { inDiff: null, outDiff: null, inAlert: false, outAlert: false };

      return {
        id: `${driverName}-${date}`,
        date,
        clockIn: primaryTrip.clockIn,
        clockOut: primaryTrip.clockOut,
        timecardIn,
        timecardOut,
        timecardDeviation,
        restraintLabel: primaryTrip.restraintLabel,
        vehicleNumber: primaryTrip.vehicleNumber,
        dispatchName: dispatchName || "—",
        revenue,
        toll,
        km,
        tripCount: trips.length,
        reportStatus,
        alerts,
        trips,
      };
    });

  const existingDates = new Set(dayRows.map((row) => row.date));
  for (const record of monthRecords) {
    if (
      normalizeDriverName(record.driverName) !== normalizeDriverName(driverName)
    ) {
      continue;
    }
    if (!record.dayStatus || existingDates.has(record.date)) continue;

    dayRows.push({
      id: `${driverName}-${record.date}`,
      date: record.date,
      clockIn: record.clockIn || "—",
      clockOut: record.clockOut || "—",
      timecardIn: record.timecardIn,
      timecardOut: record.timecardOut,
      timecardDeviation: calcTimecardDeviation(record),
      restraintLabel: formatRestraintDuration(restraintMinutesForRecord(record)),
      vehicleNumber: "—",
      dispatchName: record.dayStatus,
      revenue: 0,
      toll: 0,
      km: 0,
      tripCount: 0,
      reportStatus: record.reportStatus,
      dayStatus: record.dayStatus,
      alerts: getRecordAlerts(record),
      trips: [],
    });
    existingDates.add(record.date);
  }

  for (const date of missingScheduleDatesForDriver(
    records,
    yearMonth,
    driverName,
  )) {
    if (existingDates.has(date)) continue;

    dayRows.push({
      id: `missing-${driverName}-${date}`,
      date,
      clockIn: "—",
      clockOut: "—",
      timecardDeviation: {
        inDiff: null,
        outDiff: null,
        inAlert: false,
        outAlert: false,
      },
      restraintLabel: "—",
      vehicleNumber: "—",
      dispatchName: SCHEDULE_MISSING_MESSAGE,
      revenue: 0,
      toll: 0,
      km: 0,
      tripCount: 0,
      reportStatus: "not_submitted",
      isMissing: true,
      missingMessage: SCHEDULE_MISSING_MESSAGE,
      alerts: [],
      trips: [],
    });
    existingDates.add(date);
  }

  return dayRows.sort((a, b) => a.date.localeCompare(b.date));
}
