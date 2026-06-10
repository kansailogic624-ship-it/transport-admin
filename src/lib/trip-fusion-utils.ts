import { applyDayRevenueToTrips, dailyRevenueFromTrips } from "./day-revenue";
import { upsertCustomMappingRule } from "./custom-mapping-rules";
import type {
  DailyRecord,
  FusionDispatchOption,
  MasterData,
  TripEntry,
} from "./types";
import { upsertMappingRule } from "./mapping-rules";

export function fusionOptionsFromDispatches(
  rows: Array<{
    dispatchName: string;
    shipperName: string;
    revenue: string;
    vehicleNumber: string;
  }>,
): FusionDispatchOption[] {
  const seen = new Set<string>();
  const out: FusionDispatchOption[] = [];
  for (const d of rows) {
    const name = d.dispatchName.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({
      dispatchName: name,
      shipperName: d.shipperName.trim(),
      revenue: d.revenue.trim(),
      vehicleNumber: d.vehicleNumber.trim(),
    });
  }
  return out;
}

export function applyDispatchOptionToTrip(
  trip: TripEntry,
  option: FusionDispatchOption | null,
  overrides?: Partial<{
    jobName: string;
    shipperName: string;
    revenue: string;
  }>,
): TripEntry {
  return {
    ...trip,
    linkedDispatchName: option?.dispatchName ?? trip.linkedDispatchName,
    jobName: overrides?.jobName ?? option?.dispatchName ?? trip.jobName,
    shipperName: overrides?.shipperName ?? option?.shipperName ?? trip.shipperName,
    revenue: overrides?.revenue ?? option?.revenue ?? trip.revenue,
    vehicleNumber: option?.vehicleNumber || trip.vehicleNumber,
  };
}

/** 1日売上：FileMaker 配車プールから日次売上を決定する。
 *  - 全配車が同じ売上 → その値（重複を除いた 1 つ）
 *  - 配車ごとに売上が異なる → 合計（日報トリップが 0 件のプレースホルダー用）
 *  - per-trip モデル（各トリップに個別売上を設定済み）の場合は呼び出し側で skip する
 */
export function resolveDayRevenueFromPool(
  pool: Array<{ revenue: string; vehicleNumber: string }>,
  vehicleNumber: string,
): string {
  const nums = pool
    .map((d) => Number(d.revenue.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (nums.length === 0) return pool[0]?.revenue?.trim() ?? "";

  const unique = [...new Set(nums)];
  // 全配車の売上が同一額 → その額を返す
  if (unique.length === 1) return String(unique[0]!);

  // 配車ごとに売上が異なる → 合算して日次売上とする
  // （日報トリップが 0 件でプレースホルダー 1 件の場合に正しい合計を表示するため）
  return String(nums.reduce((sum, n) => sum + n, 0));
}

/** プレビュー1行（ドライバー×日）単位の手動修正 */
export function patchRecordDayFusion(
  record: DailyRecord,
  patch: {
    dispatchName: string;
    dayRevenue?: string;
    reportedDistanceKm?: number;
    learn: boolean;
  },
  masters: MasterData,
): { record: DailyRecord; masters: MasterData } {
  const options = record.fusionDispatchOptions ?? [];
  const option = patch.dispatchName
    ? (options.find((o) => o.dispatchName === patch.dispatchName) ?? null)
    : null;

  const dayRevenue =
    patch.dayRevenue?.trim() ||
    option?.revenue?.trim() ||
    resolveDayRevenueFromPool(options, record.trips[0]?.vehicleNumber ?? "");

  let trips = record.trips.map((t) => {
    const base = applyDispatchOptionToTrip(t, option, {
      jobName: option?.dispatchName ?? t.jobName,
      shipperName: option?.shipperName ?? t.shipperName,
      revenue: "",
    });
    return base;
  });

  trips = applyDayRevenueToTrips(trips, dayRevenue);

  const nextRecord: DailyRecord = {
    ...record,
    trips,
    primaryLinkedDispatchName: patch.dispatchName || undefined,
    reportedDistanceKm:
      patch.reportedDistanceKm != null && patch.reportedDistanceKm > 0
        ? patch.reportedDistanceKm
        : record.reportedDistanceKm,
  };

  let nextMasters = masters;
  if (patch.learn && patch.dispatchName) {
    const keyword =
      record.driverName.trim() ||
      record.trips[0]?.reportSourceLabel?.trim() ||
      patch.dispatchName;
    upsertCustomMappingRule({
      reportKeyword: keyword,
      shipperName: record.trips[0]?.shipperName ?? "",
      dispatchName: patch.dispatchName,
      vehicleNumber: record.trips[0]?.vehicleNumber,
      driverName: record.driverName,
      date: record.date,
    });
    nextMasters = upsertMappingRule(nextMasters, {
      reportKeyword: keyword,
      shipperName: record.trips[0]?.shipperName ?? "",
      dispatchName: patch.dispatchName,
      vehicleNumber: record.trips[0]?.vehicleNumber,
    });
  }

  return { record: nextRecord, masters: nextMasters };
}

export function patchRecordTripFusion(
  record: DailyRecord,
  tripId: string,
  patch: {
    dispatchName: string;
    jobName?: string;
    shipperName?: string;
    revenue?: string;
    learn: boolean;
  },
  masters: MasterData,
): { record: DailyRecord; masters: MasterData } {
  const options = record.fusionDispatchOptions ?? [];
  const option = patch.dispatchName
    ? (options.find((o) => o.dispatchName === patch.dispatchName) ?? null)
    : null;

  // 対象トリップのみ更新する。他のトリップの売上は変更しない（per-trip モデル）。
  // 売上の優先順位: 明示的な patch.revenue > マッチ配車の revenue > 現在の trip.revenue
  const trips = record.trips.map((t) => {
    if (t.id !== tripId) return t;
    const revenue =
      patch.revenue !== undefined
        ? patch.revenue.trim()
        : (option?.revenue?.trim() ?? t.revenue);
    if (!patch.dispatchName) {
      return {
        ...t,
        linkedDispatchName: undefined,
        jobName: patch.jobName ?? t.jobName,
        shipperName: patch.shipperName ?? t.shipperName,
        revenue,
      };
    }
    return {
      ...t,
      linkedDispatchName: option?.dispatchName ?? patch.dispatchName,
      jobName: patch.jobName ?? option?.dispatchName ?? t.jobName,
      shipperName: patch.shipperName ?? option?.shipperName ?? t.shipperName,
      revenue,
    };
  });

  // 複数トリップに異なる売上が設定されている場合は per-trip モデルを維持する。
  // 単一売上（または未設定）の場合のみ先頭集約モデルを適用する。
  const nonZeroRevs = trips
    .map((t) => Number(String(t.revenue).replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const uniqueRevCount = new Set(nonZeroRevs).size;
  const finalTrips =
    uniqueRevCount <= 1
      ? applyDayRevenueToTrips(
          trips,
          String(dailyRevenueFromTrips(trips) || ""),
        )
      : trips;

  let nextMasters = masters;
  const trip = finalTrips.find((t) => t.id === tripId);
  if (patch.learn && trip?.reportSourceLabel?.trim()) {
    const dispatchName = patch.dispatchName || trip.jobName;
    upsertCustomMappingRule({
      reportKeyword: trip.reportSourceLabel.trim(),
      shipperName: trip.shipperName,
      dispatchName,
      vehicleNumber: trip.vehicleNumber,
      driverName: record.driverName,
      date: record.date,
    });
    nextMasters = upsertMappingRule(nextMasters, {
      reportKeyword: trip.reportSourceLabel.trim(),
      shipperName: trip.shipperName,
      dispatchName,
      vehicleNumber: trip.vehicleNumber,
    });
  }

  return {
    record: {
      ...record,
      trips: finalTrips,
    },
    masters: nextMasters,
  };
}

/** 確認完了時：個別tripの修正を保持したまま日次売上を整え、学習ルールを保存 */
export function finalizeFusionRecord(
  record: DailyRecord,
  options: { learn: boolean },
  masters: MasterData,
): { record: DailyRecord; masters: MasterData } {
  // per-trip モデル（複数の異なる売上）の場合は再配分しない
  const nonZeroRevs = record.trips
    .map((t) => Number(String(t.revenue).replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const uniqueRevCount = new Set(nonZeroRevs).size;
  const dayRev = String(dailyRevenueFromTrips(record.trips) || "");
  const trips =
    uniqueRevCount <= 1
      ? applyDayRevenueToTrips(record.trips, dayRev)
      : record.trips;

  let nextMasters = masters;

  if (options.learn) {
    // 「修正を記憶」が ON のとき、各業務タブの日報ラベルを個別キーワードに分解して学習ルールを保存する。
    // reportSourceLabel は "第二センター / 関西ヨーハブセンター / ..." のように連結されているため、
    // " / " で分割して1件ずつ保存することで将来の部分一致検索の精度を高める。
    for (const trip of trips) {
      const rawLabel = trip.reportSourceLabel?.trim() ?? "";
      const dispatch =
        trip.linkedDispatchName?.trim() || trip.jobName?.trim();
      if (!rawLabel || !dispatch) continue;

      // 連結ラベルを個別キーワードに分割（例: "A / B / C" → ["A", "B", "C"]）
      const individualLabels = rawLabel
        .split(/\s*\/\s*/)
        .map((s) => s.trim())
        .filter(Boolean);

      // 個別ラベルごとに学習ルールを1件ずつ保存する
      for (const label of individualLabels) {
        upsertCustomMappingRule({
          reportKeyword: label,
          shipperName: trip.shipperName,
          dispatchName: dispatch,
          vehicleNumber: trip.vehicleNumber,
          driverName: record.driverName,
          date: record.date,
        });
        nextMasters = upsertMappingRule(nextMasters, {
          reportKeyword: label,
          shipperName: trip.shipperName,
          dispatchName: dispatch,
          vehicleNumber: trip.vehicleNumber,
        });
      }
    }
  }

  return {
    record: confirmFusionDraft({
      ...record,
      trips,
      reportedDistanceKm: record.reportedDistanceKm,
      primaryLinkedDispatchName: record.primaryLinkedDispatchName,
    }),
    masters: nextMasters,
  };
}

export function confirmFusionDraft(record: DailyRecord): DailyRecord {
  return { ...record, isFusionDraft: false };
}
