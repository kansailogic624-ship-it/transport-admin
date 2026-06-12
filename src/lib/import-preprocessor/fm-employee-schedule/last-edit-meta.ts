import type {
  FmEmployeeScheduleStagingRecord,
  FmManualEditHistoryEntry,
} from "./types";

export function summarizeEditFields(
  entries: FmManualEditHistoryEntry[],
): string {
  const labels = [...new Set(entries.map((e) => e.fieldLabel))];
  return labels.join(" / ");
}

export function applyLastManualEditMeta(
  record: FmEmployeeScheduleStagingRecord,
  input: {
    editedBy: string;
    fieldLabels: string[];
  },
): FmEmployeeScheduleStagingRecord {
  const summary =
    input.fieldLabels.length > 0
      ? [...new Set(input.fieldLabels)].join(" / ")
      : (record.lastManualEditSummary ?? null);

  return {
    ...record,
    lastManualEditBy: input.editedBy,
    lastManualEditAt: new Date().toISOString(),
    lastManualEditSummary: summary,
    updatedAt: new Date().toISOString(),
  };
}

export function refreshLastManualEditFromHistory(
  record: FmEmployeeScheduleStagingRecord,
): FmEmployeeScheduleStagingRecord {
  const active = (record.manualEditHistory ?? []).filter((e) => !e.revertedAt);
  if (active.length === 0) {
    return {
      ...record,
      lastManualEditBy: null,
      lastManualEditAt: null,
      lastManualEditSummary: null,
    };
  }
  const latest = active[0]!;
  return {
    ...record,
    lastManualEditBy: latest.editedBy,
    lastManualEditAt: latest.editedAt,
    lastManualEditSummary: summarizeEditFields(active.slice(0, 3)),
  };
}
