import type { TripEntry } from "./types";

/** 業務行の売上を合算（1日1売上の重複は掛け算しない） */
export function dailyRevenueFromTrips(trips: TripEntry[]): number {
  const amounts = trips
    .map((t) => Number(String(t.revenue).replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (amounts.length === 0) return 0;

  const unique = [...new Set(amounts)];
  if (unique.length === 1) return unique[0]!;

  const sorted = [...amounts].sort((a, b) => a - b);
  const allSame = amounts.every((v) => v === amounts[0]);
  if (allSame) return amounts[0]!;

  const max = Math.max(...amounts);
  const min = Math.min(...amounts);
  if (max === min) return max;

  const first = amounts[0]!;
  const repeated = amounts.every((v) => v === first);
  if (repeated) return first;

  return amounts.reduce((sum, n) => sum + n, 0);
}

/** 1日の売上は先頭業務にのみ載せ、個配明細行には載せない（合算バグ防止） */
export function applyDayRevenueToTrips(
  trips: TripEntry[],
  dayRevenue: string | number,
): TripEntry[] {
  const rev =
    typeof dayRevenue === "number"
      ? dayRevenue > 0
        ? String(Math.round(dayRevenue))
        : ""
      : dayRevenue.trim();

  if (!rev) {
    return trips.map((t) => ({ ...t, revenue: "" }));
  }

  return trips.map((t, i) => ({
    ...t,
    revenue: i === 0 ? rev : "",
  }));
}

export function formatYen(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `¥${Math.round(n).toLocaleString()}`;
}
