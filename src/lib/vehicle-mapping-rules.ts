/**
 * 車両番号の表記揺れ学習ルール（custom_vehicle_mapping_rules）
 *
 * インポートデータ側の "生の表記" → マスタ側の "正規表記" の対応を記憶し、
 * 次回インポート時に自動的に解決する。
 *
 * 例:
 *   "京都9144"  → "品川500あ1234"（FM では "91-44" と書かれているが同車両）
 *   "9144"      → "品川500あ1234"
 *   "京都A"     → "滋賀500あ9988"（英字付きで通常の digits-only 照合が効かない場合）
 */

import { VEHICLE_MAPPING_RULES_KEY, type VehicleMappingRule } from "./types";
import { normalizeVehicleNumber, vehiclesMatch } from "./import-match-keys";

// ---------------------------------------------------------------------------
// 永続化（localStorage）
// ---------------------------------------------------------------------------

export function loadVehicleMappingRules(): VehicleMappingRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VEHICLE_MAPPING_RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is VehicleMappingRule =>
        !!r &&
        typeof r === "object" &&
        typeof (r as VehicleMappingRule).rawVehicle === "string" &&
        typeof (r as VehicleMappingRule).canonicalVehicle === "string",
    );
  } catch {
    return [];
  }
}

export function saveVehicleMappingRules(rules: VehicleMappingRule[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VEHICLE_MAPPING_RULES_KEY, JSON.stringify(rules));
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * 車両マッピングルールを追加または更新する。
 * rawVehicle が既存のルールと一致する場合は canonicalVehicle と hitCount を更新する。
 */
export function upsertVehicleMappingRule(
  rawVehicle: string,
  canonicalVehicle: string,
  existing?: VehicleMappingRule[],
): VehicleMappingRule[] {
  const raw = rawVehicle.trim();
  const canonical = canonicalVehicle.trim();
  if (!raw || !canonical || raw === canonical) return existing ?? loadVehicleMappingRules();

  const rules = existing ?? loadVehicleMappingRules();
  const now = new Date().toISOString();

  const idx = rules.findIndex((r) => r.rawVehicle === raw);
  if (idx >= 0) {
    const updated = [...rules];
    updated[idx] = {
      ...updated[idx]!,
      canonicalVehicle: canonical,
      updatedAt: now,
      hitCount: updated[idx]!.hitCount + 1,
    };
    saveVehicleMappingRules(updated);
    return updated;
  }

  const next: VehicleMappingRule = {
    id: crypto.randomUUID(),
    rawVehicle: raw,
    canonicalVehicle: canonical,
    createdAt: now,
    updatedAt: now,
    hitCount: 1,
  };
  const merged = [next, ...rules];
  saveVehicleMappingRules(merged);
  return merged;
}

// ---------------------------------------------------------------------------
// 解決ロジック
// ---------------------------------------------------------------------------

/**
 * rawVehicle を学習ルール → 正規化照合の順で解決し、正規表記を返す。
 * ルールにヒットしない場合は rawVehicle をそのまま返す。
 *
 * @param rawVehicle   インポートデータ側の車両番号
 * @param masterVehicles  マスタの車両番号配列（省略可）
 * @param rules           学習ルール配列（省略時は localStorage から読む）
 */
export function resolveVehicleNumber(
  rawVehicle: string,
  masterVehicles?: string[],
  rules?: VehicleMappingRule[],
): string {
  const trimmed = rawVehicle.trim();
  if (!trimmed) return trimmed;

  const effectiveRules = rules ?? loadVehicleMappingRules();
  const normRaw = normalizeVehicleNumber(trimmed);

  // 1. 完全一致（rawVehicle そのまま）
  const exact = effectiveRules.find((r) => r.rawVehicle === trimmed);
  if (exact) return exact.canonicalVehicle;

  // 2. 正規化後の一致
  const normMatch = effectiveRules.find(
    (r) => normalizeVehicleNumber(r.rawVehicle) === normRaw,
  );
  if (normMatch) return normMatch.canonicalVehicle;

  // 3. masterVehicles が渡された場合は vehiclesMatch で解決
  if (masterVehicles) {
    const matched = masterVehicles.find((v) => vehiclesMatch(v, trimmed));
    if (matched) return matched;
  }

  return trimmed;
}

/**
 * 車両番号がマスタに登録済みかどうかを判定する。
 * 学習ルール → digits-only 照合まで含めて確認する。
 */
export function isKnownVehicle(
  vehicleNum: string,
  masterVehicles: string[],
  rules?: VehicleMappingRule[],
): boolean {
  if (!vehicleNum) return true; // 空欄は "不明不要" として OK 扱い
  if (masterVehicles.length === 0) return false;

  // 学習ルールで解決してから照合
  const resolved = resolveVehicleNumber(vehicleNum, masterVehicles, rules);

  return masterVehicles.some(
    (v) => vehiclesMatch(v, resolved) || vehiclesMatch(v, vehicleNum),
  );
}
