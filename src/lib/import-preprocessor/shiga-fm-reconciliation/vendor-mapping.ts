import { buildShigaDeliveryJoinKey } from "../shiga-delivery/join-key";
import type { ShigaDeliveryCourseId } from "../shiga-delivery/types";

export type ShigaVendorMapping = {
  vendorCode: string;
  vendorName: string;
  fmShipperNames: string[];
  aliases: string[];
};

export const SHIGA_VENDOR_MAPPING: ShigaVendorMapping[] = [
  {
    vendorCode: "411089",
    vendorName: "エフエートラック",
    fmShipperNames: ["FAトラック", "FAﾄﾗｯｸ"],
    aliases: ["エフエー", "FAトラック", "ＦＡトラック", "エフエートラック"],
  },
];

const FM_SHIPPER_LOOKUP = new Map<string, ShigaVendorMapping>();
for (const vendor of SHIGA_VENDOR_MAPPING) {
  for (const shipper of vendor.fmShipperNames) {
    FM_SHIPPER_LOOKUP.set(normalizeVendorText(shipper), vendor);
  }
  for (const alias of vendor.aliases) {
    FM_SHIPPER_LOOKUP.set(normalizeVendorText(alias), vendor);
  }
  FM_SHIPPER_LOOKUP.set(normalizeVendorText(vendor.vendorName), vendor);
  FM_SHIPPER_LOOKUP.set(normalizeVendorText(vendor.vendorCode), vendor);
}

function normalizeVendorText(value: string): string {
  return value.replace(/\u3000/g, " ").trim();
}

export function normalizeFmShipperToVendor(
  fmShipperName: string,
): ShigaVendorMapping | null {
  const key = normalizeVendorText(fmShipperName);
  return FM_SHIPPER_LOOKUP.get(key) ?? null;
}

export function isFaTruckShipper(shipperName: string): boolean {
  return normalizeFmShipperToVendor(shipperName) != null;
}

export function buildReconciliationMatchKey(input: {
  vendorCode: string;
  vendorName: string;
  courseId: ShigaDeliveryCourseId;
  businessDate: string;
}): string {
  return buildShigaDeliveryJoinKey({
    vendorCode: input.vendorCode,
    vendorName: input.vendorName,
    courseId: input.courseId,
    businessDate: input.businessDate,
  });
}
