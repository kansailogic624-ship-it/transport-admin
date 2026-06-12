import {
  candidateToJointMember,
  type JointPartnerCandidate,
} from "./joint-partner-candidates";
import {
  appendManualEditHistory,
  createManualEditHistoryEntry,
} from "./manual-edit-history";
import {
  applyManualVehicleFillToRecord,
  buildAliasStoreForFmSchedule,
  findManualVehicleFillCandidates,
} from "./manual-vehicle-fill";
import { formatJointPartnerDisplay } from "./partner-display";
import type { FmEmployeeScheduleStagingRecord, FmJointOperationMember } from "./types";
import { buildVehicleFillRationale } from "./vehicle-fill-rationale";

export type FmManualRecordEditInput = {
  vehicle?: string;
  jointMode?: "solo" | "two_man";
  partner?: JointPartnerCandidate | null;
  editedBy?: string;
};

function effectiveVehicleLabel(record: FmEmployeeScheduleStagingRecord): string {
  const original = record.vehicleNumberOriginal.trim();
  const filled = record.vehicleNumberFilled?.trim() ?? "";
  if (original) return original;
  if (filled) return filled;
  return "空白";
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

function applyJointModeToRecord(
  record: FmEmployeeScheduleStagingRecord,
  input: FmManualRecordEditInput,
): FmEmployeeScheduleStagingRecord {
  const beforeLabel = formatJointPartnerDisplay(record);
  let next = { ...record };

  if (input.jointMode === "solo") {
    next = {
      ...next,
      isJointOperation: false,
      jointOperationMemberCount: 1,
      jointOperationMembers: [buildSelfMember(next)],
      requiresHumanReview: false,
    };
  } else if (input.jointMode === "two_man" && input.partner) {
    const partnerMember = candidateToJointMember(input.partner);
    next = {
      ...next,
      isJointOperation: true,
      jointOperationMemberCount: 2,
      jointOperationMembers: [buildSelfMember(next), partnerMember],
      requiresHumanReview: false,
      infoFlags: next.infoFlags.includes("NOTE_RIDE_ALONG_PARTNER_DETECTED")
        ? next.infoFlags
        : [...next.infoFlags, "NOTE_RIDE_ALONG_PARTNER_DETECTED"],
    };
  } else {
    return record;
  }

  const afterLabel = formatJointPartnerDisplay(next);
  if (beforeLabel === afterLabel) return record;

  let updated = appendManualEditHistory(
    next,
    createManualEditHistoryEntry({
      field: "joint_operation",
      fieldLabel: "共同作業",
      beforeLabel,
      afterLabel,
      editedBy: input.editedBy,
    }),
  );

  if (input.jointMode === "two_man" && input.partner && beforeLabel !== afterLabel) {
    const partnerBefore = beforeLabel.includes("→")
      ? beforeLabel.split("→").slice(1).join("→").trim()
      : "—";
    updated = appendManualEditHistory(
      updated,
      createManualEditHistoryEntry({
        field: "joint_partner",
        fieldLabel: "共同作業相手",
        beforeLabel: partnerBefore,
        afterLabel: input.partner.label,
        editedBy: input.editedBy,
      }),
    );
  }

  return updated;
}

export function applyManualEditToRecord(
  record: FmEmployeeScheduleStagingRecord,
  allRecords: FmEmployeeScheduleStagingRecord[],
  input: FmManualRecordEditInput,
  aliasStore: ReturnType<typeof buildAliasStoreForFmSchedule>,
): FmEmployeeScheduleStagingRecord {
  let next = { ...record };
  const editedBy = input.editedBy ?? "管理者";

  if (input.vehicle != null) {
    const trimmed = input.vehicle.trim();
    const beforeLabel = effectiveVehicleLabel(next);
    const unchanged =
      trimmed === (next.vehicleNumberOriginal.trim() || next.vehicleNumberFilled?.trim() || "");

    if (trimmed && !unchanged) {
      const candidates = findManualVehicleFillCandidates(next, allRecords);
      const matched = candidates.find((c) => c.vehicle === trimmed);
      const rationale = buildVehicleFillRationale({
        candidate: matched ?? null,
        allCandidates: candidates,
        manualEntry: !matched,
      });
      next = applyManualVehicleFillToRecord(
        next,
        {
          vehicle: trimmed,
          sourceRowNumber: matched?.sourceRowNumber ?? next.sourceRowNumber,
        },
        aliasStore,
      );
      next = appendManualEditHistory(
        next,
        createManualEditHistoryEntry({
          field: "vehicle",
          fieldLabel: "車番",
          beforeLabel,
          afterLabel: trimmed,
          editedBy,
          rationale,
        }),
      );
    }
  }

  if (input.jointMode) {
    next = applyJointModeToRecord(next, { ...input, editedBy });
  }

  return next;
}

export function getEmployeeDayRecords(
  record: FmEmployeeScheduleStagingRecord,
  allRecords: FmEmployeeScheduleStagingRecord[],
): FmEmployeeScheduleStagingRecord[] {
  return allRecords
    .filter(
      (r) =>
        r.employeeDayKey === record.employeeDayKey &&
        !r.isAttendanceOnlyRow &&
        !r.isPartnerLikeRow,
    )
    .sort((a, b) => a.sourceRowNumber - b.sourceRowNumber);
}
