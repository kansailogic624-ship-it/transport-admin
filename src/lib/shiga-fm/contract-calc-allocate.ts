import type { PartnerPaymentCalcInput } from "./partner-payment-types";

/**
 * 複数台日の残業・高速を台数で均等按分する。
 */
export function allocatePerUnitAmounts(
  totalOvertimeHours: number,
  totalTollAmount: number,
  unitCount: number,
  slotIndex: number,
): PartnerPaymentCalcInput {
  const count = Math.max(1, unitCount);
  const index = Math.max(1, Math.min(slotIndex, count));
  if (index < count) {
    return {
      overtimeHours:
        Math.round((totalOvertimeHours / count) * 100) / 100,
      tollAmount: Math.floor(totalTollAmount / count),
    };
  }
  const priorOvertime =
    (Math.round((totalOvertimeHours / count) * 100) / 100) * (count - 1);
  const priorToll = Math.floor(totalTollAmount / count) * (count - 1);
  return {
    overtimeHours: Math.max(0, totalOvertimeHours - priorOvertime),
    tollAmount: Math.max(0, totalTollAmount - priorToll),
  };
}
