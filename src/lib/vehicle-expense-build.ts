import type {
  BillType,
  VehicleExpenseRecord,
  VehicleMaintenanceBill,
} from "./types";

export type SimpleExpenseRow = {
  vehicleNumber: string;
  totalAmount: number;
  workDescription?: string;
};

export function buildSimpleExpenseRecords(
  rows: SimpleExpenseRow[],
  parentBill: VehicleMaintenanceBill,
): VehicleExpenseRecord[] {
  return rows
    .filter((r) => r.vehicleNumber.trim() || r.totalAmount > 0)
    .map((r) => ({
      id: crypto.randomUUID(),
      billingMonth: parentBill.billingMonth,
      vendorName: parentBill.vendorName,
      billType: parentBill.billType,
      vehicleNumber: r.vehicleNumber.trim(),
      workDescription: r.workDescription ?? "",
      laborFee: 0,
      partsFee: 0,
      commonExpense: 0,
      totalAmount: r.totalAmount,
      parentBillId: parentBill.id,
      createdAt: new Date().toISOString(),
      sourceFileName: parentBill.sourceFileName,
    }));
}

export function buildExpenseBillHeader(input: {
  vendorName: string;
  billingMonth: string;
  billType: BillType;
  totalAmount: number;
  issueDate?: string;
  clientName?: string;
  memo?: string;
  sourceFileName?: string;
}): VehicleMaintenanceBill {
  return {
    id: crypto.randomUUID(),
    vendorName: input.vendorName,
    clientName: input.clientName ?? "",
    billingMonth: input.billingMonth,
    issueDate: input.issueDate ?? "",
    billType: input.billType,
    totalAmount: input.totalAmount,
    maintenanceSubtotalExTax: 0,
    taxAmount: 0,
    expensesSubtotal: 0,
    memo: input.memo ?? "",
    sourceFileName: input.sourceFileName ?? "",
    createdAt: new Date().toISOString(),
  };
}
