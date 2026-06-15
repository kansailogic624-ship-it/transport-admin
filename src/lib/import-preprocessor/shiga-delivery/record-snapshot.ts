import type { ShigaDeliveryStagingRecord } from "./types";

export function attachShigaDeliveryOriginalSnapshots(
  records: ShigaDeliveryStagingRecord[],
): ShigaDeliveryStagingRecord[] {
  return records.map((record) => ({
    ...record,
    originalSnapshot: structuredClone(record),
  }));
}
