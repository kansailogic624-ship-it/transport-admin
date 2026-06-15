import type { SheetMatrix } from "@/lib/driving-report-parser";
import type { PreprocessResult } from "../types";
import { parseShigaDeliverySheet } from "./parser";
import {
  applyMonthlyMismatchWarnings,
  buildShigaDeliveryAmountTotals,
} from "./reconciliation";
import { attachShigaDeliveryOriginalSnapshots } from "./record-snapshot";
import type {
  ShigaDeliveryDaySummary,
  ShigaDeliveryStagingRecord,
} from "./types";

export function processShigaDeliverySheets(
  sheets: Array<{ sheetName: string; rows: SheetMatrix }>,
  fileName: string,
): {
  records: ShigaDeliveryStagingRecord[];
  daySummaries: ShigaDeliveryDaySummary[];
  skippedRowCount: number;
  missingDateCount: number;
  excludedNonIsoDateRowCount: number;
  parseWarnings: string[];
  totalRow: ReturnType<typeof parseShigaDeliverySheet>["totalRow"];
} {
  const createdAt = new Date().toISOString();
  const parseWarnings: string[] = [];
  let records: ShigaDeliveryStagingRecord[] = [];
  let daySummaries: ShigaDeliveryDaySummary[] = [];
  let skippedRowCount = 0;
  let missingDateCount = 0;
  let excludedNonIsoDateRowCount = 0;
  let totalRow: ReturnType<typeof parseShigaDeliverySheet>["totalRow"] = {
    vehicleAmount: null,
    toll: null,
    unitCount: null,
    payTotal: null,
    sourceRowNumber: null,
    found: false,
  };

  for (const sheet of sheets) {
    if (sheet.rows.length === 0) continue;
    const parsed = parseShigaDeliverySheet(sheet.rows, {
      fileName,
      sheetName: sheet.sheetName,
      createdAt,
    });
    parseWarnings.push(...parsed.parseWarnings);
    records.push(...parsed.records);
    daySummaries.push(...parsed.daySummaries);
    skippedRowCount += parsed.skippedRowCount;
    missingDateCount += parsed.missingDateCount;
    excludedNonIsoDateRowCount += parsed.excludedNonIsoDateRowCount;
    if (parsed.totalRow.found) {
      totalRow = parsed.totalRow;
    }
  }

  records = attachShigaDeliveryOriginalSnapshots(records);

  return {
    records,
    daySummaries,
    skippedRowCount,
    missingDateCount,
    excludedNonIsoDateRowCount,
    parseWarnings,
    totalRow,
  };
}

export function buildShigaDeliveryPreprocessResult(input: {
  fileName: string;
  records: ShigaDeliveryStagingRecord[];
  daySummaries: ShigaDeliveryDaySummary[];
  skippedRowCount: number;
  missingDateCount: number;
  excludedNonIsoDateRowCount: number;
  parseWarnings: string[];
  totalRow: ReturnType<typeof parseShigaDeliverySheet>["totalRow"];
  createdAt: string;
}): PreprocessResult {
  const totals = buildShigaDeliveryAmountTotals({
    records: input.records,
    daySummaries: input.daySummaries,
    skippedRowCount: input.skippedRowCount,
    missingDateCount: input.missingDateCount,
    excludedNonIsoDateRowCount: input.excludedNonIsoDateRowCount,
    totalRow: input.totalRow,
  });

  let records = applyMonthlyMismatchWarnings(input.records, totals);

  const warningRows = records.filter(
    (r) => r.warningFlags.length > 0 || r.status === "warning",
  ).length;
  const errorRows = records.filter((r) =>
    r.warningFlags.includes("MISSING_BUSINESS_DATE"),
  ).length;

  const parseWarnings = [...input.parseWarnings];
  if (totals.reconciliation.matches.allMatch === false) {
    parseWarnings.push(
      `MONTHLY_TOTAL_MISMATCH: ${totals.reconciliation.mismatchReasons.join(" / ")}`,
    );
  }

  return {
    sourceType: "shiga_store_delivery",
    sourceFileName: input.fileName,
    totalRows: records.length,
    successRows: Math.max(0, records.length - warningRows),
    warningRows,
    errorRows,
    duplicateRows: 0,
    records: [],
    shigaDeliveryRecords: records,
    shigaDeliveryDaySummaries: input.daySummaries,
    shigaDeliveryTotals: totals,
    warnings: parseWarnings.map((message) => ({
      code: message.startsWith("MONTHLY_TOTAL_MISMATCH")
        ? "MONTHLY_TOTAL_MISMATCH"
        : "PARSE_WARNING",
      message,
    })),
    errors:
      records.length === 0
        ? [
            {
              code: "NO_ROWS",
              message: "滋賀店配データの明細を読み取れませんでした",
            },
          ]
        : [],
    createdAt: input.createdAt,
  };
}
