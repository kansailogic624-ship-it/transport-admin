import type {
  FmEmployeeScheduleStagingRecord,
  FmJointOperationMember,
} from "./types";

export function formatJointOperationMemberLabel(
  member: FmJointOperationMember,
): string {
  if (member.displayLabel?.trim()) return member.displayLabel.trim();
  const name =
    member.employeeNameCanonical?.trim() ||
    member.employeeNameOriginal.trim() ||
    "—";
  if (member.memberKind === "part_time") return `${name}（アルバイト）`;
  if (member.memberKind === "external") return `${name}（外注）`;
  return name;
}

function selfMemberKey(record: FmEmployeeScheduleStagingRecord): string {
  return (
    record.employeeCanonicalId?.trim() ||
    record.employeeNameCanonical?.trim() ||
    record.employeeNameOriginal.trim() ||
    record.id
  );
}

function isSelfMember(
  record: FmEmployeeScheduleStagingRecord,
  member: FmJointOperationMember,
): boolean {
  const selfKey = selfMemberKey(record);
  const memberKey =
    member.employeeCanonicalId?.trim() ||
    member.employeeNameCanonical?.trim() ||
    member.employeeNameOriginal.trim();
  return memberKey === selfKey;
}

/**
 * 共同作業の相手表示。例: 2名：デイヴィ → 河邑（アルバイト）
 */
export function formatJointPartnerDisplay(
  record: FmEmployeeScheduleStagingRecord,
): string {
  if (!record.isJointOperation || record.jointOperationMemberCount < 2) {
    return "単独";
  }

  const selfName =
    record.employeeNameCanonical?.trim() ||
    record.employeeNameOriginal.trim() ||
    "—";

  const others = (record.jointOperationMembers ?? []).filter(
    (m) => !isSelfMember(record, m),
  );

  if (others.length === 0) {
    return `${record.jointOperationMemberCount}名：${selfName}`;
  }

  const partnerLabel = others
    .map((m) => formatJointOperationMemberLabel(m))
    .join("、");

  return `${record.jointOperationMemberCount}名：${selfName} → ${partnerLabel}`;
}
