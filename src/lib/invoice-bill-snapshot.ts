/**
 * 請求書 OCR 原本・編集スナップショット構築
 */

import { safeNumber } from "./currency-format";
import type {
  InvoiceEditedSnapshot,
  InvoiceOcrLineSnapshot,
  InvoiceOcrSnapshot,
} from "./types";
import type { ParsedVehicleEntry } from "./maintenance-bill-parser";
import type { MaintenanceBillOcrResult } from "./maintenance-bill-ocr-summary";
import {
  extractInvoiceMeta,
  normalizeInvoiceLines,
  parseTaxType,
  toNumber,
} from "./invoice-ocr-normalize";

type BuildOcrSnapshotInput = {
  rawText: string;
  extractionMode: InvoiceOcrSnapshot["extractionMode"];
  pdfExtractionMode?: "native_text" | "ocr_fallback";
  ocrResult: MaintenanceBillOcrResult;
  aiResponse?: unknown;
  vendorName?: string;
};

export function buildOcrOriginalSnapshot(
  input: BuildOcrSnapshotInput,
): InvoiceOcrSnapshot {
  const mode =
    input.ocrResult.extractionMode === "ai"
      ? "ai"
      : input.pdfExtractionMode === "ocr_fallback"
        ? "ocr_fallback"
        : input.pdfExtractionMode === "native_text"
          ? "native_text"
          : input.ocrResult.extractionMode ?? "text";

  const meta = input.aiResponse
    ? extractInvoiceMeta(input.aiResponse)
    : { vendor_name: "", invoice_total: 0 };

  const aiLines = normalizeInvoiceLines(input.aiResponse);
  const lines: InvoiceOcrLineSnapshot[] =
    aiLines.length > 0
      ? aiLines.map((raw) => {
          const row =
            raw != null && typeof raw === "object"
              ? (raw as Record<string, unknown>)
              : {};
          const vehicle = String(
            row.vehicle_number ?? row.vehicleNumber ?? "",
          ).trim();
          const amounts = input.ocrResult.vehicles.find(
            (v) => v.vehicleNumber === vehicle,
          );
          return {
            vehicle_number: vehicle,
            repair_type: String(
              row.repair_type ?? row.maintenance_type ?? "",
            ).trim(),
            amount_text: String(
              row.amount_text ?? row.amount ?? row.base_amount ?? "",
            ).trim(),
            tax_text: String(row.tax_text ?? row.tax_amount ?? "").trim(),
            common_text: String(
              row.common_text ?? row.common_expense ?? "",
            ).trim(),
            tax_type: parseTaxType(row.tax_type ?? row.taxType),
            labor_fee: safeNumber(amounts?.laborFee),
            parts_fee: safeNumber(amounts?.partsFee),
            common_expense: safeNumber(amounts?.commonExpense),
            consumption_tax: safeNumber(amounts?.consumptionTax),
            total_amount: safeNumber(amounts?.totalAmount),
          };
        })
      : (input.ocrResult.vehicles ?? []).map((v) => ({
          vehicle_number: v.vehicleNumber ?? "",
          repair_type: v.workDescription ?? v.maintenanceType ?? "",
          amount_text: String(
            safeNumber(v.laborFee) + safeNumber(v.partsFee) || "",
          ),
          tax_text: String(safeNumber(v.consumptionTax) || ""),
          common_text: String(safeNumber(v.commonExpense) || ""),
          tax_type: v.taxCategory === "exempt" ? "非課税" : "税抜",
          labor_fee: safeNumber(v.laborFee),
          parts_fee: safeNumber(v.partsFee),
          common_expense: safeNumber(v.commonExpense),
          consumption_tax: safeNumber(v.consumptionTax),
          total_amount: safeNumber(v.totalAmount),
        }));

  return {
    rawText: input.rawText.slice(0, 100000),
    extractionMode: mode,
    parsedAt: new Date().toISOString(),
    vendor_name: meta.vendor_name || input.vendorName,
    lines,
    aiResponse: input.aiResponse ?? undefined,
  };
}

export function buildEditedSnapshot(input: {
  vendorName: string;
  clientName: string;
  billingMonth: string;
  issueDate: string;
  billType: InvoiceEditedSnapshot["billType"];
  totalAmount: number;
  maintenanceSubtotalExTax: number;
  taxAmount: number;
  expensesSubtotal: number;
  memo: string;
  vehicles: ParsedVehicleEntry[];
}): InvoiceEditedSnapshot {
  return {
    updatedAt: new Date().toISOString(),
    vendorName: input.vendorName,
    clientName: input.clientName,
    billingMonth: input.billingMonth,
    issueDate: input.issueDate,
    billType: input.billType,
    totalAmount: toNumber(input.totalAmount),
    maintenanceSubtotalExTax: toNumber(input.maintenanceSubtotalExTax),
    taxAmount: toNumber(input.taxAmount),
    expensesSubtotal: toNumber(input.expensesSubtotal),
    memo: input.memo,
    lines: (input.vehicles ?? []).map((v) => ({
      vehicleNumber: v.vehicleNumber ?? "",
      maintenanceType: v.maintenanceType,
      workDescription: v.workDescription ?? "",
      laborFee: safeNumber(v.laborFee),
      partsFee: safeNumber(v.partsFee),
      commonExpense: safeNumber(v.commonExpense),
      consumptionTax: safeNumber(v.consumptionTax),
      totalAmount: safeNumber(v.totalAmount),
      taxCategory: v.taxCategory,
    })),
  };
}
