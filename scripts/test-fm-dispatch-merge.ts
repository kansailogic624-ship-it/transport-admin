/**
 * FileMaker ツーマン合体・備考 (ﾊﾞ) 判定の検証
 * npx tsx scripts/test-fm-dispatch-merge.ts
 */
import type { ParsedFileMakerDispatch } from "../src/lib/filemaker-dispatch-parser";
import {
  extractPartTimeSurnameFromRemarks,
  findPartTimeEmployeeBySurname,
  makeCrewFromFmDispatch,
  mergeFmTwoManVehicleRows,
  preprocessFmDispatches,
} from "../src/lib/fm-dispatch-merge";
import { DEFAULT_MASTERS } from "../src/lib/types";
import type { EmployeeDetail } from "../src/lib/types";

function dispatch(
  partial: Partial<ParsedFileMakerDispatch> & Pick<ParsedFileMakerDispatch, "driverName" | "dispatchName">,
): ParsedFileMakerDispatch {
  return {
    sourceFileName: "test.xlsx",
    date: "2026-05-01",
    vehicleNumber: "",
    shipperName: "Amazon",
    revenue: "26500",
    tollFee: "",
    warnings: [],
    ...partial,
  };
}

// --- 備考 (ﾊﾞ) 抽出 ---
const s1 = extractPartTimeSurnameFromRemarks("塩貝(ﾊﾞ)");
const s2 = extractPartTimeSurnameFromRemarks("助手：塩貝（ﾊﾞ）");
if (s1 !== "塩貝" || s2 !== "塩貝") {
  throw new Error(`remarks parse failed: ${s1}, ${s2}`);
}

const employees: EmployeeDetail[] = [
  {
    id: "101",
    employeeId: "101",
    name: "塩貝花子",
    nameKana: "",
    address: "",
    birthDate: "",
    hireDate: "",
    appointmentDate: "",
    licenseNumber: "",
    activeFlag: 1,
    retirementReason: "",
    updatedAt: "",
  },
];

const masters = {
  ...DEFAULT_MASTERS,
  employeeSalaries: { 藤原大介: 350000 },
};

const partTime = findPartTimeEmployeeBySurname("塩貝", employees, masters);
if (!partTime || partTime.name !== "塩貝花子") {
  throw new Error("part-time lookup failed");
}

// --- 車両あり/なし行の合体 ---
const primary = dispatch({
  driverName: "藤原大介",
  vehicleNumber: "京都400あ59-39",
  dispatchName: "Amazon HB②",
  revenue: "26500",
});

const assistantRow = dispatch({
  driverName: "ディンヴィエットダン",
  vehicleNumber: "",
  dispatchName: "Amazon HB②",
  revenue: "26500",
});

const merged = mergeFmTwoManVehicleRows([primary, assistantRow]);
if (merged.length !== 1) {
  throw new Error(`expected 1 merged dispatch, got ${merged.length}`);
}
if (merged[0]!.assistantDriverName !== "ディンヴィエットダン") {
  throw new Error("assistant not attached");
}
if (merged[0]!.revenue !== "53000") {
  throw new Error(`expected revenue 53000, got ${merged[0]!.revenue}`);
}

// --- 備考から助手を crew に反映 ---
const remarksRow = dispatch({
  driverName: "藤原大介",
  vehicleNumber: "京都400あ59-39",
  dispatchName: "Amazon HB②",
  personalRemarks: "塩貝(ﾊﾞ)",
});

const processed = preprocessFmDispatches([remarksRow], employees, masters);
const crew = makeCrewFromFmDispatch(processed[0]!, employees, masters);
if (crew.length !== 2) {
  throw new Error(`expected 2 crew, got ${crew.length}`);
}
if (crew[1]!.memberType !== "part_time" || crew[1]!.name !== "塩貝花子") {
  throw new Error(`unexpected assistant crew: ${crew[1]!.name} / ${crew[1]!.memberType}`);
}

console.log("OK: fm-dispatch-merge");
