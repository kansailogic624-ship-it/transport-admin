import { isSameVehicle } from "@/lib/import-match-keys";
import { parseNotePartner } from "./note-partner-detection";
import type {
  FmEmployeeScheduleStagingRecord,
  FmJointDetectionReason,
  FmJointDetectionReasonCode,
} from "./types";
import { FM_JOINT_DETECTION_REASON_LABELS } from "./types";

function parseMinutes(time: string): number | null {
  const m = (time ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function timeOverlapRatio(
  a: FmEmployeeScheduleStagingRecord,
  b: FmEmployeeScheduleStagingRecord,
): number | null {
  const aIn = parseMinutes(a.clockInTime);
  const aOut = parseMinutes(a.clockOutTime);
  const bIn = parseMinutes(b.clockInTime);
  const bOut = parseMinutes(b.clockOutTime);
  if (aIn == null || aOut == null || bIn == null || bOut == null) return null;
  const start = Math.max(aIn, bIn);
  const end = Math.min(aOut, bOut);
  if (end <= start) return 0;
  const overlap = end - start;
  const aSpan = Math.max(aOut - aIn, 1);
  return Math.round((overlap / aSpan) * 100);
}

function effectiveVehicle(record: FmEmployeeScheduleStagingRecord): string {
  return (
    record.vehicleNumberOriginal.trim() || record.vehicleNumberFilled?.trim() || ""
  );
}

function reason(
  code: FmJointDetectionReasonCode,
  detail?: string,
): FmJointDetectionReason {
  return {
    code,
    label: FM_JOINT_DETECTION_REASON_LABELS[code],
    detail,
  };
}

/**
 * 共同作業と判定された理由を修正画面用に組み立てる。
 */
export function buildJointDetectionReasons(
  record: FmEmployeeScheduleStagingRecord,
  allRecords: FmEmployeeScheduleStagingRecord[],
): FmJointDetectionReason[] {
  const reasons: FmJointDetectionReason[] = [];
  const seen = new Set<FmJointDetectionReasonCode>();

  const push = (r: FmJointDetectionReason) => {
    if (seen.has(r.code)) return;
    seen.add(r.code);
    reasons.push(r);
  };

  if (record.infoFlags.includes("NOTE_RIDE_ALONG_PARTNER_DETECTED")) {
    const partner = parseNotePartner(record.personalNote);
    push(
      reason(
        "note_detected",
        partner ? `${partner.displayLabel}` : record.personalNote.trim() || undefined,
      ),
    );
  }

  const groupPeers = allRecords.filter(
    (r) =>
      r.jointJobKey === record.jointJobKey &&
      r.id !== record.id &&
      !r.isAttendanceOnlyRow &&
      !r.isPartnerLikeRow,
  );

  if (groupPeers.length >= 1) {
    push(reason("same_joint_job", `同一キー: ${record.jointJobKey}`));
    push(reason("excel_multi_member", `${groupPeers.length + 1}名の社員行`));
  }

  if (record.isJointOperation && record.jointOperationMemberCount >= 2) {
    push(reason("same_joint_job"));
  }

  const vehicle = effectiveVehicle(record);
  const dayPeers = allRecords.filter(
    (r) =>
      r.businessDate === record.businessDate &&
      r.id !== record.id &&
      !r.isAttendanceOnlyRow &&
      !r.isPartnerLikeRow,
  );

  let maxOverlap = 0;
  let sameVehiclePeer = false;
  let sameJobPeer = false;

  for (const peer of dayPeers) {
    const peerVehicle = effectiveVehicle(peer);
    if (vehicle && peerVehicle && isSameVehicle(vehicle, peerVehicle)) {
      sameVehiclePeer = true;
    }
    if (
      record.jobNameOriginal.trim() &&
      record.jobNameOriginal.trim() === peer.jobNameOriginal.trim()
    ) {
      sameJobPeer = true;
    }
    const ratio = timeOverlapRatio(record, peer);
    if (ratio != null && ratio > maxOverlap) maxOverlap = ratio;
  }

  if (sameVehiclePeer && vehicle) {
    push(reason("same_vehicle", vehicle));
  }
  if (sameJobPeer) {
    push(reason("same_job", record.jobNameOriginal.trim()));
  }
  if (maxOverlap > 0) {
    push(reason("time_overlap", `重複率 ${maxOverlap}%`));
  }

  if (reasons.length === 0 && record.isJointOperation) {
    push(reason("excel_multi_member"));
  }

  return reasons;
}
