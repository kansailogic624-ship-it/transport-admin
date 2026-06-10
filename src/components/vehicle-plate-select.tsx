"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  normalizeVehicleNumber,
  resolveVehicleMasterLabel,
  vehiclesMatch,
} from "@/lib/import-match-keys";
import { cn } from "@/lib/utils";

const UNSELECTED = "__UNSELECTED__";

type VehiclePlateSelectProps = {
  value: string;
  vehicles: string[];
  /** OCRで読み取ったがマスタにない車番（参考表示用） */
  ocrHint?: string;
  onChange: (plate: string) => void;
  className?: string;
};

/**
 * 社内車両マスタから車両ナンバーを選択するドロップダウン。
 * マスタにない・不正な値は「未選択（要確認）」にフォールバック。
 */
export function VehiclePlateSelect({
  value,
  vehicles,
  ocrHint,
  onChange,
  className,
}: VehiclePlateSelectProps) {
  const cleaned = (value ?? "")
    .replace(/undefined/gi, "")
    .trim();
  const inMaster = cleaned && vehicles.includes(cleaned);
  const selectValue = inMaster ? cleaned : UNSELECTED;

  const hint =
    ocrHint?.replace(/undefined/gi, "").trim() ||
    (!inMaster && cleaned ? cleaned : "");

  if (vehicles.length === 0) {
    return (
      <p className="text-[11px] text-amber-700">
        車両マスタ未登録。マスタ登録から車両を追加してください。
      </p>
    );
  }

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onChange(v === UNSELECTED ? "" : (v ?? ""))}
    >
      <SelectTrigger className={cn("h-7 w-full font-mono text-xs", className)}>
        <SelectValue placeholder="未選択（要確認）" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSELECTED}>
          <span className="text-amber-700">未選択（要確認）</span>
        </SelectItem>
        {hint && !inMaster && (
          <SelectItem value={`__ocr_${hint}`} disabled>
            OCR認識: {hint}（マスタ未登録）
          </SelectItem>
        )}
        {vehicles.map((plate) => (
          <SelectItem key={plate} value={plate}>
            {plate}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** OCR結果の車番をマスタ照合して正規化（燃料代カードNo. / KJS下4桁 / コーポ全番号対応） */
export function normalizeVehicleForMaster(
  raw: string,
  vehicles: string[],
): { vehicleNumber: string; ocrHint: string } {
  const cleaned = (raw ?? "")
    .replace(/undefined/gi, "")
    .trim();
  if (!cleaned) return { vehicleNumber: "", ocrHint: "" };

  const resolved = resolveVehicleMasterLabel(cleaned, vehicles, "");
  if (resolved) return { vehicleNumber: resolved, ocrHint: "" };

  const key = normalizeVehicleNumber(cleaned);
  for (const v of vehicles) {
    if (vehiclesMatch(v, cleaned)) return { vehicleNumber: v, ocrHint: "" };
    const vk = normalizeVehicleNumber(v);
    if (vk.length >= 4 && (key.includes(vk) || vk.includes(key))) {
      return { vehicleNumber: v, ocrHint: "" };
    }
  }

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length >= 4) {
    const last4 = digits.slice(-4);
    const suffixMatches = vehicles.filter((v) => {
      const vd = v.replace(/\D/g, "");
      return vd.endsWith(last4);
    });
    if (suffixMatches.length === 1) {
      return { vehicleNumber: suffixMatches[0]!, ocrHint: "" };
    }
    if (suffixMatches.length > 1) {
      const tail = cleaned.match(/(\d{2,4}[-－]\d{2})/);
      if (tail) {
        const narrowed = suffixMatches.filter((v) =>
          v.includes(tail[1]!.replace(/[-－]/g, "")),
        );
        if (narrowed.length === 1) {
          return { vehicleNumber: narrowed[0]!, ocrHint: "" };
        }
      }
    }
  }

  return { vehicleNumber: "", ocrHint: cleaned };
}
