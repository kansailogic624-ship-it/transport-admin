import {
  buildPriceHistoryFromImport,
  syncRevenueFromHistory,
} from "./job-price-history";
import type { JobDetail } from "./types";

export type SheetMatrix = unknown[][];

const EXPECTED_HEADERS = [
  "荷主マスタ::荷主名",
  "業務ID",
  "業務名",
  "売上",
  "備考",
] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim();
}

function findHeaderIndex(headers: string[], label: string): number {
  const exact = headers.findIndex((h) => h === label);
  if (exact >= 0) return exact;
  if (label.includes("荷主名")) {
    return headers.findIndex((h) => h.includes("荷主名"));
  }
  return headers.findIndex((h) => h.replace(/\s+/g, "") === label.replace(/\s+/g, ""));
}

function cellString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseRevenue(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type JobMasterParseResult = {
  jobs: JobDetail[];
  warnings: string[];
};

export function parseJobMasterSheet(rows: SheetMatrix): JobMasterParseResult {
  const warnings: string[] = [];
  if (rows.length === 0) {
    return { jobs: [], warnings: ["シートが空です"] };
  }

  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((cell) => normalizeHeader(cell));

  const columnIndex: Record<(typeof EXPECTED_HEADERS)[number], number> = {
    "荷主マスタ::荷主名": -1,
    業務ID: -1,
    業務名: -1,
    売上: -1,
    備考: -1,
  };

  for (const label of EXPECTED_HEADERS) {
    const idx = findHeaderIndex(headers, label);
    columnIndex[label] = idx;
    if (idx < 0) {
      warnings.push(`列「${label}」が見つかりません`);
    }
  }

  if (columnIndex["業務ID"] < 0) {
    return { jobs: [], warnings };
  }

  const jobs: JobDetail[] = [];
  const now = new Date().toISOString();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const jobId = cellString(row[columnIndex["業務ID"]]);
    if (!jobId) continue;

    const revenue = parseRevenue(row[columnIndex["売上"]]);
    const notes = cellString(row[columnIndex["備考"]]);
    const priceHistory = buildPriceHistoryFromImport(revenue, notes);

    jobs.push({
      id: jobId,
      jobId,
      shipperName: cellString(row[columnIndex["荷主マスタ::荷主名"]]),
      jobName: cellString(row[columnIndex["業務名"]]),
      revenue: syncRevenueFromHistory(priceHistory, revenue),
      priceHistory,
      notes,
      updatedAt: now,
    });
  }

  return { jobs, warnings };
}
