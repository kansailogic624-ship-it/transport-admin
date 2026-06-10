import {
  displayVehicleNumber,
  isSameVehicle,
} from "./import-match-keys";
import { addUniqueToList } from "./masters";
import type { DailyRecord } from "./types";
import {
  rewriteVehicleNumberInExpenses,
  rewriteVehicleNumberInRecords,
} from "./vehicle-master-merge";
import type { VehicleExpenseRecord } from "./types";

export type VehicleImportSource = "rollcall" | "filemaker";

export type VehicleUpgrade = {
  from: string;
  to: string;
};

/** 正式ナンバー（点呼簿）らしさのスコア。高いほどマスタの正とする */
export function vehicleFormalityScore(label: string): number {
  const cleaned = displayVehicleNumber(label) || label.trim();
  let score = cleaned.length;
  if (/[\u3040-\u9fff]/.test(cleaned)) score += 30;
  if (/[あ-んア-ン]/.test(cleaned)) score += 15;
  if (/[A-Za-zＡ-Ｚａ-ｚ]/.test(cleaned)) score += 5;
  return score;
}

export function pickPreferredVehicleLabel(
  existing: string,
  incoming: string,
  source: VehicleImportSource,
): string {
  const scoreE = vehicleFormalityScore(existing);
  const scoreI = vehicleFormalityScore(incoming);
  if (scoreI > scoreE) return incoming;
  if (scoreE > scoreI) return existing;
  return source === "rollcall" ? incoming : existing;
}

/** マスタ一覧から下4桁一致の正規表記を取得（複数候補時は最も正式な表記） */
export function findCanonicalVehicleInList(
  vehicles: string[],
  raw: string,
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  const matches = vehicles.filter((v) => isSameVehicle(v, trimmed));
  if (matches.length === 0) return null;

  return matches.reduce((best, cur) =>
    vehicleFormalityScore(cur) > vehicleFormalityScore(best) ? cur : best,
  );
}

function mergeUpgradeList(
  upgrades: VehicleUpgrade[],
  next: VehicleUpgrade | undefined,
): VehicleUpgrade[] {
  if (!next || next.from === next.to) return upgrades;
  const merged = [...upgrades];
  const existing = merged.find((u) => u.from === next.from);
  if (existing) {
    existing.to = next.to;
    return merged;
  }
  merged.push(next);
  return merged;
}

/**
 * 車両マスタへ1件登録。
 * - 点呼簿: 下4桁一致の簡易表記を正式表記へ格上げ
 * - FileMaker: 正式表記があれば新規簡易表記を登録しない
 */
export function upsertVehicleInMaster(
  vehicles: string[],
  incoming: string,
  source: VehicleImportSource,
): { vehicles: string[]; upgrade?: VehicleUpgrade } {
  const cleaned = displayVehicleNumber(incoming) || incoming.trim();
  if (!cleaned) return { vehicles };

  const canonical = findCanonicalVehicleInList(vehicles, cleaned);
  if (!canonical) {
    return { vehicles: addUniqueToList(vehicles, cleaned) };
  }

  const preferred = pickPreferredVehicleLabel(canonical, cleaned, source);
  if (preferred === canonical) {
    return { vehicles };
  }

  const nextVehicles = vehicles.map((v) =>
    isSameVehicle(v, canonical) ? preferred : v,
  );

  return {
    vehicles: dedupeVehicleMasterList(nextVehicles),
    upgrade: { from: canonical, to: preferred },
  };
}

/** マスタ内の下4桁重複を正式表記1件に統合 */
export function dedupeVehicleMasterList(vehicles: string[]): string[] {
  const kept: string[] = [];

  for (const v of vehicles) {
    const idx = kept.findIndex((k) => isSameVehicle(k, v));
    if (idx < 0) {
      kept.push(v);
      continue;
    }
    const preferred = pickPreferredVehicleLabel(kept[idx]!, v, "rollcall");
    kept[idx] = preferred;
  }

  return [...kept].sort((a, b) => a.localeCompare(b, "ja"));
}

export function reconcileVehicleMasterList(vehicles: string[]): {
  vehicles: string[];
  upgrades: VehicleUpgrade[];
} {
  const deduped = dedupeVehicleMasterList(vehicles);
  const upgrades: VehicleUpgrade[] = [];

  for (const removed of vehicles) {
    if (!deduped.some((d) => d === removed)) {
      const target = findCanonicalVehicleInList(deduped, removed);
      if (target && target !== removed) {
        upgrades.push({ from: removed, to: target });
      }
    }
  }

  for (const kept of deduped) {
    const aliases = vehicles.filter(
      (v) => v !== kept && isSameVehicle(v, kept) && v !== kept,
    );
    for (const alias of aliases) {
      upgrades.push({ from: alias, to: kept });
    }
  }

  const uniqueUpgrades: VehicleUpgrade[] = [];
  for (const u of upgrades) {
    if (u.from === u.to) continue;
    const chain = uniqueUpgrades.find((x) => x.from === u.from);
    if (chain) chain.to = u.to;
    else uniqueUpgrades.push({ ...u });
  }

  return { vehicles: deduped, upgrades: uniqueUpgrades };
}

export function applyVehicleUpgradesToRecords(
  records: DailyRecord[],
  upgrades: VehicleUpgrade[],
): DailyRecord[] {
  let next = records;
  for (const u of upgrades) {
    next = rewriteVehicleNumberInRecords(next, u.from, u.to).records;
  }
  return next;
}

export function applyVehicleUpgradesToExpenses(
  expenses: VehicleExpenseRecord[],
  upgrades: VehicleUpgrade[],
): VehicleExpenseRecord[] {
  let next = expenses;
  for (const u of upgrades) {
    next = rewriteVehicleNumberInExpenses(next, u.from, u.to).expenses;
  }
  return next;
}

/** 取込処理で蓄積したマスタ更新＋実績・経費の名寄せを一括適用 */
export function applyVehicleImportUpgrades(
  vehicles: string[],
  records: DailyRecord[],
  expenses: VehicleExpenseRecord[],
  pendingUpgrades: VehicleUpgrade[],
): {
  vehicles: string[];
  records: DailyRecord[];
  expenses: VehicleExpenseRecord[];
  upgrades: VehicleUpgrade[];
} {
  const reconciled = reconcileVehicleMasterList(vehicles);
  const allUpgrades = [...pendingUpgrades];
  for (const u of reconciled.upgrades) {
    if (!allUpgrades.some((x) => x.from === u.from)) {
      allUpgrades.push(u);
    }
  }

  return {
    vehicles: reconciled.vehicles,
    records: applyVehicleUpgradesToRecords(records, allUpgrades),
    expenses: applyVehicleUpgradesToExpenses(expenses, allUpgrades),
    upgrades: allUpgrades,
  };
}
