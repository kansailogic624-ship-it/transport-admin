import type {
  FmEmployeeScheduleStagingRecord,
  FmReviewDecisionType,
  FmScheduleWarningCode,
  FmWarningDispositionStatus,
} from "./types";

export type FmWarningReviewDecisionType =
  | "dismissed_ok"
  | "on_hold"
  | "separate_operations"
  | "joint_operation"
  | "ride_along_training"
  | "needs_review"
  | "vehicle_fill_approved"
  | "external_partner_approved"
  | "attendance_approved"
  | "holiday_approved";

export type FmWarningReviewDecision = {
  id: string;
  warningFlags: FmScheduleWarningCode[];
  decisionType: FmWarningReviewDecisionType;
  decidedAt: string;
  decidedBy: string;
  decisionNote?: string;
};

export type FmWarningDispositionEntry = {
  flag: FmScheduleWarningCode;
  status: FmWarningDispositionStatus;
};

/** 警告件数・警告欄に含めないコード（情報欄で表示） */
export const NON_ACTIONABLE_WARNING_CODES = new Set<FmScheduleWarningCode>([
  "ATTENDANCE_ROW",
  "HOLIDAY_ROW",
]);

const ALL_JOINT_WARNINGS = new Set<FmScheduleWarningCode>([
  "JOINT_OPERATION_REVENUE_DUPLICATE",
  "JOINT_OPERATION_REVENUE_CONFLICT",
  "JOINT_OPERATION_MISSING_VEHICLE",
  "JOINT_OPERATION_AMBIGUOUS",
  "POSSIBLE_RIDE_ALONG_TRAINING",
  "REQUIRES_HUMAN_REVIEW",
]);

export function getCurrentWarnings(
  record: FmEmployeeScheduleStagingRecord,
): FmScheduleWarningCode[] {
  if (record.currentWarningFlags != null) return record.currentWarningFlags;
  return record.warningFlags ?? [];
}

function isPartnerApproved(record: FmEmployeeScheduleStagingRecord): boolean {
  return (record.reviewDecisions ?? []).some(
    (d) => d.decisionType === "external_partner_approved",
  );
}

/** 要修正（未対応）の警告のみ */
export function getActionableWarnings(
  record: FmEmployeeScheduleStagingRecord,
): FmScheduleWarningCode[] {
  const flags = getCurrentWarnings(record).filter(
    (f) => !NON_ACTIONABLE_WARNING_CODES.has(f),
  );

  if (record.isPartnerLikeRow && !isPartnerApproved(record)) {
    if (!flags.includes("EXTERNAL_PARTNER_UNAPPROVED")) {
      return [...flags, "EXTERNAL_PARTNER_UNAPPROVED"];
    }
  }

  return flags.filter((f) => {
    if (f === "EXTERNAL_PARTNER_UNAPPROVED") {
      return record.isPartnerLikeRow && !isPartnerApproved(record);
    }
    return true;
  });
}

export function getOnHoldWarnings(
  record: FmEmployeeScheduleStagingRecord,
): FmScheduleWarningCode[] {
  return (record.onHoldWarningFlags ?? []).filter(
    (f) => !NON_ACTIONABLE_WARNING_CODES.has(f),
  );
}

export function getDismissedWarnings(
  record: FmEmployeeScheduleStagingRecord,
): FmScheduleWarningCode[] {
  return (record.resolvedWarningFlags ?? []).filter(
    (f) => !NON_ACTIONABLE_WARNING_CODES.has(f),
  );
}

export function getWarningDisposition(
  record: FmEmployeeScheduleStagingRecord,
  flag: FmScheduleWarningCode,
): FmWarningDispositionStatus {
  if (getActionableWarnings(record).includes(flag)) return "needs_action";
  if ((record.onHoldWarningFlags ?? []).includes(flag)) return "on_hold";
  if ((record.resolvedWarningFlags ?? []).includes(flag)) return "dismissed_ok";
  if ((record.originalWarningFlags ?? []).includes(flag)) return "dismissed_ok";
  return "needs_action";
}

/** 取込時から追跡している全警告と状態 */
export function getAllWarningDispositions(
  record: FmEmployeeScheduleStagingRecord,
): FmWarningDispositionEntry[] {
  const allFlags = new Set<FmScheduleWarningCode>([
    ...(record.originalWarningFlags ?? []),
    ...getCurrentWarnings(record),
    ...(record.onHoldWarningFlags ?? []),
    ...(record.resolvedWarningFlags ?? []),
  ]);

  return [...allFlags]
    .filter((f) => !NON_ACTIONABLE_WARNING_CODES.has(f))
    .map((flag) => ({
      flag,
      status: getWarningDisposition(record, flag),
    }));
}

function migrateLegacyAttendanceWarnings(
  record: FmEmployeeScheduleStagingRecord,
): FmEmployeeScheduleStagingRecord {
  const raw = getCurrentWarnings(record);
  const migrated = raw.filter((f) => !NON_ACTIONABLE_WARNING_CODES.has(f));
  if (migrated.length === raw.length) return record;

  let infoFlags = [...record.infoFlags];
  if (raw.includes("ATTENDANCE_ROW") && !infoFlags.includes("ATTENDANCE_ROW_INFO")) {
    infoFlags.push("ATTENDANCE_ROW_INFO");
  }
  if (raw.includes("HOLIDAY_ROW") && !infoFlags.includes("HOLIDAY_ROW_INFO")) {
    infoFlags.push("HOLIDAY_ROW_INFO");
  }

  return {
    ...record,
    currentWarningFlags: migrated,
    warningFlags: migrated,
    infoFlags,
  };
}

export function getOriginalWarnings(
  record: FmEmployeeScheduleStagingRecord,
): FmScheduleWarningCode[] {
  return record.originalWarningFlags ?? record.warningFlags;
}

function syncLegacyWarningFlags(
  record: FmEmployeeScheduleStagingRecord,
): FmEmployeeScheduleStagingRecord {
  const current = [...(record.currentWarningFlags ?? record.warningFlags ?? [])];
  return {
    ...record,
    currentWarningFlags: current,
    warningFlags: current,
    updatedAt: new Date().toISOString(),
  };
}

export function initializeWarningTracking(
  records: FmEmployeeScheduleStagingRecord[],
): FmEmployeeScheduleStagingRecord[] {
  return records.map((record) => {
    const migrated = migrateLegacyAttendanceWarnings(record);
    const flags = [...migrated.warningFlags];
    return {
      ...migrated,
      originalWarningFlags: flags,
      currentWarningFlags: [...flags],
      resolvedWarningFlags: migrated.resolvedWarningFlags ?? [],
      onHoldWarningFlags: migrated.onHoldWarningFlags ?? [],
      reviewDecisions: migrated.reviewDecisions ?? [],
      warningFlags: [...flags],
    };
  });
}

function createDecisionEntry(input: {
  warningFlags: FmScheduleWarningCode[];
  decisionType: FmWarningReviewDecisionType;
  decisionNote?: string;
  decidedBy?: string;
}): FmWarningReviewDecision {
  return {
    id: `fmwrd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    warningFlags: [...input.warningFlags],
    decisionType: input.decisionType,
    decidedAt: new Date().toISOString(),
    decidedBy: input.decidedBy ?? "管理者",
    decisionNote: input.decisionNote,
  };
}

function removeFromLists(
  record: FmEmployeeScheduleStagingRecord,
  flag: FmScheduleWarningCode,
): FmEmployeeScheduleStagingRecord {
  return {
    ...record,
    currentWarningFlags: getCurrentWarnings(record).filter((f) => f !== flag),
    onHoldWarningFlags: (record.onHoldWarningFlags ?? []).filter((f) => f !== flag),
    resolvedWarningFlags: (record.resolvedWarningFlags ?? []).filter(
      (f) => f !== flag,
    ),
  };
}

function applyWarningDisposition(
  record: FmEmployeeScheduleStagingRecord,
  flag: FmScheduleWarningCode,
  status: FmWarningDispositionStatus,
  input: { note?: string; decidedBy?: string },
): FmEmployeeScheduleStagingRecord {
  let next = removeFromLists(record, flag);

  if (status === "needs_action") {
    const current = getCurrentWarnings(next);
    if (!current.includes(flag)) {
      next = syncLegacyWarningFlags({
        ...next,
        currentWarningFlags: [...current, flag],
      });
    }
  } else if (status === "on_hold") {
    const onHold = next.onHoldWarningFlags ?? [];
    if (!onHold.includes(flag)) {
      next = {
        ...next,
        onHoldWarningFlags: [...onHold, flag],
        currentWarningFlags: getCurrentWarnings(next).filter((f) => f !== flag),
        warningFlags: getCurrentWarnings(next).filter((f) => f !== flag),
      };
    }
  } else {
    const resolved = next.resolvedWarningFlags ?? [];
    if (!resolved.includes(flag)) {
      next = {
        ...next,
        resolvedWarningFlags: [...resolved, flag],
        currentWarningFlags: getCurrentWarnings(next).filter((f) => f !== flag),
        warningFlags: getCurrentWarnings(next).filter((f) => f !== flag),
      };
    }
  }

  const decisionType: FmWarningReviewDecisionType =
    status === "on_hold"
      ? "on_hold"
      : status === "dismissed_ok"
        ? "dismissed_ok"
        : "dismissed_ok";

  if (status !== "needs_action") {
    next = {
      ...next,
      reviewDecisions: [
        ...(next.reviewDecisions ?? []),
        createDecisionEntry({
          warningFlags: [flag],
          decisionType,
          decisionNote: input.note,
          decidedBy: input.decidedBy,
        }),
      ],
    };
  }

  if (flag === "REQUIRES_HUMAN_REVIEW" && status === "dismissed_ok") {
    next = { ...next, requiresHumanReview: false, humanReviewCategory: null };
  }

  return syncLegacyWarningFlags(next);
}

function resolveFlagsOnRecord(
  record: FmEmployeeScheduleStagingRecord,
  flagsToResolve: FmScheduleWarningCode[],
  decision: FmWarningReviewDecision,
): FmEmployeeScheduleStagingRecord {
  let next = record;
  for (const flag of flagsToResolve) {
    next = removeFromLists(next, flag);
    const resolved = next.resolvedWarningFlags ?? [];
    if (!resolved.includes(flag)) {
      const current = getCurrentWarnings(next).filter((f) => f !== flag);
      next = {
        ...next,
        resolvedWarningFlags: [...resolved, flag],
        currentWarningFlags: current,
        warningFlags: current,
      };
    }
    if (flag === "REQUIRES_HUMAN_REVIEW") {
      next = { ...next, requiresHumanReview: false, humanReviewCategory: null };
    }
  }
  return syncLegacyWarningFlags({
    ...next,
    reviewDecisions: [...(next.reviewDecisions ?? []), decision],
  });
}

export function dismissFmWarning(
  record: FmEmployeeScheduleStagingRecord,
  flag: FmScheduleWarningCode,
  note?: string,
  decidedBy?: string,
): FmEmployeeScheduleStagingRecord {
  const actionable = getActionableWarnings(record);
  const onHold = getOnHoldWarnings(record);
  if (!actionable.includes(flag) && !onHold.includes(flag)) {
    if (
      flag === "EXTERNAL_PARTNER_UNAPPROVED" &&
      !getCurrentWarnings(record).includes(flag)
    ) {
      return approveExternalPartner(record, decidedBy);
    }
    return record;
  }

  return applyWarningDisposition(record, flag, "dismissed_ok", {
    note: note ?? "問題なし",
    decidedBy,
  });
}

export function holdFmWarning(
  record: FmEmployeeScheduleStagingRecord,
  flag: FmScheduleWarningCode,
  note?: string,
  decidedBy?: string,
): FmEmployeeScheduleStagingRecord {
  if (!getActionableWarnings(record).includes(flag)) return record;
  return applyWarningDisposition(record, flag, "on_hold", {
    note: note ?? "保留",
    decidedBy,
  });
}

export function reopenFmWarning(
  record: FmEmployeeScheduleStagingRecord,
  flag: FmScheduleWarningCode,
): FmEmployeeScheduleStagingRecord {
  const inHold = (record.onHoldWarningFlags ?? []).includes(flag);
  const inDismissed = (record.resolvedWarningFlags ?? []).includes(flag);
  if (!inHold && !inDismissed) return record;
  return applyWarningDisposition(record, flag, "needs_action", {});
}

function flagsResolvedByJointDecision(
  record: FmEmployeeScheduleStagingRecord,
  decision: FmReviewDecisionType,
): FmScheduleWarningCode[] {
  const current = getCurrentWarnings(record);
  const jointFlags = current.filter((f) => ALL_JOINT_WARNINGS.has(f));

  switch (decision) {
    case "separate_operations":
    case "joint_operation":
      return jointFlags;
    case "ride_along_training":
      return current.filter((f) => f === "POSSIBLE_RIDE_ALONG_TRAINING");
    case "needs_review":
      return current.filter((f) => f === "POSSIBLE_RIDE_ALONG_TRAINING");
    default:
      return [];
  }
}

export function applyJointDecisionToWarnings(
  record: FmEmployeeScheduleStagingRecord,
  decision: FmReviewDecisionType,
  decidedBy?: string,
): FmEmployeeScheduleStagingRecord {
  const flags = flagsResolvedByJointDecision(record, decision);
  if (flags.length === 0) return record;

  const decisionType: FmWarningReviewDecisionType =
    decision === "needs_review" ? "needs_review" : decision;

  return resolveFlagsOnRecord(
    record,
    flags,
    createDecisionEntry({
      warningFlags: flags,
      decisionType,
      decisionNote: `共同作業判断: ${decision}`,
      decidedBy,
    }),
  );
}

export function approveVehicleFill(
  record: FmEmployeeScheduleStagingRecord,
  decidedBy?: string,
): FmEmployeeScheduleStagingRecord {
  const flags = getCurrentWarnings(record).filter(
    (f) => f === "REVENUE_WITHOUT_VEHICLE" || f === "UNRESOLVED_VEHICLE",
  );
  if (flags.length === 0) return record;
  return resolveFlagsOnRecord(
    record,
    flags,
    createDecisionEntry({
      warningFlags: flags,
      decisionType: "vehicle_fill_approved",
      decisionNote: "車両補完を承認",
      decidedBy,
    }),
  );
}

export function approveExternalPartner(
  record: FmEmployeeScheduleStagingRecord,
  decidedBy?: string,
): FmEmployeeScheduleStagingRecord {
  if (isPartnerApproved(record)) return record;

  const flags = getCurrentWarnings(record).filter(
    (f) => f === "EXTERNAL_PARTNER_UNAPPROVED" || f === "UNRESOLVED_EMPLOYEE",
  );
  const entry = createDecisionEntry({
    warningFlags:
      flags.length > 0 ? flags : (["EXTERNAL_PARTNER_UNAPPROVED"] as FmScheduleWarningCode[]),
    decisionType: "external_partner_approved",
    decisionNote: "外注ラベルとして承認",
    decidedBy,
  });

  if (flags.length === 0) {
    return {
      ...record,
      reviewDecisions: [...(record.reviewDecisions ?? []), entry],
      updatedAt: new Date().toISOString(),
    };
  }

  return resolveFlagsOnRecord(record, flags, entry);
}

export function mergeWarningFlagsAfterRecollect(
  before: FmEmployeeScheduleStagingRecord,
  refreshed: FmEmployeeScheduleStagingRecord,
): FmEmployeeScheduleStagingRecord {
  const dismissed = new Set(before.resolvedWarningFlags ?? []);
  const onHold = new Set(before.onHoldWarningFlags ?? []);
  const fresh = getCurrentWarnings(refreshed);
  const nextCurrent = fresh.filter((f) => !dismissed.has(f) && !onHold.has(f));

  const nextOnHold = [...(before.onHoldWarningFlags ?? [])].filter((f) =>
    fresh.includes(f) || onHold.has(f),
  );
  const nextResolved = [...(before.resolvedWarningFlags ?? [])].filter((f) =>
    dismissed.has(f),
  );

  return {
    ...refreshed,
    currentWarningFlags: nextCurrent,
    warningFlags: nextCurrent,
    onHoldWarningFlags: nextOnHold,
    resolvedWarningFlags: nextResolved,
    reviewDecisions: before.reviewDecisions ?? [],
    manualVehicleFill: before.manualVehicleFill ?? refreshed.manualVehicleFill,
    manualEditHistory: before.manualEditHistory ?? refreshed.manualEditHistory,
  };
}

export function restoreWarningTrackingFromSnapshot(
  record: FmEmployeeScheduleStagingRecord,
  snapshot: {
    originalWarningFlags?: FmScheduleWarningCode[];
    currentWarningFlags?: FmScheduleWarningCode[];
    resolvedWarningFlags?: FmScheduleWarningCode[];
    onHoldWarningFlags?: FmScheduleWarningCode[];
    reviewDecisions?: FmWarningReviewDecision[];
    warningFlags?: FmScheduleWarningCode[];
  },
): FmEmployeeScheduleStagingRecord {
  const original =
    snapshot.originalWarningFlags ?? snapshot.warningFlags ?? getOriginalWarnings(record);
  const current =
    snapshot.currentWarningFlags ?? snapshot.warningFlags ?? getCurrentWarnings(record);

  return {
    ...record,
    originalWarningFlags: [...original],
    currentWarningFlags: [...current],
    resolvedWarningFlags: [...(snapshot.resolvedWarningFlags ?? [])],
    onHoldWarningFlags: [...(snapshot.onHoldWarningFlags ?? [])],
    reviewDecisions: [...(snapshot.reviewDecisions ?? [])],
    warningFlags: [...current],
    updatedAt: new Date().toISOString(),
  };
}

export function countPendingWarnings(
  records: FmEmployeeScheduleStagingRecord[],
): number {
  return records.reduce((sum, r) => sum + getActionableWarnings(r).length, 0);
}

export function countDismissedWarnings(
  records: FmEmployeeScheduleStagingRecord[],
): number {
  return records.reduce((sum, r) => sum + getDismissedWarnings(r).length, 0);
}

export function countOnHoldWarnings(
  records: FmEmployeeScheduleStagingRecord[],
): number {
  return records.reduce((sum, r) => sum + getOnHoldWarnings(r).length, 0);
}

export function countWarningRows(
  records: FmEmployeeScheduleStagingRecord[],
): number {
  return records.filter((r) => getActionableWarnings(r).length > 0).length;
}

export function isAttendanceHolidayRow(
  record: FmEmployeeScheduleStagingRecord,
): boolean {
  return (
    record.isAttendanceOnlyRow ||
    record.isHolidayRow ||
    record.infoFlags.includes("ATTENDANCE_ROW_INFO") ||
    record.infoFlags.includes("HOLIDAY_ROW_INFO") ||
    record.infoFlags.includes("INACTIVE_EMPLOYEE_ATTENDANCE_ONLY")
  );
}

export function countWarningTotals(records: FmEmployeeScheduleStagingRecord[]): {
  pendingWarningCount: number;
  dismissedWarningCount: number;
  onHoldWarningCount: number;
  warningRowCount: number;
} {
  return {
    pendingWarningCount: countPendingWarnings(records),
    dismissedWarningCount: countDismissedWarnings(records),
    onHoldWarningCount: countOnHoldWarnings(records),
    warningRowCount: countWarningRows(records),
  };
}
