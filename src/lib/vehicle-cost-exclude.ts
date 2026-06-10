import type { TripEntry } from "./types";

/**
 * 車両走行を伴わない事務所・倉庫業務。
 * 車両別コスト明細・経費内訳の集計対象外とする。
 */
export function isExcludedFromVehicleCostAggregation(trip: TripEntry): boolean {
  const shipperName = trip.shipperName ?? "";
  const jobName = trip.jobName ?? "";
  return (
    shipperName.includes("事務所") ||
    shipperName.includes("倉庫") ||
    jobName.includes("事務所") ||
    jobName.includes("倉庫")
  );
}
