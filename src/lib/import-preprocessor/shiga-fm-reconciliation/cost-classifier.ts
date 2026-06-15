import { normalizePersonName } from "@/lib/excel-date";
import type { FmEmployeeScheduleStagingRecord } from "../fm-employee-schedule/types";
import type { ShigaDeliveryCourseId } from "../shiga-delivery/types";

export type ShigaFmCostCategory =
  | "employee"
  | "partner"
  | "part_time"
  | "unregistered"
  | "fm_shortage"
  | "unknown";

export const SHIGA_FM_COST_CATEGORY_LABELS: Record<ShigaFmCostCategory, string> = {
  employee: "自社社員",
  partner: "傭車",
  part_time: "アルバイト",
  unregistered: "未登録",
  fm_shortage: "FM不足",
  unknown: "不明",
};

export const SHIGA_FM_BILLING_PARTY = "エフエートラック";
export const SHIGA_FM_EMPLOYEE_PAYMENT_NOTE = "自社業務のため支払なし";

export type ShigaFmCostClassification = {
  costCategory: ShigaFmCostCategory;
  paymentParty: string;
  contractVendorName: string | null;
};

export function buildEmployeeNameSet(
  names: Iterable<string>,
): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    const normalized = normalizePersonName(name);
    if (normalized) set.add(normalized);
  }
  return set;
}

export function isOwnEmployeeRow(
  record: FmEmployeeScheduleStagingRecord,
  employeeNames: Set<string>,
): boolean {
  if (record.isPartnerLikeRow) return false;
  if (!record.isRevenueRow || record.isAttendanceOnlyRow) return false;

  if (record.employeeCanonicalId?.trim()) return true;
  if (record.aliasStatus.employee === "resolved") return true;

  const original = normalizePersonName(record.employeeNameOriginal);
  const canonical = normalizePersonName(record.employeeNameCanonical ?? "");
  if (original && employeeNames.has(original)) return true;
  if (canonical && employeeNames.has(canonical)) return true;

  return false;
}

export function classifyFmRow(
  record: FmEmployeeScheduleStagingRecord,
  employeeNames: Set<string>,
): ShigaFmCostClassification {
  if (record.isPartnerLikeRow) {
    const vendor =
      record.partnerNameOriginal?.trim() ||
      record.employeeNameOriginal.trim() ||
      "傭車";
    return {
      costCategory: "partner",
      paymentParty: vendor,
      contractVendorName: vendor,
    };
  }

  if (isOwnEmployeeRow(record, employeeNames)) {
    const name =
      record.employeeNameCanonical?.trim() ||
      record.employeeNameOriginal.trim() ||
      "自社社員";
    return {
      costCategory: "employee",
      paymentParty: name,
      contractVendorName: null,
    };
  }

  return {
    costCategory: "unknown",
    paymentParty: record.employeeNameOriginal.trim() || "—",
    contractVendorName: null,
  };
}


/**
 * スロット突合時の原価区分。社員判定を優先する。
 * 傭車の支払先は FM の傭車行判定または手入力で確定する。
 */
export function classifySlotRow(
  record: FmEmployeeScheduleStagingRecord,
  _shiga: { courseId: string; vendorName: string } | null,
  employeeNames: Set<string>,
): ShigaFmCostClassification {
  return classifyFmRow(record, employeeNames);
}

export function getSlotJobName(
  courseId: ShigaDeliveryCourseId,
  slotIndex: number,
): string {
  if (courseId === "SHIGA_01") return "Joshin①";
  if (courseId === "SHIGA_02") return "Joshin②";
  if (courseId === "SHIGA_03") return "Joshin③";
  if (courseId === "SHIGA_04") {
    if (slotIndex <= 1) return "Joshin④";
    if (slotIndex === 2) return "Joshin⑤";
    return "Joshin⑥";
  }
  return `Slot${slotIndex}`;
}

export function fmJobSortRank(
  courseId: ShigaDeliveryCourseId,
  jobName: string,
): number {
  const j = jobName.trim();
  if (courseId === "SHIGA_04") {
    if (j === "Joshin④") return 0;
    if (j === "Joshin⑤") return 1;
    if (j === "Joshin⑥") return 2;
    return 10;
  }
  return 0;
}
