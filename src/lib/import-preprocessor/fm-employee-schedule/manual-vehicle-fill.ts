import {
  buildAliasMasterStore,
  type AliasLedgerSources,
  type AliasMasterStore,
} from "@/lib/alias-engine";
import { isSameVehicle } from "@/lib/import-match-keys";
import type { MasterData } from "@/lib/types";
import { reResolveVehicleFields } from "./fill-vehicle-from-day";
import type { FmEmployeeScheduleStagingRecord } from "./types";

const MANUAL_FILL_SOURCE = "manual";
const MANUAL_FILL_REASON = "ユーザー手動補完";

export type VehicleFillCandidate = {
  vehicle: string;
  sourceRowNumber: number;
  clockInTime: string;
  clockOutTime: string;
  shipperName: string;
  jobName: string;
  score: number;
};

function effectiveVehicleRaw(record: FmEmployeeScheduleStagingRecord): string {
  return (
    record.vehicleNumberOriginal.trim() || record.vehicleNumberFilled?.trim() || ""
  );
}

function parseMinutes(time: string): number | null {
  const m = (time ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function timeOverlapScore(
  target: FmEmployeeScheduleStagingRecord,
  candidate: FmEmployeeScheduleStagingRecord,
): number {
  const tIn = parseMinutes(target.clockInTime);
  const tOut = parseMinutes(target.clockOutTime);
  const cIn = parseMinutes(candidate.clockInTime);
  const cOut = parseMinutes(candidate.clockOutTime);

  if (tIn != null && tOut != null && cIn != null && cOut != null) {
    const start = Math.max(tIn, cIn);
    const end = Math.min(tOut, cOut);
    if (end > start) return 1000 + (end - start);
  }

  if (tIn != null && cIn != null) {
    return 500 - Math.abs(tIn - cIn);
  }

  return 100 - Math.abs(target.sourceRowNumber - candidate.sourceRowNumber);
}

export function needsManualVehicleFill(
  record: FmEmployeeScheduleStagingRecord,
): boolean {
  if (!record.isRevenueRow || record.isAttendanceOnlyRow) return false;
  if (record.vehicleNumberOriginal.trim()) return false;
  return !effectiveVehicleRaw(record);
}

/**
 * 同一社員・同一日・近い時間帯の他行から車番候補を収集する。
 */
export function findManualVehicleFillCandidates(
  record: FmEmployeeScheduleStagingRecord,
  records: FmEmployeeScheduleStagingRecord[],
): VehicleFillCandidate[] {
  if (!needsManualVehicleFill(record)) return [];

  const dayRecords = records.filter(
    (r) =>
      r.employeeDayKey === record.employeeDayKey &&
      r.id !== record.id &&
      !r.isAttendanceOnlyRow &&
      !r.isPartnerLikeRow,
  );

  const seen = new Set<string>();
  const candidates: VehicleFillCandidate[] = [];

  for (const other of dayRecords) {
    const vehicle = effectiveVehicleRaw(other);
    if (!vehicle) continue;

    const dedupeKey = `${other.sourceRowNumber}:${vehicle}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    candidates.push({
      vehicle,
      sourceRowNumber: other.sourceRowNumber,
      clockInTime: other.clockInTime,
      clockOutTime: other.clockOutTime,
      shipperName: other.shipperNameOriginal,
      jobName: other.jobNameOriginal,
      score: timeOverlapScore(record, other),
    });
  }

  const byVehicle = new Map<string, VehicleFillCandidate>();
  for (const candidate of candidates) {
    const existingEntry = [...byVehicle.entries()].find(([, v]) =>
      isSameVehicle(v.vehicle, candidate.vehicle),
    );
    if (!existingEntry) {
      byVehicle.set(candidate.vehicle, candidate);
      continue;
    }
    const [existingKey, existing] = existingEntry;
    if (candidate.score > existing.score) {
      byVehicle.delete(existingKey);
      byVehicle.set(candidate.vehicle, candidate);
    }
  }

  return [...byVehicle.values()].sort((a, b) => b.score - a.score);
}

export function applyManualVehicleFillToRecord(
  record: FmEmployeeScheduleStagingRecord,
  input: { vehicle: string; sourceRowNumber: number },
  aliasStore: AliasMasterStore,
): FmEmployeeScheduleStagingRecord {
  const editedAt = new Date().toISOString();
  const withFill: FmEmployeeScheduleStagingRecord = {
    ...record,
    vehicleNumberFilled: input.vehicle.trim(),
    vehicleNumberFilledSource: MANUAL_FILL_SOURCE,
    vehicleNumberFilledReason: MANUAL_FILL_REASON,
    vehicleNumberFilledFromRowNumber: input.sourceRowNumber,
    manualVehicleFill: {
      vehicleValue: input.vehicle.trim(),
      sourceRowNumber: input.sourceRowNumber,
      editedAt,
      editedBy: "user",
    },
    infoFlags: record.infoFlags.includes("VEHICLE_FILLED_MANUAL")
      ? record.infoFlags
      : [...record.infoFlags, "VEHICLE_FILLED_MANUAL"],
  };

  return reResolveVehicleFields(withFill, aliasStore);
}

export function buildAliasStoreForFmSchedule(
  masters?: MasterData | null,
  ledger?: AliasLedgerSources | null,
): AliasMasterStore {
  return buildAliasMasterStore(masters, ledger);
}
