import type { SheetMatrix } from "@/lib/driving-report-parser";
import { SHIGA_METADATA_ROW } from "./course-definitions";

export type ShigaDeliverySheetMetadata = {
  year: number;
  month: number;
  monthPeriod: string;
  closingMonth: string;
  vendorCode: string;
  vendorName: string;
  vehicleType: string;
};

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function cellNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function normalizeVehicleType(value: string): string {
  return value.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

export function parseShigaDeliveryMetadata(
  rows: SheetMatrix,
): ShigaDeliverySheetMetadata | null {
  const metaRow = rows[1];
  if (!metaRow) return null;

  const year = cellNumber(metaRow[SHIGA_METADATA_ROW.year]);
  const month = cellNumber(metaRow[SHIGA_METADATA_ROW.month]);
  if (year <= 0 || month <= 0) return null;

  const monthPeriod = `${year}-${String(month).padStart(2, "0")}`;

  return {
    year,
    month,
    monthPeriod,
    closingMonth: monthPeriod,
    vendorCode: cellText(metaRow[SHIGA_METADATA_ROW.vendorCode]),
    vendorName: cellText(metaRow[SHIGA_METADATA_ROW.vendorName]),
    vehicleType: normalizeVehicleType(
      cellText(metaRow[SHIGA_METADATA_ROW.vehicleType]),
    ),
  };
}
