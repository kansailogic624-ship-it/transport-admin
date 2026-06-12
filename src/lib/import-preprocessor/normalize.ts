/**
 * 前処理用の正規化（既存 lib 関数を再利用）
 */

import { classifyAmazonRouteType } from "@/lib/amazon-route-type";
import {
  isOwnCompanyName,
  OWN_COMPANY_CANONICAL_NAME,
  normalizeCompanyNameKey,
} from "@/lib/amazon-own-company";
import { normalizeDriverName } from "@/lib/driving-report-parser";
import type { ParsedFileMakerDispatch } from "@/lib/filemaker-dispatch-parser";
import {
  displayVehicleNumber,
  normalizeVehicleNumber,
  resolveVehicleMasterLabel,
} from "@/lib/import-match-keys";
import { normalizeJobNameForAggregation } from "@/lib/task-name-normalize";
import type { MasterData } from "@/lib/types";
import type {
  PreprocessNormalizeContext,
  PreprocessOperationType,
} from "./types";

const OWN_COMPANY_TEXT_MARKERS = [
  "カンサイロジック",
  "カンロジ",
  "kansailogic",
  "kansai logic",
];

function safeCompanyText(raw: string): string {
  return String(raw ?? "").trim();
}

function isAmazonOnlyLabel(text: string): boolean {
  const key = normalizeCompanyNameKey(text);
  return !key || key === "amazon";
}

/** 自社マーカー（カンサイロジック / カンロジ / Kansai Logic 等） */
export function isOwnCompanyForPreprocess(
  companyName: string | null | undefined,
): boolean {
  const raw = safeCompanyText(companyName ?? "");
  if (!raw) return false;
  if (isOwnCompanyName(raw)) return true;
  const key = normalizeCompanyNameKey(raw);
  return OWN_COMPANY_TEXT_MARKERS.some((m) =>
    key.includes(normalizeCompanyNameKey(m)),
  );
}

/** Amazon（エクセル）形式から傭車名を抽出 */
export function extractPartnerNameFromAmazonLabel(
  companyName: string,
): string | null {
  const raw = safeCompanyText(companyName);
  const paren = raw.match(/Amazon\s*[（(]\s*([^）)]+)\s*[）)]/i);
  if (paren?.[1]) return paren[1].trim();
  return null;
}

export function classifyAmazonOperationType(companyOriginal: string): {
  operationType: PreprocessOperationType;
  companyNormalized: string;
} {
  const raw = safeCompanyText(companyOriginal);

  if (!raw || isAmazonOnlyLabel(raw)) {
    return { operationType: "unknown", companyNormalized: "" };
  }

  if (isOwnCompanyForPreprocess(raw)) {
    return {
      operationType: "own",
      companyNormalized: OWN_COMPANY_CANONICAL_NAME,
    };
  }

  const partnerFromLabel = extractPartnerNameFromAmazonLabel(raw);
  if (partnerFromLabel) {
    return { operationType: "partner", companyNormalized: partnerFromLabel };
  }

  return { operationType: "partner", companyNormalized: raw };
}

/** Amazon実績の荷主名（常に Amazon） */
export const AMAZON_SHIPPER_NAME = "Amazon";

export function amazonShipperName(): string {
  return AMAZON_SHIPPER_NAME;
}

/**
 * 表示用ラベル（保存フィールドには使わない）
 * 例: Amazon（エクセル）
 */
export function amazonCarrierDisplayLabel(
  operationType: PreprocessOperationType,
  companyNormalized: string,
): string {
  if (operationType === "partner" && companyNormalized) {
    return `${AMAZON_SHIPPER_NAME}（${companyNormalized}）`;
  }
  return AMAZON_SHIPPER_NAME;
}

/** @deprecated Amazon前処理では amazonShipperName() を使用 */
export function shipperLabelFromOperation(
  _operationType: PreprocessOperationType,
  _companyNormalized: string,
): string {
  return AMAZON_SHIPPER_NAME;
}

export function normalizeDriverForPreprocess(
  raw: string,
  _ctx?: PreprocessNormalizeContext,
): { normalized: string } {
  const original = String(raw ?? "").trim();
  const normalized = original ? normalizeDriverName(original) : "";
  return { normalized };
}

export function normalizeVehicleForPreprocess(
  raw: string,
  ctx?: PreprocessNormalizeContext,
): { normalized: string; display: string } {
  const original = String(raw ?? "").trim();
  if (!original) {
    return { normalized: "", display: "" };
  }
  const masterVehicles = ctx?.vehicleMasterNumbers ?? [];
  const canonical = resolveVehicleMasterLabel(
    original,
    masterVehicles,
    original,
  );
  const display = displayVehicleNumber(canonical || original);
  const normalized = normalizeVehicleNumber(canonical || original);
  return { normalized, display: display || canonical || original };
}

function matchPartnerFromMasters(
  text: string,
  partners: string[],
): string | null {
  const key = normalizeCompanyNameKey(text);
  if (!key) return null;
  for (const partner of partners) {
    const pk = normalizeCompanyNameKey(partner);
    if (!pk) continue;
    if (key === pk || key.includes(pk) || pk.includes(key)) {
      return partner.trim();
    }
  }
  return null;
}

/** FM配車行の自社/傭車判定 */
export function classifyFmOperationType(
  dispatch: ParsedFileMakerDispatch,
  masters?: Pick<MasterData, "partners" | "drivers"> | null,
  explicitPartnerName?: string,
): {
  operationType: PreprocessOperationType;
  companyNormalized: string;
  partnerName: string;
} {
  const partners = masters?.partners ?? [];
  const shipper = String(dispatch.shipperName ?? "").trim();
  const dispatchName = String(dispatch.dispatchName ?? "").trim();

  if (dispatch.isAttendanceRow || dispatch.dayStatus) {
    return {
      operationType: "own",
      companyNormalized: OWN_COMPANY_CANONICAL_NAME,
      partnerName: "",
    };
  }

  const explicit = String(explicitPartnerName ?? "").trim();
  if (explicit) {
    if (isOwnCompanyForPreprocess(explicit)) {
      return {
        operationType: "own",
        companyNormalized: OWN_COMPANY_CANONICAL_NAME,
        partnerName: "",
      };
    }
    return {
      operationType: "partner",
      companyNormalized: explicit,
      partnerName: explicit,
    };
  }

  if (isOwnCompanyForPreprocess(shipper) || isOwnCompanyForPreprocess(dispatchName)) {
    return {
      operationType: "own",
      companyNormalized: OWN_COMPANY_CANONICAL_NAME,
      partnerName: "",
    };
  }

  const partnerFromShipper = matchPartnerFromMasters(shipper, partners);
  if (partnerFromShipper) {
    return {
      operationType: "partner",
      companyNormalized: partnerFromShipper,
      partnerName: partnerFromShipper,
    };
  }

  const partnerFromDispatch = matchPartnerFromMasters(dispatchName, partners);
  if (partnerFromDispatch) {
    return {
      operationType: "partner",
      companyNormalized: partnerFromDispatch,
      partnerName: partnerFromDispatch,
    };
  }

  if (!isOwnCompanyForPreprocess(shipper) && shipper && partners.length === 0) {
    const key = normalizeCompanyNameKey(shipper);
    if (key && key !== "amazon" && !key.includes("勤怠")) {
      return {
        operationType: "unknown",
        companyNormalized: shipper,
        partnerName: "",
      };
    }
  }

  return {
    operationType: "own",
    companyNormalized: OWN_COMPANY_CANONICAL_NAME,
    partnerName: "",
  };
}

export function normalizeShipperForPreprocess(raw: string): { normalized: string } {
  const original = String(raw ?? "").trim();
  return { normalized: original.replace(/\s+/g, " ").trim() };
}

export function normalizeJobForPreprocess(raw: string): string {
  const original = String(raw ?? "").trim();
  if (!original) return "";
  return normalizeJobNameForAggregation(original);
}

export function normalizeRouteForPreprocess(raw: string): {
  normalized: string;
  routeType: ReturnType<typeof classifyAmazonRouteType>;
} {
  const original = String(raw ?? "").trim();
  if (!original) {
    return { normalized: "", routeType: "other" };
  }
  const routeType = classifyAmazonRouteType(original);
  const normalized =
    routeType !== "other" ? routeType : original.replace(/\s+/g, " ").trim();
  return { normalized, routeType };
}
