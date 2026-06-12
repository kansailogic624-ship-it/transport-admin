import {
  buildAliasMasterStore,
  resolveAlias,
  type AliasLedgerSources,
  type AliasMasterStore,
} from "@/lib/alias-engine";
import { isSameVehicle } from "@/lib/import-match-keys";
import type { MasterData } from "@/lib/types";
import { buildEmployeeJobKey } from "./keys";
import type { FmEmployeeScheduleStagingRecord } from "./types";

const SOURCE_SYSTEM = "filemaker_employee_schedule";
const FILL_SOURCE = "employeeDayKey";
const FILL_REASON = "同一社員・同一日内の他業務行から補完";

function clusterVehicleOriginals(vehicles: string[]): string[][] {
  const clusters: string[][] = [];
  for (const vehicle of vehicles) {
    const trimmed = vehicle.trim();
    if (!trimmed) continue;
    let matched = false;
    for (const cluster of clusters) {
      if (isSameVehicle(trimmed, cluster[0]!)) {
        cluster.push(trimmed);
        matched = true;
        break;
      }
    }
    if (!matched) clusters.push([trimmed]);
  }
  return clusters;
}

function pickFillSource(
  dayRecords: FmEmployeeScheduleStagingRecord[],
  cluster: string[],
): { vehicle: string; sourceRowNumber: number } {
  const rowsWithVehicle = dayRecords
    .filter((r) => {
      const v = r.vehicleNumberOriginal.trim();
      return v && cluster.some((c) => isSameVehicle(v, c));
    })
    .sort((a, b) => a.sourceRowNumber - b.sourceRowNumber);

  const preferred =
    rowsWithVehicle.find((r) => r.aliasStatus.vehicle === "resolved") ??
    rowsWithVehicle[0];

  return {
    vehicle: preferred?.vehicleNumberOriginal.trim() ?? cluster[0]!.trim(),
    sourceRowNumber: preferred?.sourceRowNumber ?? 0,
  };
}

function effectiveVehicleRaw(record: FmEmployeeScheduleStagingRecord): string {
  return record.vehicleNumberOriginal.trim() || record.vehicleNumberFilled?.trim() || "";
}

export function reResolveVehicleFields(
  record: FmEmployeeScheduleStagingRecord,
  aliasStore: AliasMasterStore,
): FmEmployeeScheduleStagingRecord {
  const vehicleRaw = effectiveVehicleRaw(record);
  const baseContext = {
    sourceSystem: SOURCE_SYSTEM,
    businessDate: record.businessDate,
  };

  const vehicleResolved = vehicleRaw
    ? resolveAlias(aliasStore, {
        aliasType: "vehicle",
        raw: vehicleRaw,
        context: baseContext,
      })
    : {
        status: "unresolved" as const,
        canonicalId: null,
        canonicalName: null,
        matchedAliasId: null,
        candidates: [],
        aliasKey: "",
      };

  const allResolved =
    record.aliasStatus.employee === "resolved" &&
    record.aliasStatus.shipper === "resolved" &&
    record.aliasStatus.job === "resolved" &&
    (vehicleResolved.status === "resolved" || !vehicleRaw);

  const employeeJobKey = buildEmployeeJobKey({
    businessDate: record.businessDate,
    employeeCanonical: record.employeeNameCanonical,
    employeeOriginal: record.employeeNameOriginal,
    shipperCanonical: record.shipperNameCanonical,
    shipperOriginal: record.shipperNameOriginal,
    jobCanonical: record.jobNameCanonical,
    jobOriginal: record.jobNameOriginal,
    vehicleCanonical: vehicleResolved.canonicalName,
    vehicleOriginal: vehicleRaw,
    sourceRowNumber: record.sourceRowNumber,
    provisional: !allResolved,
  });

  return {
    ...record,
    vehicleNumberCanonical: vehicleResolved.canonicalName,
    vehicleCanonicalId: vehicleResolved.canonicalId,
    aliasStatus: {
      ...record.aliasStatus,
      vehicle: vehicleResolved.status,
    },
    employeeJobKey,
    employeeJobKeyProvisional: !allResolved,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 同一 employeeDayKey 内の車両番号を補完し、補完後に Alias Engine で車両を再解決する。
 */
export function fillVehicleFromEmployeeDay(
  records: FmEmployeeScheduleStagingRecord[],
  masters?: MasterData | null,
  ledger?: AliasLedgerSources | null,
  store?: AliasMasterStore,
): FmEmployeeScheduleStagingRecord[] {
  const aliasStore = store ?? buildAliasMasterStore(masters, ledger);
  const byDay = new Map<string, FmEmployeeScheduleStagingRecord[]>();

  for (const record of records) {
    if (!record.employeeDayKey) continue;
    const bucket = byDay.get(record.employeeDayKey) ?? [];
    bucket.push(record);
    byDay.set(record.employeeDayKey, bucket);
  }

  const fillById = new Map<
    string,
    {
      vehicle: string;
      sourceRowNumber: number;
    }
  >();

  for (const dayRecords of byDay.values()) {
    const originals = dayRecords
      .map((r) => r.vehicleNumberOriginal.trim())
      .filter(Boolean);
    const clusters = clusterVehicleOriginals(originals);

    if (clusters.length !== 1) continue;

    const { vehicle, sourceRowNumber } = pickFillSource(dayRecords, clusters[0]!);

    for (const record of dayRecords) {
      if (record.vehicleNumberOriginal.trim()) continue;
      fillById.set(record.id, { vehicle, sourceRowNumber });
    }
  }

  return records.map((record) => {
    const fill = fillById.get(record.id);
    if (!fill) return record;

    const withFill: FmEmployeeScheduleStagingRecord = {
      ...record,
      vehicleNumberFilled: fill.vehicle,
      vehicleNumberFilledSource: FILL_SOURCE,
      vehicleNumberFilledReason: FILL_REASON,
      vehicleNumberFilledFromRowNumber: fill.sourceRowNumber,
      infoFlags: record.infoFlags.includes("VEHICLE_FILLED_FROM_EMPLOYEE_DAY")
        ? record.infoFlags
        : [...record.infoFlags, "VEHICLE_FILLED_FROM_EMPLOYEE_DAY"],
    };

    return reResolveVehicleFields(withFill, aliasStore);
  });
}
