import { formatDisplayDate, parseExcelDate } from "./excel-date";
import type { VehicleDetail } from "./types";

export type SheetMatrix = unknown[][];

const EXPECTED_HEADERS = [
  "車両ID",
  "車両番号",
  "車輛番号",
  "トン数表示",
  "車名",
  "形式",
  "車検有効期限",
  "初年度",
  "積載量",
  "全高",
  "全長",
  "全幅",
  "総重量",
  "登録年月日",
  "廃車年月日",
] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
}

function findHeaderIndex(headers: string[], label: string): number {
  const normalized = label.replace(/\s+/g, "");
  return headers.findIndex((h) => h === normalized);
}

function cellString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatVehicleDate(iso: string): string {
  return formatDisplayDate(iso);
}

export type VehicleMasterParseResult = {
  vehicles: VehicleDetail[];
  warnings: string[];
};

export function parseVehicleMasterSheet(rows: SheetMatrix): VehicleMasterParseResult {
  const warnings: string[] = [];
  if (rows.length === 0) {
    return { vehicles: [], warnings: ["シートが空です"] };
  }

  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((cell) => normalizeHeader(cell));

  const columnIndex: Record<(typeof EXPECTED_HEADERS)[number], number> = {
    車両ID: -1,
    車両番号: -1,
    車輛番号: -1,
    トン数表示: -1,
    車名: -1,
    形式: -1,
    車検有効期限: -1,
    初年度: -1,
    積載量: -1,
    全高: -1,
    全長: -1,
    全幅: -1,
    総重量: -1,
    登録年月日: -1,
    廃車年月日: -1,
  };

  for (const label of EXPECTED_HEADERS) {
    const idx = findHeaderIndex(headers, label);
    columnIndex[label] = idx;
    if (idx < 0) {
      warnings.push(`列「${label}」が見つかりません`);
    }
  }

  if (columnIndex["車両ID"] < 0) {
    return { vehicles: [], warnings };
  }

  const vehicles: VehicleDetail[] = [];
  const now = new Date().toISOString();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const vehicleId = cellString(row[columnIndex["車両ID"]]);
    if (!vehicleId) continue;

    vehicles.push({
      id: vehicleId,
      vehicleId,
      vehicleCode: cellString(row[columnIndex["車両番号"]]),
      plateNumber: cellString(row[columnIndex["車輛番号"]]),
      tonnageDisplay: cellString(row[columnIndex["トン数表示"]]),
      vehicleName: cellString(row[columnIndex["車名"]]),
      modelType: cellString(row[columnIndex["形式"]]),
      inspectionExpiry: parseExcelDate(row[columnIndex["車検有効期限"]]),
      firstYear: cellString(row[columnIndex["初年度"]]),
      loadCapacity: parseNumber(row[columnIndex["積載量"]]),
      heightMm: parseNumber(row[columnIndex["全高"]]) || undefined,
      lengthMm: parseNumber(row[columnIndex["全長"]]) || undefined,
      widthMm: parseNumber(row[columnIndex["全幅"]]) || undefined,
      grossWeight: parseNumber(row[columnIndex["総重量"]]),
      registeredDate: parseExcelDate(row[columnIndex["登録年月日"]]),
      scrappedDate: parseExcelDate(row[columnIndex["廃車年月日"]]),
      updatedAt: now,
    });
  }

  return { vehicles, warnings };
}
