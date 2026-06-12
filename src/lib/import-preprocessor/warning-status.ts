import type {
  PreprocessedRecord,
  PreprocessWarningStatus,
  PreprocessWarningStatusSummary,
} from "./types";

export const WARNING_STATUS_LABELS: Record<PreprocessWarningStatus, string> = {
  pending: "未確認",
  confirmed_duplicate: "確認済み重複",
  confirmed_valid: "確認済み正常",
  ignored: "保留",
};

/** 警告一覧に表示する行か */
export function isActiveWarningRecord(record: PreprocessedRecord): boolean {
  if (record.errors.length > 0) return false;
  if (record.warnings.length === 0) return false;
  const status = record.warningStatus ?? "pending";
  return status === "pending" || status === "ignored";
}

/** JSON/CSV 出力対象か */
export function isExportableRecord(record: PreprocessedRecord): boolean {
  if (record.errors.length > 0) return false;
  return (record.warningStatus ?? "pending") !== "confirmed_duplicate";
}

/** 件数集計対象か */
export function isAggregatableRecord(record: PreprocessedRecord): boolean {
  return isExportableRecord(record);
}

export function summarizeWarningStatus(
  records: PreprocessedRecord[],
): PreprocessWarningStatusSummary {
  const summary: PreprocessWarningStatusSummary = {
    pending: 0,
    confirmedDuplicate: 0,
    confirmedValid: 0,
    ignored: 0,
  };

  for (const record of records) {
    if (record.errors.length > 0) continue;

    const status = record.warningStatus ?? "pending";
    switch (status) {
      case "confirmed_duplicate":
        summary.confirmedDuplicate++;
        break;
      case "confirmed_valid":
        summary.confirmedValid++;
        break;
      case "ignored":
        if (record.warnings.length > 0) summary.ignored++;
        break;
      default:
        if (record.warnings.length > 0) summary.pending++;
        break;
    }
  }

  return summary;
}

export function getExportableRecords(
  records: PreprocessedRecord[],
): PreprocessedRecord[] {
  return records.filter(isExportableRecord);
}

export function getAggregatableRecords(
  records: PreprocessedRecord[],
): PreprocessedRecord[] {
  return records.filter(isAggregatableRecord);
}
