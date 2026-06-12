/**
 * Amazon実績 → 経費・生産性管理テーブル用ペイロード
 */

import { classifyAmazonRouteType } from "./amazon-route-type";
import { normalizeOwnCompanyName } from "./amazon-own-company";
import type { AmazonMergeReviewRow } from "./amazon-performance-merge";
import { sanitizeAmazonMoneyField } from "./amazon-performance-record-payload";
import { driverNamesMatch, normalizeIsoDate } from "./import-match-keys";
import { normalizeDriverName } from "./driving-report-parser";
import type { AmazonPerformanceExpenseRecord } from "./types";

function sanitizeText(value: unknown, maxLen = 500): string {
  const text = String(value ?? "")
    .replace(/\u0000/g, "")
    .trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function toMoneyNumber(value: unknown): number {
  const s = sanitizeAmazonMoneyField(value);
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function billingMonthFromDate(isoDate: string): string {
  const d = normalizeIsoDate(isoDate);
  const m = d.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "";
}

function normalizedCompanyName(companyName: string): string {
  return normalizeOwnCompanyName(companyName) || sanitizeText(companyName);
}

function normalizedRouteLabel(routeLabel: string | undefined): string {
  const raw = sanitizeText(routeLabel, 80);
  const routeType = classifyAmazonRouteType(raw);
  return routeType !== "other" ? routeType : raw;
}

/** 経費テーブル照合用キー（billingMonth×日付×名前×会社名×便名） */
export function amazonExpenseMatchKey(input: {
  serviceDate: string;
  driverName: string;
  companyName: string;
  routeLabel?: string;
  billingMonth?: string;
}): string {
  const bm =
    input.billingMonth?.trim() ||
    billingMonthFromDate(normalizeIsoDate(input.serviceDate));
  const company = normalizedCompanyName(input.companyName);
  const route = normalizedRouteLabel(input.routeLabel);
  return `${bm}|${normalizeIsoDate(input.serviceDate)}|${normalizeDriverName(input.driverName)}|${company}|${route}`;
}

/** 旧形式キー（routeLabel 導入前データとの互換） */
export function amazonExpenseLegacyMatchKey(input: {
  serviceDate: string;
  driverName: string;
  companyName: string;
}): string {
  const company = normalizedCompanyName(input.companyName);
  return `${normalizeIsoDate(input.serviceDate)}|${normalizeDriverName(input.driverName)}|${company}`;
}

/** 保存内容の同一性判定（id / createdAt / updatedAt を除く） */
export function amazonExpenseContentHash(
  record: AmazonPerformanceExpenseRecord,
): string {
  const payload = {
    serviceDate: normalizeIsoDate(record.serviceDate),
    driverName: sanitizeText(record.driverName, 80),
    companyName: normalizedCompanyName(record.companyName),
    routeLabel: normalizedRouteLabel(record.routeLabel),
    revenue: toMoneyNumber(record.revenue),
    payment: toMoneyNumber(record.payment),
    diff: toMoneyNumber(record.diff),
    memo: sanitizeText(record.memo),
    laborCost: toMoneyNumber(record.laborCost),
    mergeKind: record.mergeKind,
    linkedScheduleRecordId: record.linkedScheduleRecordId ?? null,
    billingMonth: record.billingMonth,
    sourceFileName: sanitizeText(record.sourceFileName, 200),
  };
  return JSON.stringify(payload);
}

export function isSameAmazonExpenseContent(
  existing: AmazonPerformanceExpenseRecord,
  next: AmazonPerformanceExpenseRecord,
): boolean {
  return amazonExpenseContentHash(existing) === amazonExpenseContentHash(next);
}

/** プレビュー行から経費保存用レコードを生成 */
export function buildAmazonExpenseFromReviewRow(
  row: AmazonMergeReviewRow,
  sourceFileName: string,
  existingId?: string,
): AmazonPerformanceExpenseRecord {
  const now = new Date().toISOString();
  const serviceDate = normalizeIsoDate(row.date);
  const companyName =
    row.kind === "partner_new"
      ? sanitizeText(row.companyName)
      : normalizeOwnCompanyName(row.companyName) || sanitizeText(row.companyName);

  let memo = sanitizeText(row.memo);
  if (row.kind === "partner_new") {
    const parts = [
      companyName ? `会社名：${companyName}` : "",
      row.payment > 0 ? `支払：${toMoneyNumber(row.payment)}円` : "",
      row.diff !== 0 ? `差異：${toMoneyNumber(row.diff)}円` : "",
      row.routeLabel ? `便名：${sanitizeText(row.routeLabel)}` : "",
    ].filter(Boolean);
    const summary = parts.join("、");
    memo = memo ? `${summary}／${memo}` : summary;
  }

  return {
    id: existingId ?? crypto.randomUUID(),
    serviceDate,
    driverName: sanitizeText(row.driverName, 80),
    companyName,
    routeLabel: (() => {
      const routeType = classifyAmazonRouteType(row.routeLabel);
      return sanitizeText(
        routeType !== "other" ? routeType : row.routeLabel,
        80,
      );
    })(),
    revenue: toMoneyNumber(row.revenue),
    payment: toMoneyNumber(row.payment),
    diff: toMoneyNumber(row.diff),
    memo,
    laborCost: toMoneyNumber(row.laborCost),
    mergeKind: row.kind,
    linkedScheduleRecordId: row.existingRecordId,
    billingMonth: billingMonthFromDate(serviceDate),
    sourceFileName: sanitizeText(sourceFileName, 200),
    createdAt: now,
    updatedAt: now,
  };
}

export function indexAmazonExpensesByMatchKey(
  existing: AmazonPerformanceExpenseRecord[],
): Map<string, AmazonPerformanceExpenseRecord> {
  const map = new Map<string, AmazonPerformanceExpenseRecord>();
  for (const record of existing) {
    const primary = amazonExpenseMatchKey(record);
    if (!map.has(primary)) map.set(primary, record);
    const legacy = amazonExpenseLegacyMatchKey(record);
    if (!map.has(legacy)) map.set(legacy, record);
  }
  return map;
}

export function findExistingAmazonExpense(
  existingByKey: Map<string, AmazonPerformanceExpenseRecord>,
  row: AmazonMergeReviewRow,
): AmazonPerformanceExpenseRecord | undefined {
  const primary = amazonExpenseMatchKey({
    serviceDate: row.date,
    driverName: row.driverName,
    companyName: row.companyName,
    routeLabel: row.routeLabel,
  });
  const legacy = amazonExpenseLegacyMatchKey({
    serviceDate: row.date,
    driverName: row.driverName,
    companyName: row.companyName,
  });

  return existingByKey.get(primary) ?? existingByKey.get(legacy);
}
