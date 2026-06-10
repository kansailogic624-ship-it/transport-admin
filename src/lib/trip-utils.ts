import { resolveVehicleMasterLabel } from "./import-match-keys";
import { isPartnerTrip } from "./run-type";
import { isExcludedFromVehicleCostAggregation } from "./vehicle-cost-exclude";
import type { DailyRecord, TripEntry } from "./types";

export function parseRevenue(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseTollFee(value: string | undefined): number {
  const n = Number(value ?? "");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parsePartnerFee(value: string | undefined): number {
  const n = Number(value ?? "");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function tripDistanceKm(trip: TripEntry): number {
  const start = Number(trip.startMeter);
  const end = Number(trip.endMeter);
  if (trip.startMeter === "" || trip.endMeter === "") return 0;
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  const d = end - start;
  return d > 0 ? d : 0;
}

export function kmFromMeterRange(minStart: number, maxEnd: number): number {
  if (Number.isNaN(minStart) || Number.isNaN(maxEnd)) return 0;
  return Math.max(0, maxEnd - minStart);
}

type MeterRange = { minStart: number; maxEnd: number };

function mergeMeterRange(
  prev: MeterRange | undefined,
  start: number,
  end: number,
): MeterRange {
  if (!prev) return { minStart: start, maxEnd: end };
  return {
    minStart: Math.min(prev.minStart, start),
    maxEnd: Math.max(prev.maxEnd, end),
  };
}

function meterRangeFromTrip(trip: TripEntry): MeterRange | null {
  if (isPartnerTrip(trip)) return null;
  const start = Number(trip.startMeter);
  const end = Number(trip.endMeter);
  if (trip.startMeter === "" || trip.endMeter === "") return null;
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { minStart: start, maxEnd: end };
}

/**
 * 1日分の業務から、車両ごとの走行km（同一車両は min開始〜max終了で1回だけ）。
 */
export function dailyKmByVehicleFromTrips(
  trips: TripEntry[],
): Map<string, number> {
  const ranges = new Map<string, MeterRange>();

  for (const trip of trips) {
    const range = meterRangeFromTrip(trip);
    if (!range) continue;
    const vehicle = resolveVehicleMasterLabel(trip.vehicleNumber, []);
    ranges.set(
      vehicle,
      mergeMeterRange(ranges.get(vehicle), range.minStart, range.maxEnd),
    );
  }

  const result = new Map<string, number>();
  for (const [vehicle, range] of ranges) {
    result.set(vehicle, kmFromMeterRange(range.minStart, range.maxEnd));
  }
  return result;
}

function reportedKmForRecord(record: DailyRecord): number {
  const km = record.reportedDistanceKm;
  return typeof km === "number" && km > 0 ? km : 0;
}

/** 1日1レコード内の総走行km（車両ごとに集約した合計） */
export function recordDailyKm(record: DailyRecord): number {
  let sum = 0;
  for (const km of dailyKmByVehicleFromTrips(record.trips).values()) {
    sum += km;
  }
  if (sum > 0) return sum;
  return reportedKmForRecord(record);
}

export type VehicleDayKmAggregate = {
  /** 車両番号 → 月間総走行km */
  vehicleMonthKm: Map<string, number>;
  /** 車両番号 → 稼働日（ISO日付） */
  vehicleDays: Map<string, Set<string>>;
  /** 月間総走行km（日×車両単位で重複なし） */
  totalKm: number;
};

/**
 * 月次走行km集計。
 * 同一「日付＋車両」は、複数業務・複数レコードがあっても1回だけカウントする。
 */
export type VehicleDayKmAggregateOptions = {
  /** 事務所・倉庫業務を走行km・稼働日から除外（車両別コスト用） */
  excludeNonVehicleOfficeWarehouse?: boolean;
};

export function aggregateVehicleDayKmForMonth(
  records: DailyRecord[],
  yearMonth: string,
  masterVehicles: string[] = [],
  options?: VehicleDayKmAggregateOptions,
): VehicleDayKmAggregate {
  const excludeOfficeWarehouse = options?.excludeNonVehicleOfficeWarehouse ?? false;
  const dayVehicleRanges = new Map<string, MeterRange>();
  const vehicleDays = new Map<string, Set<string>>();

  for (const record of records) {
    if (!recordInMonth(record.date, yearMonth)) continue;

    for (const trip of record.trips) {
      if (excludeOfficeWarehouse && isExcludedFromVehicleCostAggregation(trip)) {
        continue;
      }
      const range = meterRangeFromTrip(trip);
      if (!range) continue;

      const vehicle = resolveVehicleMasterLabel(
        trip.vehicleNumber,
        masterVehicles,
      );
      const dayKey = `${record.date}\u0001${vehicle}`;

      dayVehicleRanges.set(
        dayKey,
        mergeMeterRange(dayVehicleRanges.get(dayKey), range.minStart, range.maxEnd),
      );

      if (!vehicleDays.has(vehicle)) vehicleDays.set(vehicle, new Set());
      vehicleDays.get(vehicle)!.add(record.date);
    }
  }

  const vehicleMonthKm = new Map<string, number>();
  let totalKm = 0;

  for (const [dayKey, range] of dayVehicleRanges) {
    const vehicle = dayKey.split("\u0001")[1] ?? "（車両未入力）";
    const km = kmFromMeterRange(range.minStart, range.maxEnd);
    totalKm += km;
    vehicleMonthKm.set(vehicle, (vehicleMonthKm.get(vehicle) ?? 0) + km);
  }

  /** メーターなし・日報の走行距離のみの日 */
  for (const record of records) {
    if (!recordInMonth(record.date, yearMonth)) continue;
    const reported = reportedKmForRecord(record);
    if (reported <= 0) continue;

    let ownTrips = record.trips.filter((t) => !isPartnerTrip(t));
    if (excludeOfficeWarehouse) {
      ownTrips = ownTrips.filter((t) => !isExcludedFromVehicleCostAggregation(t));
    }
    if (ownTrips.length === 0) continue;

    const vehicle = resolveVehicleMasterLabel(
      ownTrips[0]?.vehicleNumber ?? "",
      masterVehicles,
    );
    const dayKey = `${record.date}\u0001${vehicle}`;
    if (dayVehicleRanges.has(dayKey)) continue;

    totalKm += reported;
    vehicleMonthKm.set(vehicle, (vehicleMonthKm.get(vehicle) ?? 0) + reported);
    if (!vehicleDays.has(vehicle)) vehicleDays.set(vehicle, new Set());
    vehicleDays.get(vehicle)!.add(record.date);
  }

  return { vehicleMonthKm, vehicleDays, totalKm };
}

/**
 * ドライバー別・月間総走行km（日×ドライバー単位で車両ごと集約後に合算）。
 */
export function aggregateDriverMonthKm(
  records: DailyRecord[],
  yearMonth: string,
): Map<string, number> {
  const dayDriverRanges = new Map<string, Map<string, MeterRange>>();

  for (const record of records) {
    if (!recordInMonth(record.date, yearMonth)) continue;
    if (record.operationType === "partner") continue;

    const driver = normalizeKey(record.driverName, "（ドライバー未設定）");
    const dayKey = `${record.date}\u0001${driver}`;

    if (!dayDriverRanges.has(dayKey)) {
      dayDriverRanges.set(dayKey, new Map());
    }
    const vehicleRanges = dayDriverRanges.get(dayKey)!;

    for (const trip of record.trips) {
      const range = meterRangeFromTrip(trip);
      if (!range) continue;
      const vehicle = resolveVehicleMasterLabel(trip.vehicleNumber, []);
      vehicleRanges.set(
        vehicle,
        mergeMeterRange(vehicleRanges.get(vehicle), range.minStart, range.maxEnd),
      );
    }
  }

  const driverMonthKm = new Map<string, number>();

  const reportedByDayDriver = new Map<string, number>();

  for (const record of records) {
    if (!recordInMonth(record.date, yearMonth)) continue;
    if (record.operationType === "partner") continue;
    const reported = reportedKmForRecord(record);
    if (reported <= 0) continue;

    const driver = normalizeKey(record.driverName, "（ドライバー未設定）");
    const dayKey = `${record.date}\u0001${driver}`;
    const vehicleRanges = dayDriverRanges.get(dayKey);
    const meterKm = vehicleRanges
      ? [...vehicleRanges.values()].reduce(
          (s, r) => s + kmFromMeterRange(r.minStart, r.maxEnd),
          0,
        )
      : 0;

    if (meterKm === 0) {
      reportedByDayDriver.set(
        dayKey,
        (reportedByDayDriver.get(dayKey) ?? 0) + reported,
      );
    }
  }

  for (const [dayKey, vehicleRanges] of dayDriverRanges) {
    const driver = dayKey.split("\u0001")[1] ?? "（ドライバー未設定）";
    let dayKm = 0;
    for (const range of vehicleRanges.values()) {
      dayKm += kmFromMeterRange(range.minStart, range.maxEnd);
    }
    if (dayKm === 0) {
      dayKm = reportedByDayDriver.get(dayKey) ?? 0;
    }
    driverMonthKm.set(driver, (driverMonthKm.get(driver) ?? 0) + dayKm);
  }

  for (const [dayKey, km] of reportedByDayDriver) {
    if (dayDriverRanges.has(dayKey)) continue;
    const driver = dayKey.split("\u0001")[1] ?? "（ドライバー未設定）";
    driverMonthKm.set(driver, (driverMonthKm.get(driver) ?? 0) + km);
  }

  return driverMonthKm;
}

export function normalizeKey(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function recordInMonth(dateIso: string, yearMonth: string): boolean {
  return dateIso.startsWith(yearMonth);
}

export function currentYearMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export type DriverDayVehicleMeter = {
  vehicleNumber: string;
  startMeter: string;
  endMeter: string;
  totalDistanceKm: number | null;
};

/** 管理チェック詳細：ドライバー×日の車両番号・メーター・走行距離を集約 */
export function extractDriverDayVehicleMeter(
  records: DailyRecord[],
  masterVehicles: string[] = [],
): DriverDayVehicleMeter {
  const trips = records
    .flatMap((r) => r.trips)
    .filter((t) => !isPartnerTrip(t));

  let vehicleNumber = "";
  let minStart: number | null = null;
  let maxEnd: number | null = null;

  for (const trip of trips) {
    const raw = trip.vehicleNumber.trim();
    if (raw && !vehicleNumber) {
      const resolved = resolveVehicleMasterLabel(raw, masterVehicles, "");
      vehicleNumber = resolved || raw;
    }
    const range = meterRangeFromTrip(trip);
    if (range) {
      minStart =
        minStart === null
          ? range.minStart
          : Math.min(minStart, range.minStart);
      maxEnd =
        maxEnd === null ? range.maxEnd : Math.max(maxEnd, range.maxEnd);
    }
  }

  if (!vehicleNumber) {
    const found = trips.find((t) => t.vehicleNumber.trim());
    if (found) {
      const raw = found.vehicleNumber.trim();
      vehicleNumber =
        resolveVehicleMasterLabel(raw, masterVehicles, "") || raw;
    }
  }

  let totalDistanceKm: number | null = null;
  if (minStart !== null && maxEnd !== null) {
    const km = kmFromMeterRange(minStart, maxEnd);
    totalDistanceKm = km > 0 ? km : 0;
  } else {
    for (const record of records) {
      const reported = reportedKmForRecord(record);
      if (reported > 0) {
        totalDistanceKm = reported;
        break;
      }
    }
  }

  return {
    vehicleNumber,
    startMeter: minStart !== null ? String(minStart) : "",
    endMeter: maxEnd !== null ? String(maxEnd) : "",
    totalDistanceKm,
  };
}

/** 日次レベルの車両・メーター入力を業務 trip へ反映 */
export function applyVehicleMeterToTrips(
  trips: TripEntry[],
  patch: { vehicleNumber: string; startMeter: string; endMeter: string },
): TripEntry[] {
  const ownIndexes = trips
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !isPartnerTrip(t))
    .map(({ i }) => i);
  if (ownIndexes.length === 0) return trips;

  const first = ownIndexes[0]!;
  const last = ownIndexes[ownIndexes.length - 1]!;
  const single = ownIndexes.length === 1;

  return trips.map((t, i) => {
    if (isPartnerTrip(t)) return t;
    return {
      ...t,
      vehicleNumber: patch.vehicleNumber,
      startMeter: single || i === first ? patch.startMeter : t.startMeter,
      endMeter: single || i === last ? patch.endMeter : t.endMeter,
    };
  });
}

/** 開始・終了メーターから走行距離（km）を算出。未入力時は fallback を返す */
export function resolveTripDistanceDisplay(
  startMeter: string,
  endMeter: string,
  fallbackKm: number | null,
): string {
  const start = Number(startMeter);
  const end = Number(endMeter);
  if (
    startMeter !== "" &&
    endMeter !== "" &&
    !Number.isNaN(start) &&
    !Number.isNaN(end)
  ) {
    const d = end - start;
    return String(d > 0 ? d : 0);
  }
  if (fallbackKm != null && fallbackKm > 0) return String(fallbackKm);
  return "0";
}
