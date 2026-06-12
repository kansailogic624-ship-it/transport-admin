import type {
  FmEmployeeScheduleStagingRecord,
  FmJointOperationMember,
  FmScheduleInfoCode,
  FmScheduleWarningCode,
} from "./types";

const NOTE_PARTNER_RE =
  /^(.+?)\s*[（(]\s*(?:ﾊﾞ|バ|B|ｱﾙﾊﾞｲﾄ|アルバイト)\s*[）)]\s*$/u;

const JOINT_WARNING_CODES = new Set<FmScheduleWarningCode>([
  "JOINT_OPERATION_MISSING_VEHICLE",
  "POSSIBLE_RIDE_ALONG_TRAINING",
  "REQUIRES_HUMAN_REVIEW",
]);

export type NotePartnerParseResult = {
  name: string;
  displayLabel: string;
  isPartTime: true;
};

export function parseNotePartner(personalNote: string): NotePartnerParseResult | null {
  const trimmed = personalNote.trim();
  if (!trimmed) return null;
  const match = trimmed.match(NOTE_PARTNER_RE);
  if (!match) return null;
  const name = match[1]!.trim();
  if (!name) return null;
  return {
    name,
    displayLabel: `${name}（アルバイト）`,
    isPartTime: true,
  };
}

function buildSelfMember(
  record: FmEmployeeScheduleStagingRecord,
): FmJointOperationMember {
  return {
    employeeCanonicalId: record.employeeCanonicalId,
    employeeNameCanonical: record.employeeNameCanonical,
    employeeNameOriginal: record.employeeNameOriginal,
    revenueAmount: record.revenueAmount ?? 0,
    vehicleNumberOriginal: record.vehicleNumberOriginal,
    vehicleNumberFilled: record.vehicleNumberFilled,
    vehicleNumberCanonical: record.vehicleNumberCanonical,
    memberKind: "employee",
  };
}

function buildNotePartnerMember(
  partner: NotePartnerParseResult,
): FmJointOperationMember {
  return {
    employeeCanonicalId: null,
    employeeNameCanonical: null,
    employeeNameOriginal: partner.name,
    displayLabel: partner.displayLabel,
    memberKind: "part_time",
    isNoteDetectedPartner: true,
    revenueAmount: 0,
    vehicleNumberOriginal: "",
    vehicleNumberFilled: null,
    vehicleNumberCanonical: null,
  };
}

function appendInfoFlag(
  infoFlags: FmScheduleInfoCode[],
  code: FmScheduleInfoCode,
): FmScheduleInfoCode[] {
  return infoFlags.includes(code) ? infoFlags : [...infoFlags, code];
}

/**
 * 備考欄のアルバイト表記から2マン作業（社員＋アルバイト同乗）を検出する。
 * 社員別売上は revenueAmount をそのまま維持する。
 */
export function applyNotePartnerDetection(
  records: FmEmployeeScheduleStagingRecord[],
): FmEmployeeScheduleStagingRecord[] {
  return records.map((record) => {
    if (record.isAttendanceOnlyRow || record.isPartnerLikeRow) return record;

    const partner = parseNotePartner(record.personalNote);
    if (!partner) return record;

    const selfMember = buildSelfMember(record);
    const partnerMember = buildNotePartnerMember(partner);

    const existingMembers = record.jointOperationMembers ?? [];

    if (record.isJointOperation && record.jointOperationMemberCount >= 2) {
      const infoFlags = appendInfoFlag(
        record.infoFlags,
        "NOTE_RIDE_ALONG_PARTNER_DETECTED",
      );
      return {
        ...record,
        infoFlags,
        updatedAt: new Date().toISOString(),
      };
    }

    const members: FmJointOperationMember[] = [selfMember, partnerMember];
    const memberCount = members.length;
    const infoFlags = appendInfoFlag(
      record.infoFlags,
      "NOTE_RIDE_ALONG_PARTNER_DETECTED",
    );

    const warningFlags = record.warningFlags.filter(
      (f) => !JOINT_WARNING_CODES.has(f),
    );

    return {
      ...record,
      isJointOperation: memberCount >= 2,
      jointOperationMemberCount: memberCount,
      jointOperationMembers: members,
      employeeRevenueShareAmount: record.isPartnerLikeRow
        ? 0
        : (record.revenueAmount ?? 0),
      requiresHumanReview: false,
      humanReviewCategory: null,
      warningFlags,
      infoFlags,
      updatedAt: new Date().toISOString(),
    };
  });
}
