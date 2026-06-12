import type { EmployeeDetail } from "./types";

export type SheetMatrix = unknown[][];

const EXPECTED_HEADERS = [
  "社員ID",
  "社員名",
  "ふりがな",
  "住所",
  "生年月日",
  "雇入年月日",
  "選任年月日",
  "運転免許証の番号",
  "在籍フラグ",
  "退職理由",
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

function parseExcelDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + value * 86_400_000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const text = String(value).trim();
  if (!text) return "";
  const slash = text.match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (slash) {
    return `${slash[1]}-${String(slash[2]).padStart(2, "0")}-${String(slash[3]).padStart(2, "0")}`;
  }
  return text;
}

function formatDisplayDate(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}/${m[2]}/${m[3]}`;
}

function cellString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseActiveFlag(value: unknown): 0 | 1 {
  const n = Number(value);
  return n === 1 ? 1 : 0;
}

export function formatEmployeeDate(iso: string): string {
  return formatDisplayDate(iso);
}

export type EmployeeMasterParseResult = {
  employees: EmployeeDetail[];
  warnings: string[];
};

export function parseEmployeeMasterSheet(rows: SheetMatrix): EmployeeMasterParseResult {
  const warnings: string[] = [];
  if (rows.length === 0) {
    return { employees: [], warnings: ["シートが空です"] };
  }

  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((cell) => normalizeHeader(cell));

  const columnIndex: Record<(typeof EXPECTED_HEADERS)[number], number> = {
    社員ID: -1,
    社員名: -1,
    ふりがな: -1,
    住所: -1,
    生年月日: -1,
    雇入年月日: -1,
    選任年月日: -1,
    "運転免許証の番号": -1,
    在籍フラグ: -1,
    退職理由: -1,
  };

  for (const label of EXPECTED_HEADERS) {
    const idx = findHeaderIndex(headers, label);
    columnIndex[label] = idx;
    if (idx < 0) {
      warnings.push(`列「${label}」が見つかりません`);
    }
  }

  if (columnIndex["社員ID"] < 0 || columnIndex["社員名"] < 0) {
    return { employees: [], warnings };
  }

  const employees: EmployeeDetail[] = [];
  const now = new Date().toISOString();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const employeeId = cellString(row[columnIndex["社員ID"]]);
    const name = cellString(row[columnIndex["社員名"]]);
    if (!employeeId && !name) continue;

    if (!employeeId) {
      warnings.push(`${rowIndex + 1}行目: 社員IDが空のためスキップしました`);
      continue;
    }

    employees.push({
      id: employeeId,
      employeeId,
      name: name || "—",
      nameKana: cellString(row[columnIndex["ふりがな"]]),
      address: cellString(row[columnIndex["住所"]]),
      birthDate: parseExcelDate(row[columnIndex["生年月日"]]),
      hireDate: parseExcelDate(row[columnIndex["雇入年月日"]]),
      appointmentDate: parseExcelDate(row[columnIndex["選任年月日"]]),
      licenseNumber: cellString(row[columnIndex["運転免許証の番号"]]),
      activeFlag: parseActiveFlag(row[columnIndex["在籍フラグ"]]),
      retirementReason: cellString(row[columnIndex["退職理由"]]),
      updatedAt: now,
    });
  }

  return { employees, warnings };
}
