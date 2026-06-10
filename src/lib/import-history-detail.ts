import { formatYen } from "./currency-format";
import {
  hasImportLinkage,
  resolveImportAffectedRecords,
} from "./import-history";
import { displayVehicleNumber } from "./import-match-keys";
import type { DailyRecord, ImportHistory, TripEntry } from "./types";

export type ImportDetailRow = {
  key: string;
  recordId: string;
  date: string;
  driverName: string;
  vehicleNumber: string;
  shipperName: string;
  jobName: string;
  revenue: string;
  startMeter: string;
  endMeter: string;
  dropCount: string;
};

export type FusionImportDetailRow = {
  key: string;
  recordId: string;
  date: string;
  driverName: string;
  shipperName: string;
  jobName: string;
  revenue: string;
  dropCount: string;
};

function formatMeter(value: string): string {
  const trimmed = value.trim();
  return trimmed || "—";
}

function formatDropCount(trip: TripEntry): string {
  if (trip.dropCount == null || trip.dropCount <= 0) return "—";
  return `${trip.dropCount}件`;
}

function rollCallSummary(record: DailyRecord): string {
  const parts: string[] = [];
  if (record.rollCallPreRecorded) parts.push("業務前点呼");
  if (record.rollCallPostRecorded) parts.push("業務後点呼");
  if (record.clockIn) parts.push(`出勤 ${record.clockIn}`);
  if (record.clockOut) parts.push(`退勤 ${record.clockOut}`);
  if (record.rollCallTime) parts.push(`点呼 ${record.rollCallTime}`);
  return parts.length > 0 ? parts.join(" / ") : "（点呼・勤怠のみ）";
}

function rowsFromRecord(record: DailyRecord): ImportDetailRow[] {
  if (record.trips.length === 0) {
    return [
      {
        key: `${record.id}:summary`,
        recordId: record.id,
        date: record.date,
        driverName: record.driverName || "—",
        vehicleNumber: "—",
        shipperName: "—",
        jobName: rollCallSummary(record),
        revenue: "—",
        startMeter: record.clockIn || "—",
        endMeter: record.clockOut || "—",
        dropCount: "—",
      },
    ];
  }

  return record.trips.map((trip) => ({
    key: `${record.id}:${trip.id}`,
    recordId: record.id,
    date: record.date,
    driverName: record.driverName || "—",
    vehicleNumber: displayVehicleNumber(trip.vehicleNumber) || "—",
    shipperName: trip.shipperName?.trim() || "—",
    jobName: trip.jobName?.trim() || trip.reportSourceLabel?.trim() || "—",
    revenue: trip.revenue?.trim() ? formatYen(trip.revenue) : "—",
    startMeter: formatMeter(trip.startMeter),
    endMeter: formatMeter(trip.endMeter),
    dropCount: formatDropCount(trip),
  }));
}

function fusionRowsFromRecord(record: DailyRecord): FusionImportDetailRow[] {
  if (record.trips.length === 0) {
    return [
      {
        key: `${record.id}:summary`,
        recordId: record.id,
        date: record.date,
        driverName: record.driverName || "—",
        shipperName: "—",
        jobName: "（業務データなし）",
        revenue: "—",
        dropCount: "—",
      },
    ];
  }

  return record.trips.map((trip) => ({
    key: `${record.id}:${trip.id}`,
    recordId: record.id,
    date: record.date,
    driverName: record.driverName || "—",
    shipperName: trip.shipperName?.trim() || "—",
    jobName:
      trip.jobName?.trim() ||
      trip.linkedDispatchName?.trim() ||
      trip.reportSourceLabel?.trim() ||
      "—",
    revenue: trip.revenue?.trim() ? formatYen(trip.revenue) : "—",
    dropCount: formatDropCount(trip),
  }));
}

function sortDetailRows<T extends { date: string; driverName: string; jobName: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const driverCmp = a.driverName.localeCompare(b.driverName, "ja");
    if (driverCmp !== 0) return driverCmp;
    return a.jobName.localeCompare(b.jobName, "ja");
  });
}

/** 取込履歴に紐づく日次レコードから明細行を生成 */
export function buildImportDetailRows(
  history: ImportHistory,
  records: DailyRecord[],
): ImportDetailRow[] {
  const matched = resolveImportAffectedRecords(history, records);
  return sortDetailRows(matched.flatMap(rowsFromRecord));
}

/** FileMaker・日報融合取込の明細行を生成 */
export function buildFusionImportDetailRows(
  history: ImportHistory,
  records: DailyRecord[],
): FusionImportDetailRow[] {
  const matched = resolveImportAffectedRecords(history, records);
  return sortDetailRows(matched.flatMap(fusionRowsFromRecord));
}

export function countImportDetailRecords(
  history: ImportHistory,
  records: DailyRecord[],
): { matchedRecords: number; detailRows: number } {
  const matched = resolveImportAffectedRecords(history, records);
  const detailRows =
    history.importType === "fusion"
      ? matched.flatMap(fusionRowsFromRecord).length
      : matched.flatMap(rowsFromRecord).length;
  return { matchedRecords: matched.length, detailRows };
}

export { hasImportLinkage };
