import type { PreprocessedRecord } from "@/lib/import-preprocessor/types";
import type { DailyRecord } from "@/lib/types";
import type { ComparableImportRow } from "./types";

const COMPARE_FIELDS: (keyof ComparableImportRow)[] = [
  "date",
  "driver",
  "vehicle",
  "shipper",
  "job",
  "route",
  "sales",
  "payment",
  "tollFee",
  "clockIn",
  "clockOut",
  "rollCallTime",
  "warnings",
  "errors",
  "operationType",
  "company",
];

export function buildMatchKey(parts: {
  date?: string;
  driver?: string;
  vehicle?: string;
  job?: string;
  route?: string;
  sales?: number;
}): string {
  return [
    parts.date ?? "",
    parts.driver ?? "",
    parts.vehicle ?? "",
    parts.job ?? "",
    parts.route ?? "",
    String(parts.sales ?? 0),
  ].join("|");
}

function parseRevenueText(value: string | number | undefined): number {
  if (typeof value === "number") return Math.round(value);
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** DailyRecord を trip 単位に展開（trip なしは1行） */
export function dailyRecordsToComparableRows(
  records: DailyRecord[],
  pipeline: "old",
): ComparableImportRow[] {
  const rows: ComparableImportRow[] = [];
  let rowIndex = 0;

  for (const record of records) {
    if (record.trips.length === 0) {
      rowIndex++;
      rows.push({
        pipeline,
        rowIndex,
        matchKey: buildMatchKey({
          date: record.date,
          driver: record.driverName,
        }),
        date: record.date,
        driver: record.driverName,
        vehicle: "",
        shipper: "",
        job: "",
        route: "",
        sales: 0,
        payment: 0,
        tollFee: 0,
        clockIn: record.clockIn ?? "",
        clockOut: record.clockOut ?? "",
        rollCallTime: record.rollCallTime ?? "",
        warnings: "",
        errors: "",
        operationType: record.operationType ?? "",
        company: "",
      });
      continue;
    }

    for (const trip of record.trips) {
      rowIndex++;
      rows.push({
        pipeline,
        rowIndex,
        matchKey: buildMatchKey({
          date: record.date,
          driver: record.driverName,
          vehicle: trip.vehicleNumber,
          job: trip.jobName,
          route: trip.jobName,
          sales: parseRevenueText(trip.revenue),
        }),
        date: record.date,
        driver: record.driverName,
        vehicle: trip.vehicleNumber ?? "",
        shipper: trip.shipperName ?? "",
        job: trip.jobName ?? "",
        route: trip.jobName ?? "",
        sales: parseRevenueText(trip.revenue),
        payment: parseRevenueText(trip.partnerFee),
        tollFee: parseRevenueText(trip.tollFee),
        clockIn: record.clockIn ?? record.timecardIn ?? "",
        clockOut: record.clockOut ?? record.timecardOut ?? "",
        rollCallTime: record.rollCallTime ?? "",
        warnings: "",
        errors: "",
        operationType: trip.runType ?? record.operationType ?? "",
        company: trip.partnerName ?? "",
      });
    }
  }

  return rows;
}

export function preprocessedRecordsToComparableRows(
  records: PreprocessedRecord[],
  pipeline: "new",
): ComparableImportRow[] {
  return records.map((record, index) => ({
    pipeline,
    rowIndex: index + 1,
    matchKey: buildMatchKey({
      date: record.businessDate,
      driver: record.driverNameNormalized || record.driverNameOriginal,
      vehicle: record.vehicleNoNormalized || record.vehicleNoOriginal,
      job: record.jobNameNormalized || record.jobNameOriginal,
      route: record.routeNameNormalized || record.routeNameOriginal,
      sales: record.salesAmount ?? record.amount ?? 0,
    }),
    date: record.businessDate,
    driver: record.driverNameNormalized || record.driverNameOriginal,
    vehicle: record.vehicleNoNormalized || record.vehicleNoOriginal,
    shipper: record.shipperNameNormalized || record.shipperNameOriginal,
    job: record.jobNameNormalized || record.jobNameOriginal,
    route: record.routeNameNormalized || record.routeNameOriginal,
    sales: record.salesAmount ?? record.amount ?? 0,
    payment: record.paymentAmount ?? record.cost ?? 0,
    tollFee: record.tollFeeAmount ?? 0,
    clockIn: record.workStartTime ?? "",
    clockOut: record.workEndTime ?? "",
    rollCallTime:
      String((record.raw as { rollCallTime?: string })?.rollCallTime ?? ""),
    warnings: record.warnings.join("; "),
    errors: record.errors.join("; "),
    operationType: record.operationType,
    company: record.companyNormalized || record.companyOriginal,
  }));
}

export function compareComparableRows(
  oldRows: ComparableImportRow[],
  newRows: ComparableImportRow[],
): {
  matchedKeys: number;
  oldOnlyKeys: string[];
  newOnlyKeys: string[];
  fieldDiffs: import("./types").ImportCompareFieldDiff[];
} {
  const oldByKey = groupByKey(oldRows);
  const newByKey = groupByKey(newRows);
  const allKeys = new Set([...oldByKey.keys(), ...newByKey.keys()]);

  const oldOnlyKeys: string[] = [];
  const newOnlyKeys: string[] = [];
  const fieldDiffs: import("./types").ImportCompareFieldDiff[] = [];
  let matchedKeys = 0;

  for (const key of allKeys) {
    const oldGroup = oldByKey.get(key) ?? [];
    const newGroup = newByKey.get(key) ?? [];

    if (oldGroup.length === 0) {
      newOnlyKeys.push(key);
      continue;
    }
    if (newGroup.length === 0) {
      oldOnlyKeys.push(key);
      continue;
    }

    matchedKeys++;
    const oldRow = oldGroup[0]!;
    const newRow = newGroup[0]!;

    for (const field of COMPARE_FIELDS) {
      const oldValue = String(oldRow[field] ?? "");
      const newValue = String(newRow[field] ?? "");
      if (oldValue !== newValue) {
        fieldDiffs.push({
          matchKey: key,
          field,
          oldValue,
          newValue,
          oldRowIndex: oldRow.rowIndex,
          newRowIndex: newRow.rowIndex,
        });
      }
    }
  }

  return { matchedKeys, oldOnlyKeys, newOnlyKeys, fieldDiffs };
}

function groupByKey(
  rows: ComparableImportRow[],
): Map<string, ComparableImportRow[]> {
  const map = new Map<string, ComparableImportRow[]>();
  for (const row of rows) {
    const group = map.get(row.matchKey) ?? [];
    group.push(row);
    map.set(row.matchKey, group);
  }
  return map;
}
