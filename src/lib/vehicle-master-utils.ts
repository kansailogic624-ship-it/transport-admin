import { vehiclesMatch } from "./import-match-keys";

/** マスタ内で表記ゆれ一致する車両を検索（除外ID任意） */
export function findMatchingVehicleInList(
  vehicles: string[],
  value: string,
  except?: string,
): string | null {
  const v = value.trim();
  if (!v) return null;
  for (const item of vehicles) {
    if (except && item === except) continue;
    if (vehiclesMatch(item, v)) return item;
  }
  return null;
}

export function vehicleExistsInList(
  vehicles: string[],
  value: string,
): boolean {
  const v = value.trim();
  if (!v) return false;
  return vehicles.some((item) => vehiclesMatch(item, v));
}

/** マスタ内の1件を別表記にリネーム（同一正規化キーの重複は拒否） */
export function renameVehicleInList(
  vehicles: string[],
  oldValue: string,
  newValue: string,
): string[] | null {
  const next = newValue.trim();
  if (!next) return null;
  if (next === oldValue) return vehicles;

  const duplicate = findMatchingVehicleInList(vehicles, next, oldValue);
  if (duplicate) return null;

  return vehicles.map((v) => (v === oldValue ? next : v));
}
