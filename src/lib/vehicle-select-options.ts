/**
 * 車両ドロップダウン用オプション生成
 * Firestore vehicles コレクション（車両台帳）を正とする。
 */

import {
  buildVehicleIndexKeys,
  extractPureVehicleDigits,
  extractVehiclePlateSortNumber,
  hyphenCodeCandidatesFromDigits,
  normalizeVehicleNumber,
  pureVehicleDigitsMatch,
  toHalfWidthAlnum,
  vehicleIndexKeysOverlap,
  vehiclesMatch,
} from "./import-match-keys";
import { isVehicleActive, sortVehicles } from "./vehicle-ledger-utils";
import type { VehicleDetail } from "./types";

export type VehicleSelectOption = {
  /** 選択時に保持する値（正式登録番号） */
  value: string;
  /** 画面表示用ラベル（正式登録番号に統一） */
  label: string;
  /** 車両ID（重複排除用） */
  vehicleId?: string;
  /** 検索用エイリアス（社内コード・下4桁等。表示には使わない） */
  searchKeys: string[];
};

/** 未知の値を表示用文字列に変換（オブジェクト混入対策） */
export function coerceToVehicleLabel(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.replace(/undefined/gi, "").trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const key of [
      "plateNumber",
      "vehicleCode",
      "vehicleNumber",
      "label",
      "value",
      "name",
    ]) {
      const nested = o[key];
      if (typeof nested === "string" && nested.trim()) {
        return nested.replace(/undefined/gi, "").trim();
      }
    }
  }
  return "";
}

function buildSearchKeys(plate: string, code: string): string[] {
  const keys = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) keys.add(t);
  };

  if (code) {
    add(code);
    const codeDigits = code.replace(/\D/g, "");
    if (codeDigits) {
      add(codeDigits);
      for (const h of hyphenCodeCandidates(codeDigits)) add(h);
    }
  }

  if (plate) {
    if (/[・･]/.test(plate)) {
      const pure = extractPureVehicleDigits(plate);
      if (pure) add(pure);
      const suffix = plate.split(/[・･]/).pop()?.trim() ?? "";
      if (suffix) add(toHalfWidthAlnum(suffix));
    } else {
      const digits = plate.replace(/\D/g, "");
      if (digits.length >= 4) add(digits.slice(-4));
      if (digits) add(digits);
      for (const h of hyphenCodeCandidates(digits)) add(h);
    }
  }

  for (const k of buildVehicleIndexKeys(plate)) add(k);
  if (code) {
    for (const k of buildVehicleIndexKeys(code)) add(k);
  }

  const purePlate = extractPureVehicleDigits(plate);
  if (purePlate) add(purePlate);
  if (code) {
    const pureCode = extractPureVehicleDigits(code);
    if (pureCode) add(pureCode);
  }

  keys.delete(plate);
  return [...keys];
}

/** 車番（社内コード）の昇順で選択肢を並べ替え */
export function sortVehicleSelectOptions(
  options: VehicleSelectOption[],
): VehicleSelectOption[] {
  return [...options].sort((a, b) => {
    const na = extractVehiclePlateSortNumber(a.label || a.value);
    const nb = extractVehiclePlateSortNumber(b.label || b.value);
    if (na !== nb) return na - nb;
    return a.label.localeCompare(b.label, "ja", { numeric: true });
  });
}

/** 台帳1件 → 1選択肢（正式ナンバー表示、検索キーは別保持） */
export function vehicleDetailToSelectOption(
  v: VehicleDetail,
): VehicleSelectOption | null {
  const plate = coerceToVehicleLabel(v.plateNumber);
  const code = coerceToVehicleLabel(v.vehicleCode);
  const label = plate || code;
  if (!label) return null;

  return {
    value: label,
    label,
    vehicleId: coerceToVehicleLabel(v.id) || coerceToVehicleLabel(v.vehicleId),
    searchKeys: buildSearchKeys(plate, code),
  };
}

function isVehicleSelectOptionLike(item: unknown): item is VehicleSelectOption {
  if (!item || typeof item !== "object") return false;
  const o = item as Record<string, unknown>;
  return (
    typeof o.value === "string" &&
    typeof o.label === "string" &&
    !("plateNumber" in o) &&
    !("vehicleCode" in o)
  );
}

function isVehicleDetailLike(item: unknown): item is VehicleDetail {
  if (!item || typeof item !== "object") return false;
  const o = item as Record<string, unknown>;
  return "plateNumber" in o || "vehicleCode" in o;
}

function isFullPlateLabel(value: string): boolean {
  return /[\u3040-\u9fff]/.test(value);
}

/** マスタ1台=1選択肢の重複判定（異なる正式ナンバーは統合しない） */
function optionMatchesVehicle(opt: VehicleSelectOption, otherValue: string): boolean {
  if (opt.value === otherValue) return true;

  if (isFullPlateLabel(opt.value) && isFullPlateLabel(otherValue)) {
    return pureVehicleDigitsMatch(opt.value, otherValue);
  }

  if (vehiclesMatch(opt.value, otherValue)) return true;
  if (vehicleIndexKeysOverlap(opt.value, otherValue)) return true;
  return opt.searchKeys.some(
    (k) =>
      vehiclesMatch(k, otherValue) || vehicleIndexKeysOverlap(k, otherValue),
  );
}

function mergeOption(
  options: VehicleSelectOption[],
  seenIds: Set<string>,
  opt: VehicleSelectOption,
) {
  const idKey = opt.vehicleId || opt.value;
  if (seenIds.has(idKey)) return;

  const dupIdx = options.findIndex((o) => optionMatchesVehicle(o, opt.value));
  if (dupIdx >= 0) {
    const existing = options[dupIdx]!;
    if (opt.label.length > existing.label.length) {
      options[dupIdx] = {
        ...opt,
        searchKeys: [...new Set([...existing.searchKeys, ...opt.searchKeys])],
      };
    } else {
      existing.searchKeys = [...new Set([...existing.searchKeys, ...opt.searchKeys])];
    }
    seenIds.add(idKey);
    return;
  }

  seenIds.add(idKey);
  options.push(opt);
}

function stringToOption(raw: string): VehicleSelectOption {
  const label = coerceToVehicleLabel(raw);
  const digits = label.replace(/\D/g, "");
  const searchKeys = [
    ...hyphenCodeCandidates(digits),
    ...(digits.length >= 4 ? [digits.slice(-4)] : []),
    ...(digits && digits !== label ? [digits] : []),
    ...buildVehicleIndexKeys(label),
  ].filter((k) => k && k !== label);

  return {
    value: label,
    label,
    searchKeys: [...new Set(searchKeys)],
  };
}

/**
 * ドロップダウン入力を正規化（1車両1選択肢）。
 * string[] / VehicleDetail[] / VehicleSelectOption[] を受け付ける。
 */
export function normalizeVehicleSelectInput(input: unknown): VehicleSelectOption[] {
  if (!Array.isArray(input)) return [];

  const options: VehicleSelectOption[] = [];
  const seenIds = new Set<string>();

  for (const item of input) {
    if (typeof item === "string" || typeof item === "number") {
      const opt = stringToOption(String(item));
      if (options.some((o) => optionMatchesVehicle(o, opt.value))) continue;
      mergeOption(options, seenIds, opt);
      continue;
    }

    if (!item || typeof item !== "object") continue;

    const obj = item as Record<string, unknown>;

    if (isVehicleSelectOptionLike(item)) {
      const src = item as VehicleSelectOption;
      mergeOption(options, seenIds, {
        value: coerceToVehicleLabel(src.value),
        label: coerceToVehicleLabel(src.label),
        vehicleId: src.vehicleId,
        searchKeys: src.searchKeys ?? [],
      });
      continue;
    }

    if (isVehicleDetailLike(item)) {
      const opt = vehicleDetailToSelectOption(item as VehicleDetail);
      if (opt) mergeOption(options, seenIds, opt);
      continue;
    }

    if ("value" in obj || "label" in obj) {
      const label = coerceToVehicleLabel(obj.label ?? obj.value);
      if (!label) continue;
      mergeOption(options, seenIds, stringToOption(label));
      continue;
    }
  }

  return sortVehicleSelectOptions(options);
}

/** 照合・マスタ解決用のラベル文字列配列 */
export function toVehicleLabelList(input: unknown): string[] {
  return normalizeVehicleSelectInput(input).map((o) => o.value);
}

/** @deprecated vehicleDetailToSelectOption を使用 */
export function vehicleDetailToSelectLabel(v: VehicleDetail): string {
  return vehicleDetailToSelectOption(v)?.label ?? "";
}

/**
 * 稼働中車両のドロップダウン選択肢を生成（1台1行）。
 */
export function buildActiveVehicleSelectOptions(
  details: VehicleDetail[],
  extraLabels: string[] = [],
): VehicleSelectOption[] {
  const options: VehicleSelectOption[] = [];
  const seenIds = new Set<string>();

  for (const v of sortVehicles(details.filter(isVehicleActive))) {
    const opt = vehicleDetailToSelectOption(v);
    if (opt) mergeOption(options, seenIds, opt);
  }

  for (const label of extraLabels) {
    const text = coerceToVehicleLabel(label);
    if (!text) continue;
    if (options.some((o) => optionMatchesVehicle(o, text))) continue;
    mergeOption(options, seenIds, stringToOption(text));
  }

  return sortVehicleSelectOptions(options);
}

function optionMatchesQuery(opt: VehicleSelectOption, query: string): boolean {
  const q = query.trim();
  if (!q) return true;

  if (opt.label.includes(q)) return true;
  if (pureVehicleDigitsMatch(opt.label, q)) return true;
  if (vehicleIndexKeysOverlap(opt.label, q)) return true;
  if (vehiclesMatch(opt.label, q)) return true;

  return opt.searchKeys.some((key) => {
    if (key.includes(q)) return true;
    if (vehiclesMatch(key, q)) return true;
    if (vehicleIndexKeysOverlap(key, q)) return true;
    if (pureVehicleDigitsMatch(key, q)) return true;
    return false;
  });
}

/** 検索クエリで選択肢をフィルタ（表示は1件、部分一致でヒット） */
export function filterVehicleSelectOptions(
  options: VehicleSelectOption[],
  query: string,
): VehicleSelectOption[] {
  if (!query.trim()) return options;
  return options.filter((opt) => optionMatchesQuery(opt, query));
}

/** 値が選択肢のいずれかと一致するか（表記ゆれ・検索キー含む） */
export function findVehicleInOptions(
  value: string,
  optionsInput: unknown,
): string {
  const cleaned = coerceToVehicleLabel(value);
  if (!cleaned) return "";

  const options = normalizeVehicleSelectInput(
    Array.isArray(optionsInput) ? optionsInput : [],
  );

  const exact = options.find((o) => o.value === cleaned);
  if (exact) return exact.value;

  const pureQuery = extractPureVehicleDigits(cleaned);
  if (pureQuery) {
    const exactPure = options.filter(
      (o) => extractPureVehicleDigits(o.value) === pureQuery,
    );
    if (exactPure.length === 1) return exactPure[0]!.value;
    const loosePure = options.filter((o) =>
      pureVehicleDigitsMatch(o.value, cleaned),
    );
    if (loosePure.length === 1) return loosePure[0]!.value;
  }

  const matched = options.find(
    (o) =>
      vehiclesMatch(o.value, cleaned) ||
      vehicleIndexKeysOverlap(o.value, cleaned) ||
      o.searchKeys.some(
        (k) =>
          vehiclesMatch(k, cleaned) || vehicleIndexKeysOverlap(k, cleaned),
      ),
  );
  return matched?.value ?? "";
}

/** 数字のみ入力からハイフン付き社内コード候補を生成（6037 → 60-37, 600 → 60-00） */
export function hyphenCodeCandidates(digits: string): string[] {
  return hyphenCodeCandidatesFromDigits(digits);
}

/** 照合用キー（全角半角・ハイフン・空白を除去） */
export function vehicleOptionMatchKey(label: string): string {
  return normalizeVehicleNumber(label);
}
