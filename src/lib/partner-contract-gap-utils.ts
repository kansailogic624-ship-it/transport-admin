import { findPartnerProfileByName } from "@/lib/partner-company-utils";
import type { ShigaFmReconciliationRow } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import type { MasterData } from "@/lib/types";

/** 支払契約未登録行から協力会社IDを推定 */
export function resolvePartnerIdFromPaymentGapRows(
  masters: MasterData,
  rows: ShigaFmReconciliationRow[],
): string | null {
  for (const row of rows) {
    if (
      row.costCategory !== "partner" ||
      row.status !== "mapping_failed" ||
      !row.mismatchReasons.some((m) => m.includes("支払契約が未登録"))
    ) {
      continue;
    }
    const name = row.paymentParty?.trim();
    if (!name || name === "—" || name === "未登録") continue;
    const profile = findPartnerProfileByName(masters, name);
    if (profile) return profile.id;
  }
  return null;
}

/** @deprecated resolvePartnerIdFromPaymentGapRows */
export function resolvePartnerIdFromContractGapRows(
  masters: MasterData,
  rows: ShigaFmReconciliationRow[],
): string | null {
  return resolvePartnerIdFromPaymentGapRows(masters, rows);
}
