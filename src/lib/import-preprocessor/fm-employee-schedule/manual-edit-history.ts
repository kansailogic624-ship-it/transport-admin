import type {
  FmEmployeeScheduleStagingRecord,
  FmManualEditHistoryEntry,
  FmManualEditHistoryField,
  FmVehicleFillRationale,
} from "./types";

export function createManualEditHistoryEntry(input: {
  field: FmManualEditHistoryField;
  fieldLabel: string;
  beforeLabel: string;
  afterLabel: string;
  editedBy?: string;
  rationale?: FmVehicleFillRationale;
}): FmManualEditHistoryEntry {
  return {
    id: `fmeh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    field: input.field,
    fieldLabel: input.fieldLabel,
    beforeLabel: input.beforeLabel,
    afterLabel: input.afterLabel,
    editedAt: new Date().toISOString(),
    editedBy: input.editedBy ?? "管理者",
    rationale: input.rationale,
  };
}

export function appendManualEditHistory(
  record: FmEmployeeScheduleStagingRecord,
  entry: FmManualEditHistoryEntry,
): FmEmployeeScheduleStagingRecord {
  return {
    ...record,
    manualEditHistory: [entry, ...(record.manualEditHistory ?? [])],
    updatedAt: new Date().toISOString(),
  };
}

export function formatManualEditHistoryAt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
