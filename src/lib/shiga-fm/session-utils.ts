import type {
  ShigaFmSessionDocument,
  ShigaFmSessionSaveInput,
  ShigaFmSessionSummary,
} from "./session-types";
import { SHIGA_FM_SESSION_SCHEMA_VERSION } from "./session-types";
import type { ShigaFmReconciliationResult } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import type { ShigaFmReconciliationRow } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";

export const SHIGA_FM_ACTIVE_MONTH_STORAGE_KEY = "shiga_fm_active_month";

export function formatMonthPeriodLabel(monthPeriod: string): string {
  const m = monthPeriod.match(/^(\d{4})-(\d{2})$/);
  if (!m) return monthPeriod;
  return `${m[1]}年${Number(m[2])}月`;
}

export function formatSessionTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function resolveSessionMonthPeriod(input: {
  reconcileResult?: { monthPeriod?: string | null } | null;
  shigaPreprocess?: {
    shigaDeliveryRecords?: Array<{ monthPeriod?: string }>;
  } | null;
}): string | null {
  return (
    input.reconcileResult?.monthPeriod ??
    input.shigaPreprocess?.shigaDeliveryRecords?.[0]?.monthPeriod ??
    null
  );
}

/** Firestore 保存用: 派生 reconcileIssues を除去 */
export function stripReconcileIssuesFromRow(
  row: ShigaFmReconciliationRow,
): ShigaFmReconciliationRow {
  const { reconcileIssues: _removed, ...rest } = row;
  return rest;
}

/** Firestore 保存用: 突合結果から派生 reconcileIssues を除去 */
export function stripReconcileIssuesFromResult(
  result: ShigaFmReconciliationResult | null,
): ShigaFmReconciliationResult | null {
  if (!result) return null;
  return {
    ...result,
    rows: result.rows.map(stripReconcileIssuesFromRow),
  };
}

export function buildShigaFmSessionDocument(
  input: ShigaFmSessionSaveInput,
  now: string = new Date().toISOString(),
): ShigaFmSessionDocument {
  const { preprocessCache, reconcileResult, monthPeriod } = input;
  const shiga = preprocessCache.shiga;
  const fm = preprocessCache.fm;
  const diagnostics = reconcileResult?.diagnostics;

  return {
    schemaVersion: SHIGA_FM_SESSION_SCHEMA_VERSION,
    monthPeriod,
    shigaFileName: shiga?.sourceFileName ?? null,
    fmFileName: fm?.sourceFileName ?? null,
    savedAt: input.preserveSavedAt ?? now,
    reconciledAt: reconcileResult
      ? (input.preserveReconciledAt ?? now)
      : (input.preserveReconciledAt ?? null),
    updatedAt: now,
    shigaRecordCount: shiga?.shigaDeliveryRecords?.length ?? 0,
    fmRecordCount: fm?.fmScheduleRecords?.length ?? 0,
    reconcileRowCount: reconcileResult?.rows.length ?? 0,
    fmShortageCount: reconcileResult?.totals.fmShortageCount ?? 0,
    unregisteredCount: reconcileResult?.totals.unregisteredCount ?? 0,
    employeeCount: diagnostics?.employeeCount ?? 0,
    partnerCount: diagnostics?.partnerCount ?? 0,
    employeeNames: preprocessCache.employeeNames,
    shigaPreprocess: shiga,
    fmPreprocess: fm,
    reconcileResult: stripReconcileIssuesFromResult(reconcileResult),
  };
}

export function toSessionSummary(doc: ShigaFmSessionDocument): ShigaFmSessionSummary {
  return {
    monthPeriod: doc.monthPeriod,
    shigaFileName: doc.shigaFileName,
    fmFileName: doc.fmFileName,
    savedAt: doc.savedAt,
    reconciledAt: doc.reconciledAt,
    shigaRecordCount: doc.shigaRecordCount,
    fmRecordCount: doc.fmRecordCount,
    reconcileRowCount: doc.reconcileRowCount,
    fmShortageCount: doc.fmShortageCount,
    unregisteredCount: doc.unregisteredCount,
    employeeCount: doc.employeeCount,
    partnerCount: doc.partnerCount,
  };
}
