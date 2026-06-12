import type { PreprocessedRecord } from "./types";

/** 一意キー（FMは sourceDispatchKey / 開始時刻を優先） */
export function buildPreprocessUniqueKey(record: PreprocessedRecord): string {
  if (record.sourceDispatchKey) {
    return record.sourceDispatchKey;
  }

  if (record.sourceType === "filemaker_dispatch") {
    return [
      record.sourceType,
      record.businessDate,
      record.driverNameNormalized,
      record.vehicleNoNormalized,
      record.shipperNameNormalized,
      record.jobNameNormalized,
      String(record.salesAmount ?? record.amount),
      record.startTime ?? "",
    ].join("|");
  }

  return [
    record.sourceType,
    record.businessDate,
    record.driverNameNormalized,
    record.vehicleNoNormalized,
    record.routeNameNormalized,
    String(record.amount),
  ].join("|");
}

export type DuplicateCheckResult = {
  duplicateRowIds: Set<string>;
  duplicateGroups: string[][];
};

export function detectDuplicateRecords(
  records: PreprocessedRecord[],
): DuplicateCheckResult {
  const byKey = new Map<string, PreprocessedRecord[]>();

  for (const record of records) {
    if (record.errors.length > 0) continue;
    const key = buildPreprocessUniqueKey(record);
    const group = byKey.get(key) ?? [];
    group.push(record);
    byKey.set(key, group);
  }

  const duplicateRowIds = new Set<string>();
  const duplicateGroups: string[][] = [];

  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    const ids = group.map((r) => r.id);
    duplicateGroups.push(ids);
    for (const id of ids) {
      duplicateRowIds.add(id);
    }
  }

  return { duplicateRowIds, duplicateGroups };
}

export function applyDuplicateWarnings(
  records: PreprocessedRecord[],
  dup: DuplicateCheckResult,
): PreprocessedRecord[] {
  const msg = "重複候補";
  return records.map((record) => {
    if (!dup.duplicateRowIds.has(record.id)) return record;
    const status = record.warningStatus ?? "pending";
    if (status === "confirmed_valid" || status === "confirmed_duplicate") {
      return record;
    }
    const warnings = record.warnings.includes(msg)
      ? record.warnings
      : [...record.warnings, msg];
    return { ...record, warnings };
  });
}
