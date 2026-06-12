import { normalizeCompanyNameKey } from "@/lib/amazon-own-company";
import { normalizeDriverName } from "@/lib/driving-report-parser";
import { normalizeVehicleNumber } from "@/lib/import-match-keys";
import type { AliasType } from "./types";

function normalizeCourseAliasKey(raw: string): string {
  return (raw ?? "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[\s\u3000]+/g, "")
    .toLowerCase();
}

/** 名寄せ lookup 用キー（全 alias 種別共通入口） */
export function normalizeAliasKey(aliasType: AliasType, raw: string): string {
  const text = (raw ?? "").trim();
  if (!text) return "";

  switch (aliasType) {
    case "employee":
      return normalizeDriverName(text);
    case "vehicle":
      return normalizeVehicleNumber(text);
    case "shipper":
      return normalizeCompanyNameKey(text);
    case "course":
      return normalizeCourseAliasKey(text);
    default:
      return text.toLowerCase();
  }
}
