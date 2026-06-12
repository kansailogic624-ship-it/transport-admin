import { isSameVehicle } from "@/lib/import-match-keys";
import { computeBindingMinutes } from "./labor";
import type {
  FmEmployeeScheduleStagingRecord,
  FmScheduleInfoCode,
  FmScheduleWarningCode,
} from "./types";

const PRESERVED_JOINT_WARNINGS = new Set<FmScheduleWarningCode>([
  "JOINT_OPERATION_REVENUE_DUPLICATE",
  "JOINT_OPERATION_REVENUE_CONFLICT",
  "JOINT_OPERATION_MISSING_VEHICLE",
  "JOINT_OPERATION_AMBIGUOUS",
  "POSSIBLE_RIDE_ALONG_TRAINING",
  "REQUIRES_HUMAN_REVIEW",
  "INACTIVE_EMPLOYEE_ON_REVENUE_ROW",
]);

const PRESERVED_JOINT_INFO = new Set<FmScheduleInfoCode>([
  "JOINT_OPERATION_DETECTED",
  "VEHICLE_FILLED_FROM_EMPLOYEE_DAY",
  "VEHICLE_FILLED_FROM_JOINT_JOB",
  "VEHICLE_FILLED_MANUAL",
  "NOTE_RIDE_ALONG_PARTNER_DETECTED",
  "EXTERNAL_PARTNER_LABEL",
  "INACTIVE_EMPLOYEE_ATTENDANCE_ONLY",
  "ATTENDANCE_ROW_INFO",
  "HOLIDAY_ROW_INFO",
]);

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

function effectiveVehicleRaw(record: FmEmployeeScheduleStagingRecord): string {
  return record.vehicleNumberOriginal.trim() || record.vehicleNumberFilled?.trim() || "";
}

function signatureKey(record: FmEmployeeScheduleStagingRecord): string {
  return [
    record.businessDate,
    record.employeeNameOriginal,
    record.shipperNameOriginal,
    record.jobNameOriginal,
    record.vehicleNumberOriginal,
    record.revenueAmount ?? "",
    record.clockInTime,
    record.clockOutTime,
  ].join("|");
}

function appendAttendanceHolidayInfo(
  record: FmEmployeeScheduleStagingRecord,
  infoFlags: FmScheduleInfoCode[],
): FmScheduleInfoCode[] {
  const next = [...infoFlags];
  if (record.isAttendanceOnlyRow && !next.includes("ATTENDANCE_ROW_INFO")) {
    next.push("ATTENDANCE_ROW_INFO");
  }
  if (record.isHolidayRow && !next.includes("HOLIDAY_ROW_INFO")) {
    next.push("HOLIDAY_ROW_INFO");
  }
  return next;
}

export function collectFmScheduleWarnings(
  records: FmEmployeeScheduleStagingRecord[],
): FmEmployeeScheduleStagingRecord[] {
  const byDay = new Map<string, FmEmployeeScheduleStagingRecord[]>();
  const jobKeyMap = new Map<string, FmEmployeeScheduleStagingRecord[]>();

  for (const record of records) {
    const dayBucket = byDay.get(record.employeeDayKey) ?? [];
    dayBucket.push(record);
    byDay.set(record.employeeDayKey, dayBucket);

    const jobBucket = jobKeyMap.get(record.employeeJobKey) ?? [];
    jobBucket.push(record);
    jobKeyMap.set(record.employeeJobKey, jobBucket);
  }

  return records.map((record) => {
    const flags: FmScheduleWarningCode[] = record.warningFlags.filter((f) =>
      PRESERVED_JOINT_WARNINGS.has(f),
    );
    let infoFlags: FmScheduleInfoCode[] = record.infoFlags.filter((f) =>
      PRESERVED_JOINT_INFO.has(f),
    );

    if (!record.businessDate) flags.push("MISSING_BUSINESS_DATE");

    if (record.isPartnerLikeRow) {
      infoFlags.push("EXTERNAL_PARTNER_LABEL");
      flags.push("EXTERNAL_PARTNER_UNAPPROVED");
      infoFlags = appendAttendanceHolidayInfo(record, infoFlags);
      return syncWarningFields(record, flags, infoFlags);
    }

    if (record.resolvedInactiveEmployee) {
      if (
        record.isRevenueRow &&
        !record.isAttendanceOnlyRow &&
        !record.isHolidayRow
      ) {
        flags.push("INACTIVE_EMPLOYEE_ON_REVENUE_ROW");
      } else if (record.isHolidayRow || record.isAttendanceOnlyRow) {
        infoFlags.push("INACTIVE_EMPLOYEE_ATTENDANCE_ONLY");
      }
      infoFlags = appendAttendanceHolidayInfo(record, infoFlags);
      if (record.isAttendanceOnlyRow || record.isHolidayRow) {
        return syncWarningFields(record, flags, infoFlags);
      }
    }

    if (record.isAttendanceOnlyRow || record.isHolidayRow) {
      infoFlags = appendAttendanceHolidayInfo(record, infoFlags);
      return syncWarningFields(record, flags, infoFlags);
    }

    if (
      record.aliasStatus.employee === "unresolved" &&
      record.employeeNameOriginal.trim()
    ) {
      flags.push("UNRESOLVED_EMPLOYEE");
    } else if (record.aliasStatus.employee === "ambiguous") {
      flags.push("AMBIGUOUS_ALIAS_EMPLOYEE");
    }

    if (record.aliasStatus.shipper === "unresolved" && record.shipperNameOriginal.trim()) {
      flags.push("UNRESOLVED_SHIPPER");
    } else if (record.aliasStatus.shipper === "ambiguous") {
      flags.push("AMBIGUOUS_ALIAS_SHIPPER");
    }

    if (record.aliasStatus.job === "unresolved" && record.jobNameOriginal.trim()) {
      flags.push("UNRESOLVED_JOB");
    } else if (record.aliasStatus.job === "ambiguous") {
      flags.push("AMBIGUOUS_ALIAS_JOB");
    }

    const vehicleRaw = effectiveVehicleRaw(record);
    if (vehicleRaw) {
      if (record.aliasStatus.vehicle === "unresolved") {
        flags.push("UNRESOLVED_VEHICLE");
      } else if (record.aliasStatus.vehicle === "ambiguous") {
        flags.push("AMBIGUOUS_ALIAS_VEHICLE");
      }
    }

    if (record.jobNameOriginal.trim() && record.revenueAmount == null) {
      flags.push("MISSING_REVENUE");
    }

    if (record.isRevenueRow && !vehicleRaw) {
      flags.push("REVENUE_WITHOUT_VEHICLE");
    }

    const dupGroup = jobKeyMap.get(record.employeeJobKey) ?? [];
    if (dupGroup.length > 1) {
      const sig = signatureKey(record);
      const sameContent = dupGroup.filter((r) => signatureKey(r) === sig);
      if (sameContent.length > 1) flags.push("DUPLICATE_EMPLOYEE_JOB_KEY");
    }

    const dayGroup = byDay.get(record.employeeDayKey) ?? [];
    const clockPairs = new Set(
      dayGroup
        .filter((r) => r.clockInTime || r.clockOutTime)
        .map((r) => `${r.clockInTime}|${r.clockOutTime}`),
    );
    if (clockPairs.size > 1) flags.push("INCONSISTENT_TIMECARD");

    const originalVehicles = dayGroup
      .map((r) => r.vehicleNumberOriginal.trim())
      .filter(Boolean);
    if (clusterVehicleOriginals(originalVehicles).length > 1) {
      flags.push("MULTIPLE_VEHICLES_SAME_DAY");
    }

    if (record.countsForLaborTime) {
      const binding = computeBindingMinutes(record.clockInTime, record.clockOutTime);
      if (
        binding != null &&
        record.clockInTime &&
        record.clockOutTime &&
        parseMinutes(record.clockOutTime)! < parseMinutes(record.clockInTime)!
      ) {
        flags.push("NIGHT_SHIFT_CROSSOVER");
      }
    }

    infoFlags = appendAttendanceHolidayInfo(record, infoFlags);
    return syncWarningFields(record, flags, infoFlags);
  });
}

function syncWarningFields(
  record: FmEmployeeScheduleStagingRecord,
  flags: FmScheduleWarningCode[],
  infoFlags: FmScheduleInfoCode[],
): FmEmployeeScheduleStagingRecord {
  return {
    ...record,
    warningFlags: flags,
    currentWarningFlags: [...flags],
    infoFlags,
  };
}

function parseMinutes(time: string): number | null {
  const m = (time ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
