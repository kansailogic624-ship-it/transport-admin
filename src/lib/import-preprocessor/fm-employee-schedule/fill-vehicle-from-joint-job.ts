import {
  buildAliasMasterStore,
  resolveAlias,
  type AliasLedgerSources,
  type AliasMasterStore,
} from "@/lib/alias-engine";
import { isSameVehicle } from "@/lib/import-match-keys";
import type { MasterData } from "@/lib/types";
import { buildEmployeeJobKey, buildJointJobKey } from "./keys";
import type { FmEmployeeScheduleStagingRecord } from "./types";

const SOURCE_SYSTEM = "filemaker_employee_schedule";
const FILL_SOURCE = "jointJobKey";
const FILL_REASON = "同一共同作業（日付・荷主・業務）内の他行から補完";

function effectiveVehicleRaw(record: FmEmployeeScheduleStagingRecord): string {
  return (
    record.vehicleNumberOriginal.trim() || record.vehicleNumberFilled?.trim() || ""
  );
}

function buildJointJobKeyForRecord(
  record: FmEmployeeScheduleStagingRecord,
): string {
  return buildJointJobKey({
    businessDate: record.businessDate,
    shipperCanonical: record.shipperNameCanonical,
    shipperOriginal: record.shipperNameOriginal,
    jobCanonical: record.jobNameCanonical,
    jobOriginal: record.jobNameOriginal,
  });
}

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

function reResolveVehicleFields(
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
 * 同一 jointJobKey 内で車両が1種類のみのとき、車両空白行へ補完する。
 * Alias Engine 適用・社員日補完の後に実行すること。
 */
export function fillVehicleFromJointJob(
  records: FmEmployeeScheduleStagingRecord[],
  masters?: MasterData | null,
  ledger?: AliasLedgerSources | null,
  store?: AliasMasterStore,
): FmEmployeeScheduleStagingRecord[] {
  const aliasStore = store ?? buildAliasMasterStore(masters, ledger);
  const byJointJob = new Map<string, FmEmployeeScheduleStagingRecord[]>();

  for (const record of records) {
    if (record.isAttendanceOnlyRow) continue;
    const key = buildJointJobKeyForRecord(record);
    const bucket = byJointJob.get(key) ?? [];
    bucket.push(record);
    byJointJob.set(key, bucket);
  }

  const fillById = new Map<
    string,
    { vehicle: string; sourceRowNumber: number }
  >();

  for (const group of byJointJob.values()) {
    const originals = group
      .map((r) => r.vehicleNumberOriginal.trim())
      .filter(Boolean);
    const clusters = clusterVehicleOriginals(originals);
    if (clusters.length !== 1) continue;

    const cluster = clusters[0]!;
    const sourceRow = group
      .filter((r) => {
        const v = r.vehicleNumberOriginal.trim();
        return v && cluster.some((c) => isSameVehicle(v, c));
      })
      .sort((a, b) => a.sourceRowNumber - b.sourceRowNumber)[0];

    const vehicle = sourceRow?.vehicleNumberOriginal.trim() ?? cluster[0]!.trim();
    const sourceRowNumber = sourceRow?.sourceRowNumber ?? 0;

    for (const record of group) {
      if (record.vehicleNumberOriginal.trim()) continue;
      if (record.vehicleNumberFilled?.trim()) continue;
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
      infoFlags: record.infoFlags.includes("VEHICLE_FILLED_FROM_JOINT_JOB")
        ? record.infoFlags
        : [...record.infoFlags, "VEHICLE_FILLED_FROM_JOINT_JOB"],
    };

    return reResolveVehicleFields(withFill, aliasStore);
  });
}
