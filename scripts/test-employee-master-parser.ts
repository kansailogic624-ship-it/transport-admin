/**
 * npm run test:employee-master
 */
import * as fs from "node:fs";
import * as XLSX from "xlsx";
import { parseEmployeeMasterSheet } from "../src/lib/employee-master-parser";

const defaultPath =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/社員マスタ.xlsx";

const filePath = process.argv[2] ?? defaultPath;

if (!fs.existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
const ws = wb.Sheets[wb.SheetNames[0]!]!;
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

const { employees, warnings } = parseEmployeeMasterSheet(rows);
const active = employees.filter((e) => e.activeFlag === 1).length;

console.log("parsed", employees.length, "employees");
console.log("active", active, "inactive", employees.length - active);
if (employees[0]) {
  console.log("sample", JSON.stringify(employees[0], null, 2));
}
if (warnings.length > 0) {
  console.log("warnings", warnings);
}

if (employees.length < 1) {
  process.exit(1);
}
