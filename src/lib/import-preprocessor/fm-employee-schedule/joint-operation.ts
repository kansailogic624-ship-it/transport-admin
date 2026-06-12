import { normalizeDriverName } from "@/lib/driving-report-parser";
import { buildJointJobKey } from "./keys";
import type {
  FmEmployeeScheduleStagingRecord,
  FmJointOperationMember,
  FmScheduleInfoCode,
  FmScheduleWarningCode,
} from "./types";

function effectiveVehicleRaw(record: FmEmployeeScheduleStagingRecord): string {
  return (
    record.vehicleNumberOriginal.trim() || record.vehicleNumberFilled?.trim() || ""
  );
}

function employeeMemberKey(record: FmEmployeeScheduleStagingRecord): string {
  if (record.isPartnerLikeRow) {
    return `partner:${record.partnerNameOriginal ?? record.employeeNameOriginal}`;
  }
  return (
    record.employeeCanonicalId?.trim() ||
    normalizeDriverName(record.employeeNameCanonical ?? record.employeeNameOriginal) ||
    record.employeeNameOriginal.trim() ||
    record.id
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

/** 同一社員が2行以上ある employeeMemberKey を返す（行は削除しない） */
function duplicateEmployeeKeys(
  rows: FmEmployeeScheduleStagingRecord[],
): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.isPartnerLikeRow) continue;
    const key = employeeMemberKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicated = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) duplicated.add(key);
  }
  return duplicated;
}

function collectUniqueMembers(
  rows: FmEmployeeScheduleStagingRecord[],
): FmJointOperationMember[] {
  const seen = new Set<string>();
  const members: FmJointOperationMember[] = [];

  for (const row of rows) {
    if (row.isPartnerLikeRow) continue;
    const key = employeeMemberKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    members.push({
      employeeCanonicalId: row.employeeCanonicalId,
      employeeNameCanonical: row.employeeNameCanonical,
      employeeNameOriginal: row.employeeNameOriginal,
      revenueAmount: row.revenueAmount ?? 0,
      vehicleNumberOriginal: row.vehicleNumberOriginal,
      vehicleNumberFilled: row.vehicleNumberFilled,
      vehicleNumberCanonical: row.vehicleNumberCanonical,
    });
  }

  return members.sort((a, b) =>
    (a.employeeNameCanonical ?? a.employeeNameOriginal).localeCompare(
      b.employeeNameCanonical ?? b.employeeNameOriginal,
      "ja",
    ),
  );
}

function sumGroupRevenue(rows: FmEmployeeScheduleStagingRecord[]): number {
  return rows.reduce((sum, row) => sum + (row.revenueAmount ?? 0), 0);
}

function vehicleUnresolvedInGroup(
  rows: FmEmployeeScheduleStagingRecord[],
): boolean {
  return rows.some((r) => {
    const raw = effectiveVehicleRaw(r);
    if (!raw) return true;
    return r.aliasStatus.vehicle !== "resolved";
  });
}

const JOINT_WARNING_CODES = new Set<FmScheduleWarningCode>([
  "JOINT_OPERATION_MISSING_VEHICLE",
  "POSSIBLE_RIDE_ALONG_TRAINING",
  "REQUIRES_HUMAN_REVIEW",
]);

const JOINT_INFO_CODES = new Set<FmScheduleInfoCode>(["JOINT_OPERATION_DETECTED"]);

/**
 * jointJobKey 単位で共同作業判定・会社売上合計・社員別売上を付与する。
 * revenueAmount は按分済み個別売上として扱い、自動按分・重複排除は行わない。
 */
export function applyJointOperationToFmScheduleRecords(
  records: FmEmployeeScheduleStagingRecord[],
): FmEmployeeScheduleStagingRecord[] {
  const workRows = records.filter((r) => !r.isAttendanceOnlyRow);
  const byJointJob = new Map<string, FmEmployeeScheduleStagingRecord[]>();

  for (const record of workRows) {
    const key = buildJointJobKeyForRecord(record);
    const bucket = byJointJob.get(key) ?? [];
    bucket.push(record);
    byJointJob.set(key, bucket);
  }

  const patchById = new Map<string, Partial<FmEmployeeScheduleStagingRecord>>();

  for (const [jointJobKey, group] of byJointJob) {
    const rideAlongKeys = duplicateEmployeeKeys(group);
    const requiresHumanReview = rideAlongKeys.size > 0;

    const members = collectUniqueMembers(group);
    const memberCount = members.length;
    const isJoint = memberCount >= 2;
    const operationRevenueAmount = sumGroupRevenue(group);

    const jointWarningFlags: FmScheduleWarningCode[] = [];
    const jointInfoFlags: FmScheduleInfoCode[] = [];

    if (isJoint) {
      jointInfoFlags.push("JOINT_OPERATION_DETECTED");
      jointWarningFlags.push("REQUIRES_HUMAN_REVIEW");
    } else if (requiresHumanReview) {
      jointWarningFlags.push("REQUIRES_HUMAN_REVIEW");
    }

    if (vehicleUnresolvedInGroup(group)) {
      jointWarningFlags.push("JOINT_OPERATION_MISSING_VEHICLE");
    }

    for (const row of group) {
      const rowMemberKey = employeeMemberKey(row);
      const rowWarningFlags = [...jointWarningFlags];
      if (requiresHumanReview && rideAlongKeys.has(rowMemberKey)) {
        rowWarningFlags.push("POSSIBLE_RIDE_ALONG_TRAINING");
      }

      const employeeRevenueShareAmount = row.isPartnerLikeRow
        ? 0
        : (row.revenueAmount ?? 0);

      patchById.set(row.id, {
        jointJobKey,
        operationKey: jointJobKey,
        operationGroupKey: jointJobKey,
        isJointOperation: isJoint,
        jointOperationMemberCount: memberCount,
        jointOperationMembers: members,
        operationRevenueAmount,
        employeeRevenueShareAmount,
        countsForCompanyRevenue: false,
        requiresHumanReview: requiresHumanReview || isJoint,
        humanReviewCategory: null,
        jointOperationReviewDecision: null,
        warningFlags: rowWarningFlags,
        infoFlags: jointInfoFlags,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return records.map((record) => {
    if (record.isAttendanceOnlyRow) {
      return {
        ...record,
        jointJobKey: "",
        operationKey: "",
        isJointOperation: false,
        jointOperationMemberCount: 1,
        jointOperationMembers: [],
        operationRevenueAmount: 0,
        employeeRevenueShareAmount: 0,
        countsForCompanyRevenue: false,
        requiresHumanReview: false,
        humanReviewCategory: null,
        jointOperationReviewDecision: null,
        operationGroupKey: "",
      };
    }

    const patch = patchById.get(record.id);
    if (!patch) {
      const jointJobKey = buildJointJobKeyForRecord(record);
      const amount = record.revenueAmount ?? 0;
      return {
        ...record,
        jointJobKey,
        operationKey: jointJobKey,
        operationGroupKey: jointJobKey,
        isJointOperation: false,
        jointOperationMemberCount: 1,
        jointOperationMembers: [
          {
            employeeCanonicalId: record.employeeCanonicalId,
            employeeNameCanonical: record.employeeNameCanonical,
            employeeNameOriginal: record.employeeNameOriginal,
            revenueAmount: amount,
            vehicleNumberOriginal: record.vehicleNumberOriginal,
            vehicleNumberFilled: record.vehicleNumberFilled,
            vehicleNumberCanonical: record.vehicleNumberCanonical,
          },
        ],
        operationRevenueAmount: amount,
        employeeRevenueShareAmount: record.isPartnerLikeRow ? 0 : amount,
        countsForCompanyRevenue: false,
        requiresHumanReview: false,
        humanReviewCategory: null,
        jointOperationReviewDecision: null,
      };
    }

    return {
      ...record,
      ...patch,
      warningFlags: [
        ...record.warningFlags.filter((f) => !JOINT_WARNING_CODES.has(f)),
        ...(patch.warningFlags ?? []),
      ],
      infoFlags: [
        ...record.infoFlags.filter((f) => !JOINT_INFO_CODES.has(f)),
        ...(patch.infoFlags ?? []),
      ],
    };
  });
}
