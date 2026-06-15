import type { ShigaDeliveryCourseId } from "../shiga-delivery/types";

export type ShigaFmSlotAssignmentType = "partner" | "part_time" | "employee";

export const SHIGA_FM_SLOT_ASSIGNMENT_TYPE_LABELS: Record<
  ShigaFmSlotAssignmentType,
  string
> = {
  partner: "傭車",
  part_time: "アルバイト",
  employee: "自社社員",
};

export type ShigaFmSlotAssignment = {
  id: string;
  /** `${businessDate}|${courseId}|${slotIndex}` */
  slotKey: string;
  monthPeriod: string | null;
  businessDate: string;
  courseId: ShigaDeliveryCourseId;
  courseName: string;
  slotIndex: number;
  unitCount: number;
  jobName: string;
  assignmentType: ShigaFmSlotAssignmentType;
  /** 傭車: 取引先台帳の協力会社ID */
  partnerId?: string;
  /** 傭車: 表示用（非正規化） */
  partnerName?: string;
  /** アルバイト: 支払額（円） */
  partTimePaymentAmount?: number;
  /** アルバイト・自社社員: 請求額（FM未登録時） */
  salesAmount?: number;
  /** 表示用 */
  workerName?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export function buildSlotAssignmentKey(input: {
  businessDate: string;
  courseId: string;
  slotIndex: number;
}): string {
  return `${input.businessDate}|${input.courseId}|${input.slotIndex}`;
}

export function defaultPartnerVendorForCourse(
  _courseId: ShigaDeliveryCourseId,
): string {
  return "";
}
