import type { AllocationExpenseEntry, MasterData } from "./types";

export function sumAllocationExpenses(masters: MasterData): number {
  return (masters.allocationExpenses ?? []).reduce(
    (sum, entry) => sum + (Number(entry.amount) > 0 ? Number(entry.amount) : 0),
    0,
  );
}

export function createAllocationExpenseEntry(
  label = "",
  amount = 0,
): AllocationExpenseEntry {
  return {
    id: crypto.randomUUID(),
    label,
    amount,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeAllocationExpenses(
  masters: MasterData,
): MasterData {
  const entries = (masters.allocationExpenses ?? []).map((entry) => ({
    id: entry.id || crypto.randomUUID(),
    label: entry.label?.trim() ?? "",
    amount: Number(entry.amount) > 0 ? Math.round(Number(entry.amount)) : 0,
    updatedAt: entry.updatedAt,
  }));
  return { ...masters, allocationExpenses: entries };
}
