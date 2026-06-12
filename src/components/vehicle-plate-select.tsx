"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  buildVehicleIndexKeys,
  extractPureVehicleDigits,
  pureVehicleDigitsMatch,
  resolveVehicleMasterLabel,
  vehicleIndexKeysOverlap,
  vehiclesMatch,
} from "@/lib/import-match-keys";
import {
  coerceToVehicleLabel,
  filterVehicleSelectOptions,
  findVehicleInOptions,
  hyphenCodeCandidates,
  normalizeVehicleSelectInput,
  sortVehicleSelectOptions,
  toVehicleLabelList,
} from "@/lib/vehicle-select-options";
import { cn } from "@/lib/utils";

const UNSELECTED = "__UNSELECTED__";

type VehiclePlateSelectProps = {
  value: string;
  /** string[] / VehicleDetail[] / VehicleSelectOption[] を許容 */
  vehicles: unknown;
  /** OCRで読み取ったがマスタにない車番（参考表示用） */
  ocrHint?: string;
  onChange: (plate: string) => void;
  className?: string;
};

/**
 * 社内車両マスタから車両ナンバーを選択するドロップダウン。
 * 1台1選択肢（正式登録番号表示）。下4桁・社内コードでの検索フィルタ対応。
 */
export function VehiclePlateSelect({
  value,
  vehicles,
  ocrHint,
  onChange,
  className,
}: VehiclePlateSelectProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const options = useMemo(
    () => normalizeVehicleSelectInput(vehicles),
    [vehicles],
  );

  const filteredOptions = useMemo(
    () =>
      sortVehicleSelectOptions(
        filterVehicleSelectOptions(options, searchQuery),
      ),
    [options, searchQuery],
  );

  const cleaned = coerceToVehicleLabel(value);
  const matchedOption = findVehicleInOptions(cleaned, options);
  const inMaster = Boolean(matchedOption);
  const selectValue = matchedOption || UNSELECTED;

  const hint =
    coerceToVehicleLabel(ocrHint) ||
    (!inMaster && cleaned ? cleaned : "");

  if (options.length === 0) {
    return (
      <p className="text-[11px] text-amber-700">
        車両マスタ未登録。マスタ登録から車両を追加してください。
      </p>
    );
  }

  return (
    <Select
      value={selectValue ?? ""}
      onValueChange={(v) => {
        setSearchQuery("");
        onChange(v === UNSELECTED ? "" : coerceToVehicleLabel(v));
      }}
    >
      <SelectTrigger className={cn("h-7 w-full font-mono text-xs", className)}>
        <SelectValue placeholder="未選択（要確認）" />
      </SelectTrigger>
      <SelectContent>
        <div
          className="sticky top-0 z-10 border-b bg-popover p-1.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Input
            className="h-7 font-mono text-xs"
            placeholder="車番で検索（60-30 / 6030）"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <SelectItem value={UNSELECTED}>
          <span className="text-amber-700">未選択（要確認）</span>
        </SelectItem>
        {hint && !inMaster && (
          <SelectItem value={`__ocr_${hint}`} disabled>
            OCR認識: {hint}（マスタ未登録）
          </SelectItem>
        )}
        {filteredOptions.length === 0 && searchQuery.trim() && (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            「{searchQuery}」に一致する車両がありません
          </div>
        )}
        {filteredOptions.map((opt) => (
          <SelectItem key={opt.vehicleId ?? opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** OCR結果の車番をマスタ照合して正規化（燃料代カードNo. / KJS下4桁 / コーポ全番号対応） */
export function normalizeVehicleForMaster(
  raw: string,
  vehicles: unknown,
): { vehicleNumber: string; ocrHint: string } {
  const labels = toVehicleLabelList(vehicles);
  const cleaned = coerceToVehicleLabel(raw);
  if (!cleaned) return { vehicleNumber: "", ocrHint: "" };

  const direct = findVehicleInOptions(cleaned, vehicles);
  if (direct) return { vehicleNumber: direct, ocrHint: "" };

  const digits = cleaned.replace(/\D/g, "");
  const candidates = [
    cleaned,
    ...buildVehicleIndexKeys(cleaned),
    ...hyphenCodeCandidates(digits),
    ...(digits ? [digits] : []),
  ];
  for (const cand of [...new Set(candidates)]) {
    const hit = findVehicleInOptions(cand, vehicles);
    if (hit) return { vehicleNumber: hit, ocrHint: "" };
  }

  const pureQuery = extractPureVehicleDigits(cleaned);
  if (pureQuery) {
    const exactPure = labels.filter(
      (v) => extractPureVehicleDigits(v) === pureQuery,
    );
    if (exactPure.length === 1) {
      return { vehicleNumber: exactPure[0]!, ocrHint: "" };
    }
    const loosePure = labels.filter((v) => pureVehicleDigitsMatch(v, cleaned));
    if (loosePure.length === 1) {
      return { vehicleNumber: loosePure[0]!, ocrHint: "" };
    }
  }

  const indexMatches = labels.filter((v) =>
    vehicleIndexKeysOverlap(v, cleaned),
  );
  if (indexMatches.length === 1) {
    return { vehicleNumber: indexMatches[0]!, ocrHint: "" };
  }

  const resolved = resolveVehicleMasterLabel(cleaned, labels, "");
  if (resolved && labels.some((v) => vehiclesMatch(v, resolved))) {
    return { vehicleNumber: resolved, ocrHint: "" };
  }

  return { vehicleNumber: "", ocrHint: cleaned };
}

/** 請求書全文の登録番号ヒントから車両マスタを照合 */
export function matchVehicleFromRegistrationHints(
  hints: string[],
  vehicles: unknown,
): string {
  for (const hint of hints) {
    const { vehicleNumber } = normalizeVehicleForMaster(hint, vehicles);
    if (vehicleNumber) return vehicleNumber;
  }
  return "";
}
