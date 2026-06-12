import { detectDuplicateRecords } from "./duplicate-check";
import type { PreprocessedRecord } from "./types";
import { isActiveWarningRecord } from "./warning-status";

export type DuplicateGroupDetail = {
  groupIndex: number;
  recordIds: string[];
  records: PreprocessedRecord[];
  summaryLabel: string;
};

function formatGroupSummary(record: PreprocessedRecord): string {
  const parts = [
    record.businessDate,
    record.driverNameNormalized || record.driverNameOriginal,
    record.companyNormalized || record.companyOriginal,
    record.routeNameNormalized || record.routeNameOriginal,
  ].filter(Boolean);
  const amount = record.salesAmount ?? record.amount ?? 0;
  return `${parts.join(" / ")} / ${amount.toLocaleString("ja-JP")}円`;
}

export function buildDuplicateGroupDetails(
  records: PreprocessedRecord[],
): DuplicateGroupDetail[] {
  const dup = detectDuplicateRecords(records);
  const byId = new Map(records.map((r) => [r.id, r]));

  return dup.duplicateGroups
    .map((ids, index) => {
      const groupRecords = ids
        .map((id) => byId.get(id))
        .filter((r): r is PreprocessedRecord => r != null)
        .filter((r) => isUnresolvedDuplicateRecord(r));

      if (groupRecords.length < 2) return null;

      const first = groupRecords[0]!;
      return {
        groupIndex: index + 1,
        recordIds: groupRecords.map((r) => r.id),
        records: groupRecords,
        summaryLabel: formatGroupSummary(first),
      };
    })
    .filter((g): g is DuplicateGroupDetail => g != null);
}

/** 重複候補として未解決の行か */
export function isUnresolvedDuplicateRecord(
  record: PreprocessedRecord,
): boolean {
  if (record.errors.length > 0) return false;
  const status = record.warningStatus ?? "pending";
  if (status === "confirmed_valid" || status === "confirmed_duplicate") {
    return false;
  }
  return record.warnings.includes("重複候補");
}

export function countActiveDuplicateRecords(
  records: PreprocessedRecord[],
): number {
  return records.filter(isUnresolvedDuplicateRecord).length;
}

export function countPendingWarnings(records: PreprocessedRecord[]): number {
  return records.filter(isActiveWarningRecord).length;
}
