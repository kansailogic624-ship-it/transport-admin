import {
  buildAliasMasterStore,
  resolveAlias,
  type AliasLedgerSources,
  type AliasMasterStore,
  type AliasResolveResult,
} from "@/lib/alias-engine";
import type { MasterData } from "@/lib/types";
import { matchExternalPartnerLabel } from "./external-partner-labels";
import { buildEmployeeDayKey, buildEmployeeJobKey } from "./keys";
import {
  buildInactiveEmployeeResolveResult,
  buildPartnerDayKey,
  buildPartnerEmployeeResolveResult,
  findInactiveEmployeeInLedger,
} from "./resolve-employee-alias";
import type { FmEmployeeScheduleStagingRecord } from "./types";

const SOURCE_SYSTEM = "filemaker_employee_schedule";

function resolveEmployeeForRecord(
  record: FmEmployeeScheduleStagingRecord,
  aliasStore: AliasMasterStore,
  ledger: AliasLedgerSources | null | undefined,
  baseContext: { sourceSystem: string; businessDate: string },
): {
  employeeResolved: AliasResolveResult;
  isPartnerLikeRow: boolean;
  partnerNameOriginal: string | null;
  resolvedInactiveEmployee: boolean;
  employeeDayKey: string;
} {
  const partnerMatch = matchExternalPartnerLabel(record.employeeNameOriginal);
  if (partnerMatch) {
    const partnerNameOriginal = partnerMatch.partnerNameOriginal;
    return {
      employeeResolved: buildPartnerEmployeeResolveResult(partnerNameOriginal),
      isPartnerLikeRow: true,
      partnerNameOriginal,
      resolvedInactiveEmployee: false,
      employeeDayKey: buildPartnerDayKey(record.businessDate, partnerNameOriginal),
    };
  }

  let employeeResolved = resolveAlias(aliasStore, {
    aliasType: "employee",
    raw: record.employeeNameOriginal,
    context: baseContext,
  });

  let resolvedInactiveEmployee = false;

  if (
    employeeResolved.status === "unresolved" &&
    (record.isHolidayRow || record.isAttendanceOnlyRow)
  ) {
    const inactive = findInactiveEmployeeInLedger(
      ledger?.employees,
      record.employeeNameOriginal,
    );
    if (inactive) {
      employeeResolved = buildInactiveEmployeeResolveResult(
        inactive,
        record.employeeNameOriginal,
      );
      resolvedInactiveEmployee = true;
    }
  }

  const employeeDayKey = buildEmployeeDayKey(
    record.businessDate,
    employeeResolved.canonicalName,
    record.employeeNameOriginal,
  );

  return {
    employeeResolved,
    isPartnerLikeRow: false,
    partnerNameOriginal: null,
    resolvedInactiveEmployee,
    employeeDayKey,
  };
}

export function applyAliasEngineToFmScheduleRecords(
  records: FmEmployeeScheduleStagingRecord[],
  masters?: MasterData | null,
  ledger?: AliasLedgerSources | null,
  store?: AliasMasterStore,
): FmEmployeeScheduleStagingRecord[] {
  const aliasStore = store ?? buildAliasMasterStore(masters, ledger);
  const now = new Date().toISOString();

  return records.map((record) => {
    const baseContext = {
      sourceSystem: SOURCE_SYSTEM,
      businessDate: record.businessDate,
    };

    const shipperResolved = record.isAttendanceOnlyRow
      ? {
          status: "resolved" as const,
          canonicalId: record.shipperNameOriginal,
          canonicalName: record.shipperNameOriginal,
          matchedAliasId: null,
          candidates: [],
          aliasKey: record.shipperNameOriginal,
        }
      : resolveAlias(aliasStore, {
          aliasType: "shipper",
          raw: record.shipperNameOriginal,
          context: baseContext,
        });

    const employeeContext = resolveEmployeeForRecord(
      record,
      aliasStore,
      ledger,
      baseContext,
    );
    const {
      employeeResolved,
      isPartnerLikeRow,
      partnerNameOriginal,
      resolvedInactiveEmployee,
      employeeDayKey,
    } = employeeContext;

    const vehicleResolved = resolveAlias(aliasStore, {
      aliasType: "vehicle",
      raw: record.vehicleNumberOriginal,
      context: baseContext,
    });

    const jobResolved = record.isAttendanceOnlyRow
      ? {
          status: "resolved" as const,
          canonicalId: record.jobNameOriginal,
          canonicalName: record.jobNameOriginal || "休み",
          matchedAliasId: null,
          candidates: [],
          aliasKey: record.jobNameOriginal,
        }
      : resolveAlias(aliasStore, {
          aliasType: "course",
          raw: record.jobNameOriginal,
          context: {
            ...baseContext,
            shipperCanonicalName: shipperResolved.canonicalName ?? undefined,
            employeeCanonicalName: employeeResolved.canonicalName ?? undefined,
          },
        });

    const employeeResolvedForAll =
      isPartnerLikeRow || employeeResolved.status === "resolved";
    const allResolved =
      employeeResolvedForAll &&
      shipperResolved.status === "resolved" &&
      jobResolved.status === "resolved" &&
      (vehicleResolved.status === "resolved" || !record.vehicleNumberOriginal.trim());

    const employeeJobKey = buildEmployeeJobKey({
      businessDate: record.businessDate,
      employeeCanonical: isPartnerLikeRow
        ? null
        : employeeResolved.canonicalName,
      employeeOriginal: isPartnerLikeRow
        ? (partnerNameOriginal ?? record.employeeNameOriginal)
        : record.employeeNameOriginal,
      shipperCanonical: shipperResolved.canonicalName,
      shipperOriginal: record.shipperNameOriginal,
      jobCanonical: jobResolved.canonicalName,
      jobOriginal: record.jobNameOriginal,
      vehicleCanonical: vehicleResolved.canonicalName,
      vehicleOriginal: record.vehicleNumberOriginal,
      sourceRowNumber: record.sourceRowNumber,
      provisional: !allResolved,
    });

    return {
      ...record,
      employeeNameCanonical: isPartnerLikeRow
        ? null
        : employeeResolved.canonicalName,
      employeeCanonicalId: isPartnerLikeRow
        ? null
        : employeeResolved.canonicalId,
      partnerNameOriginal,
      isPartnerLikeRow,
      resolvedInactiveEmployee,
      shipperNameCanonical: shipperResolved.canonicalName,
      shipperCanonicalId: shipperResolved.canonicalId,
      jobNameCanonical: jobResolved.canonicalName,
      jobCanonicalId: jobResolved.canonicalId,
      vehicleNumberCanonical: vehicleResolved.canonicalName,
      vehicleCanonicalId: vehicleResolved.canonicalId,
      aliasStatus: {
        employee: isPartnerLikeRow ? "resolved" : employeeResolved.status,
        shipper: shipperResolved.status,
        job: jobResolved.status,
        vehicle: vehicleResolved.status,
      },
      employeeDayKey,
      employeeJobKey,
      employeeJobKeyProvisional: !allResolved,
      updatedAt: now,
    };
  });
}
