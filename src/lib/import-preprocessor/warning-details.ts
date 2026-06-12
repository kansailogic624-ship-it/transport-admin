import type {
  PreprocessedRecord,
  PreprocessWarningDetailRow,
} from "./types";
import { isActiveWarningRecord } from "./warning-status";

export function buildWarningDetails(
  records: PreprocessedRecord[],
): PreprocessWarningDetailRow[] {
  const rows: PreprocessWarningDetailRow[] = [];

  for (const record of records) {
    if (!isActiveWarningRecord(record)) continue;

    for (const warningReason of record.warnings) {
      rows.push({
        recordId: record.id,
        sourceRowNumber: record.sourceRowNumber,
        businessDate: record.businessDate,
        driverName:
          record.driverNameNormalized || record.driverNameOriginal || "",
        companyName: record.companyOriginal || record.companyNormalized || "",
        routeName: record.routeNameNormalized || record.routeNameOriginal || "",
        salesAmount: record.salesAmount ?? record.amount ?? 0,
        warningReason,
        warningStatus: record.warningStatus ?? "pending",
      });
    }
  }

  return rows.sort((a, b) => a.sourceRowNumber - b.sourceRowNumber);
}
