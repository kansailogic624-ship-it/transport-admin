import type {
  ShigaDeliveryCourseId,
  ShigaDeliveryJoinKeyParts,
} from "./types";

export function buildShigaDeliveryJoinKey(
  parts: ShigaDeliveryJoinKeyParts,
): string {
  return [
    parts.vendorCode,
    parts.vendorName,
    parts.courseId,
    parts.businessDate,
  ].join("|");
}

export function buildShigaDeliveryJoinKeyParts(input: {
  vendorCode: string;
  vendorName: string;
  courseId: ShigaDeliveryCourseId;
  businessDate: string;
}): ShigaDeliveryJoinKeyParts {
  return {
    vendorCode: input.vendorCode,
    vendorName: input.vendorName,
    courseId: input.courseId,
    businessDate: input.businessDate,
  };
}
