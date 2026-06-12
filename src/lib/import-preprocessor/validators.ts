import {
  extractPartnerNameFromAmazonLabel,
  isOwnCompanyForPreprocess,
} from "./normalize";
import type { PreprocessedRecord, PreprocessIssue } from "./types";

function needsCompanyNormalizationReview(record: PreprocessedRecord): boolean {
  if (record.isManuallyEdited) return false;
  const raw = record.companyOriginal?.trim();
  if (!raw) return false;
  if (record.operationType === "own" || record.operationType === "unknown") {
    return false;
  }
  if (extractPartnerNameFromAmazonLabel(raw)) return false;
  if (isOwnCompanyForPreprocess(raw)) return false;
  return true;
}

/** 手修正・一括修正後に warning/error を再計算（厳しいマスタ照合は行わない） */
export function recomputeRecordIssues(
  record: PreprocessedRecord,
  isDuplicate: boolean,
): PreprocessedRecord {
  const warnings: string[] = [];
  const errors: string[] = [];

  const salesAmount = record.salesAmount ?? record.amount ?? 0;
  const paymentAmount = record.paymentAmount ?? record.cost ?? 0;

  if (!record.businessDate?.trim()) {
    warnings.push("日付が空欄");
  }
  if (!record.driverNameNormalized?.trim()) {
    warnings.push("ドライバー名が空欄");
  }
  const isFmHolidayRow =
    record.sourceType === "filemaker_dispatch" &&
    (Boolean(
      (record.raw as { isAttendanceRow?: boolean } | undefined)?.isAttendanceRow,
    ) ||
      Boolean(record.dayStatus));
  if (salesAmount <= 0 && !isFmHolidayRow) {
    warnings.push("売上が空欄");
  }
  if (record.sourceType === "roll_call") {
    const raw = record.raw as {
      hasPreRollCall?: boolean;
      hasPostRollCall?: boolean;
    };
    if (!raw.hasPreRollCall && !raw.hasPostRollCall) {
      warnings.push("点呼時刻が未記録");
    }
  }
  if (paymentAmount <= 0 && record.operationType === "partner") {
    warnings.push("傭車なのに支払が空欄");
  }
  if (
    !record.routeNameNormalized?.trim() &&
    record.sourceType !== "roll_call" &&
    !isFmHolidayRow
  ) {
    warnings.push("便名が空欄");
  }
  if (record.operationType === "unknown") {
    warnings.push("区分が判定不明");
  }
  if (needsCompanyNormalizationReview(record)) {
    warnings.push("会社名の正規化未確認");
  }
  const status = record.warningStatus ?? "pending";
  if (
    isDuplicate &&
    status !== "confirmed_valid" &&
    status !== "confirmed_duplicate"
  ) {
    warnings.push("重複候補");
  }

  return { ...record, warnings, errors };
}

export function collectGlobalIssues(
  records: PreprocessedRecord[],
): { errors: PreprocessIssue[]; warnings: PreprocessIssue[] } {
  const errors: PreprocessIssue[] = [];
  const warnings: PreprocessIssue[] = [];

  for (const record of records) {
    for (const msg of record.errors) {
      errors.push({
        code: "VALIDATION_ERROR",
        message: msg,
        sourceRowNumber: record.sourceRowNumber,
        recordId: record.id,
      });
    }

    const status = record.warningStatus ?? "pending";
    if (status === "confirmed_valid" || status === "confirmed_duplicate") {
      continue;
    }

    for (const msg of record.warnings) {
      warnings.push({
        code: "VALIDATION_WARNING",
        message: msg,
        sourceRowNumber: record.sourceRowNumber,
        recordId: record.id,
      });
    }
  }

  return { errors, warnings };
}
