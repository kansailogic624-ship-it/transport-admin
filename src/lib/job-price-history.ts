import type { JobDetail, JobPriceHistoryEntry } from "./types";

/** 履歴が無い場合の基準適用日 */
export const JOB_PRICE_ORIGIN_DATE = "1900-01-01";

const REVISION_DATE_RE =
  /(\d{4})[.\/年](\d{1,2})[.\/月](\d{1,2})/;
const REVISION_PRICE_RE = /(\d[\d,]*)\s*[→－\-~>]\s*(\d[\d,]*)/;

function parseYmdMatch(match: RegExpMatchArray): string {
  const y = match[1]!;
  const m = String(match[2]).padStart(2, "0");
  const d = String(match[3]).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parsePriceToken(value: string): number {
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export type ParsedPriceRevisionNote = {
  effectiveFrom: string;
  oldPrice: number;
  newPrice: number;
  raw: string;
};

/** 備考欄の「2023.05.01より改定 28000→28800」形式を解析 */
export function parsePriceRevisionNote(
  notes: string,
): ParsedPriceRevisionNote | null {
  const text = notes.trim();
  if (!text) return null;

  const dateMatch = text.match(REVISION_DATE_RE);
  const priceMatch = text.match(REVISION_PRICE_RE);
  if (!dateMatch || !priceMatch) return null;

  const oldPrice = parsePriceToken(priceMatch[1]!);
  const newPrice = parsePriceToken(priceMatch[2]!);
  if (newPrice <= 0) return null;

  return {
    effectiveFrom: parseYmdMatch(dateMatch),
    oldPrice,
    newPrice,
    raw: text,
  };
}

export function sortPriceHistory(
  history: JobPriceHistoryEntry[],
): JobPriceHistoryEntry[] {
  return [...history].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
}

/** 一覧表示用の最新単価（適用開始日が最も新しい履歴） */
export function syncRevenueFromHistory(
  history: JobPriceHistoryEntry[],
  fallback = 0,
): number {
  if (history.length === 0) return fallback;
  const sorted = sortPriceHistory(history);
  return sorted[sorted.length - 1]!.price;
}

export function buildPriceHistoryFromImport(
  revenue: number,
  notes: string,
): JobPriceHistoryEntry[] {
  const revision = parsePriceRevisionNote(notes);
  if (revision) {
    const history: JobPriceHistoryEntry[] = [];
    if (revision.oldPrice > 0) {
      history.push({
        price: revision.oldPrice,
        effectiveFrom: JOB_PRICE_ORIGIN_DATE,
      });
    }
    history.push({
      price: revision.newPrice,
      effectiveFrom: revision.effectiveFrom,
      note: revision.raw,
    });
    return sortPriceHistory(history);
  }

  if (revenue > 0) {
    return [{ price: revenue, effectiveFrom: JOB_PRICE_ORIGIN_DATE }];
  }
  return [];
}

export function normalizeJobDetail(job: JobDetail): JobDetail {
  let priceHistory = job.priceHistory ?? [];

  if (priceHistory.length === 0) {
    priceHistory = buildPriceHistoryFromImport(job.revenue, job.notes);
  }

  const revenue = syncRevenueFromHistory(priceHistory, job.revenue);

  return {
    ...job,
    priceHistory: sortPriceHistory(priceHistory),
    revenue,
  };
}

export function normalizeJobDetails(jobs: JobDetail[]): JobDetail[] {
  return jobs.map(normalizeJobDetail);
}

/** 運行日に適用される単価を返す（履歴が無い場合は revenue を使用） */
export function getJobPriceForDate(
  job: JobDetail,
  operationDate: string,
): number {
  const normalized = normalizeJobDetail(job);
  if (!operationDate.trim()) {
    return normalized.revenue;
  }

  const applicable = normalized.priceHistory.filter(
    (entry) => entry.effectiveFrom <= operationDate,
  );
  if (applicable.length === 0) {
    return normalized.revenue;
  }

  const sorted = sortPriceHistory(applicable);
  return sorted[sorted.length - 1]!.price;
}

export function findJobDetail(
  jobs: JobDetail[],
  shipperName: string,
  jobName: string,
): JobDetail | undefined {
  const shipper = shipperName.trim();
  const job = jobName.trim();
  if (!job) return undefined;

  const exact = jobs.find(
    (row) => row.shipperName.trim() === shipper && row.jobName.trim() === job,
  );
  if (exact) return exact;

  return jobs.find((row) => row.jobName.trim() === job);
}

/** 日次入力向け: 荷主・業務名・運行日から契約単価を解決 */
export function resolveJobRevenueForDate(
  jobs: JobDetail[],
  shipperName: string,
  jobName: string,
  operationDate: string,
): number {
  const job = findJobDetail(jobs, shipperName, jobName);
  if (!job) return 0;
  return getJobPriceForDate(job, operationDate);
}

export function addPriceRevision(
  job: JobDetail,
  price: number,
  effectiveFrom: string,
  note?: string,
): JobDetail {
  const history = [...(job.priceHistory ?? [])];
  const entry: JobPriceHistoryEntry = {
    price,
    effectiveFrom,
    note: note?.trim() || undefined,
  };

  const existingIndex = history.findIndex(
    (row) => row.effectiveFrom === effectiveFrom,
  );
  if (existingIndex >= 0) {
    history[existingIndex] = entry;
  } else {
    history.push(entry);
  }

  const sorted = sortPriceHistory(history);
  return {
    ...job,
    priceHistory: sorted,
    revenue: syncRevenueFromHistory(sorted, job.revenue),
    updatedAt: new Date().toISOString(),
  };
}

export function mergeNotesIntoPriceHistory(job: JobDetail): JobDetail {
  const revision = parsePriceRevisionNote(job.notes);
  if (!revision) return normalizeJobDetail(job);

  const normalized = normalizeJobDetail(job);
  const hasRevision = normalized.priceHistory.some(
    (entry) =>
      entry.effectiveFrom === revision.effectiveFrom &&
      entry.price === revision.newPrice,
  );
  if (hasRevision) return normalized;

  let next = normalized;
  if (revision.oldPrice > 0) {
    const hasOrigin = normalized.priceHistory.some(
      (entry) =>
        entry.effectiveFrom === JOB_PRICE_ORIGIN_DATE &&
        entry.price === revision.oldPrice,
    );
    if (!hasOrigin) {
      next = addPriceRevision(
        next,
        revision.oldPrice,
        JOB_PRICE_ORIGIN_DATE,
      );
    }
  }

  return addPriceRevision(
    next,
    revision.newPrice,
    revision.effectiveFrom,
    revision.raw,
  );
}

export function formatPriceHistoryDate(iso: string): string {
  if (iso === JOB_PRICE_ORIGIN_DATE) return "（初期）";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}/${m[2]}/${m[3]}`;
}
