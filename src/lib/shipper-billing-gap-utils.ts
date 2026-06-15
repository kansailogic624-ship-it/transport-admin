import { SHIGA_FM_BILLING_PARTY } from "@/lib/import-preprocessor/shiga-fm-reconciliation/cost-classifier";
import { findShipperProfileByName } from "@/lib/shipper-company-utils";
import type { ShigaFmReconciliationRow } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import type { MasterData } from "@/lib/types";

export function resolveShipperIdFromBillingGapRows(
  masters: MasterData,
  rows: ShigaFmReconciliationRow[],
): string | null {
  for (const row of rows) {
    if (
      row.status !== "mapping_failed" ||
      !row.mismatchReasons.some((m) => m.includes("請求契約が未登録"))
    ) {
      continue;
    }
    const profile = findShipperProfileByName(masters, SHIGA_FM_BILLING_PARTY);
    if (profile) return profile.id;
  }
  const fallback = findShipperProfileByName(masters, SHIGA_FM_BILLING_PARTY);
  return fallback?.id ?? null;
}

export function resolveBillingShipperId(masters: MasterData): string | null {
  return findShipperProfileByName(masters, SHIGA_FM_BILLING_PARTY)?.id ?? null;
}
