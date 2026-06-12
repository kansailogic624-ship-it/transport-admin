import { isSameVehicle } from "@/lib/import-match-keys";
import { parseNotePartner } from "./note-partner-detection";
import { formatJointOperationMemberLabel } from "./partner-display";
import type {
  FmEmployeeScheduleStagingRecord,
  FmJointOperationMemberKind,
} from "./types";

export type JointPartnerCandidate = {
  id: string;
  label: string;
  name: string;
  memberKind: FmJointOperationMemberKind;
  sourceRowNumber?: number;
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

function hasTimeOverlap(
  a: FmEmployeeScheduleStagingRecord,
  b: FmEmployeeScheduleStagingRecord,
): boolean {
  const aIn = parseMinutes(a.clockInTime);
  const aOut = parseMinutes(a.clockOutTime);
  const bIn = parseMinutes(b.clockInTime);
  const bOut = parseMinutes(b.clockOutTime);
  if (aIn == null || aOut == null || bIn == null || bOut == null) {
    return a.businessDate === b.businessDate;
  }
  return Math.max(aIn, bIn) < Math.min(aOut, bOut);
}

function selfEmployeeKey(record: FmEmployeeScheduleStagingRecord): string {
  return (
    record.employeeCanonicalId?.trim() ||
    record.employeeNameCanonical?.trim() ||
    record.employeeNameOriginal.trim() ||
    record.id
  );
}

function upsertCandidate(
  map: Map<string, JointPartnerCandidate>,
  candidate: JointPartnerCandidate,
): void {
  const existing = map.get(candidate.id);
  if (!existing || candidate.score > existing.score) {
    map.set(candidate.id, candidate);
  }
}

/**
 * 同日・同時間帯・同車番で働いている社員／備考欄のアルバイトを候補にする。
 */
export function findJointPartnerCandidates(
  record: FmEmployeeScheduleStagingRecord,
  allRecords: FmEmployeeScheduleStagingRecord[],
  vehicleOverride?: string,
): JointPartnerCandidate[] {
  const vehicle = (vehicleOverride?.trim() || effectiveVehicleRaw(record)).trim();
  const selfKey = selfEmployeeKey(record);
  const map = new Map<string, JointPartnerCandidate>();

  for (const other of allRecords) {
    if (other.id === record.id || other.isAttendanceOnlyRow || other.isPartnerLikeRow) {
      continue;
    }

    if (other.businessDate !== record.businessDate) continue;

    const otherKey = selfEmployeeKey(other);
    if (otherKey === selfKey) continue;

    const otherVehicle = effectiveVehicleRaw(other);
    const vehicleMatch =
      !vehicle || !otherVehicle || isSameVehicle(vehicle, otherVehicle);
    if (!vehicleMatch) continue;
    if (!hasTimeOverlap(record, other)) continue;

    const name =
      other.employeeNameCanonical?.trim() || other.employeeNameOriginal.trim();
    if (!name) continue;

    upsertCandidate(map, {
      id: `emp:${otherKey}`,
      label: name,
      name,
      memberKind: "employee",
      sourceRowNumber: other.sourceRowNumber,
      score: 1000,
    });
  }

  for (const dayRow of allRecords) {
    if (dayRow.businessDate !== record.businessDate) continue;
    const notePartner = parseNotePartner(dayRow.personalNote);
    if (!notePartner) continue;

    upsertCandidate(map, {
      id: `pt:${notePartner.name}`,
      label: notePartner.displayLabel,
      name: notePartner.name,
      memberKind: "part_time",
      sourceRowNumber: dayRow.sourceRowNumber,
      score: 900,
    });
  }

  for (const member of record.jointOperationMembers ?? []) {
    const memberKey =
      member.employeeCanonicalId?.trim() ||
      member.employeeNameCanonical?.trim() ||
      member.employeeNameOriginal.trim();
    if (!memberKey || memberKey === selfKey) continue;

    upsertCandidate(map, {
      id: `member:${memberKey}`,
      label: formatJointOperationMemberLabel(member),
      name: member.employeeNameOriginal,
      memberKind: member.memberKind ?? "employee",
      score: 800,
    });
  }

  return [...map.values()].sort((a, b) => b.score - a.score);
}

export function candidateToJointMember(
  candidate: JointPartnerCandidate,
): import("./types").FmJointOperationMember {
  return {
    employeeCanonicalId: null,
    employeeNameCanonical: null,
    employeeNameOriginal: candidate.name,
    displayLabel:
      candidate.memberKind === "part_time" ? candidate.label : undefined,
    memberKind: candidate.memberKind,
    isNoteDetectedPartner: candidate.memberKind === "part_time",
    revenueAmount: 0,
    vehicleNumberOriginal: "",
    vehicleNumberFilled: null,
    vehicleNumberCanonical: null,
  };
}
