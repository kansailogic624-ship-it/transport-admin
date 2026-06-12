import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { parseEmployeeMasterSheet } from "../src/lib/employee-master-parser";
import { parseJobMasterSheet } from "../src/lib/job-master-parser";
import { parseVehicleMasterSheet } from "../src/lib/vehicle-master-parser";
import { allSheetMatricesFromArrayBuffer } from "../src/lib/spreadsheet-read";
import { processFmEmployeeScheduleSheets } from "../src/lib/import-preprocessor/fm-employee-schedule/build-result";
import { DEFAULT_MASTERS } from "../src/lib/types";

const BASE =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理";
const schedule = path.join(
  BASE,
  "ファイルメーカー日時売上",
  "20260501-20260531.xlsx",
);

function loadXlsxRows(filePath: string): unknown[][] {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

async function main(): Promise<void> {
  const employees = parseEmployeeMasterSheet(
    loadXlsxRows(path.join(BASE, "社員マスタ.xlsx")),
  ).employees;
  const vehicles = parseVehicleMasterSheet(
    loadXlsxRows(path.join(BASE, "車両マスタ.xlsx")),
  ).vehicles;
  const jobs = parseJobMasterSheet(
    loadXlsxRows(path.join(BASE, "業務マスタ.xlsx")),
  ).jobs;
  const masters = {
    ...DEFAULT_MASTERS,
    drivers: employees.filter((e) => e.activeFlag === 1).map((e) => e.name),
    vehicles: vehicles.map((v) => v.plateNumber || v.vehicleCode),
    shippers: [...new Set(jobs.map((j) => j.shipperName))],
    shipperJobs: Object.fromEntries(
      [...new Set(jobs.map((j) => j.shipperName))].map((s) => [
        s,
        jobs.filter((j) => j.shipperName === s).map((j) => j.jobName),
      ]),
    ),
  };

  const buf = fs.readFileSync(schedule);
  const sheets = await allSheetMatricesFromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    path.basename(schedule),
  );
  const { records, operationSummaries } = processFmEmployeeScheduleSheets(
    sheets,
    path.basename(schedule),
    masters,
    { employees, vehicles, jobs },
  );

  const nextRows = records.filter((r) =>
    /ﾈｸｽﾄ|ネクスト/.test(r.employeeNameOriginal),
  );
  console.log("ネクスト系社員名行:", nextRows.length);
  for (const r of nextRows.slice(0, 8)) {
    console.log(
      `  ${r.businessDate} | ${r.shipperNameOriginal}/${r.jobNameOriginal} | 売上${r.revenueAmount} | ${JSON.stringify(r.aliasStatus)}`,
    );
  }

  const yamada = records.filter((r) => r.employeeNameOriginal.includes("山田"));
  console.log(
    "山田系:",
    yamada.length,
    "未解決",
    yamada.filter((r) => r.aliasStatus.employee === "unresolved").length,
  );
  for (const r of yamada.filter((r) => r.aliasStatus.employee === "unresolved")) {
    console.log(`  ${r.businessDate} ${r.employeeNameOriginal} ${r.jobNameOriginal}`);
  }

  const amb = operationSummaries.filter((o) =>
    o.warningFlags.includes("JOINT_OPERATION_AMBIGUOUS"),
  );
  console.log("\n曖昧運行:", amb.length);
  for (const o of amb) {
    const rows = records.filter((r) => r.operationKey === o.operationKey);
    console.log(
      `${o.businessDate} ${o.shipperNameCanonical}/${o.jobNameCanonical} company=${o.operationRevenueAmount}`,
    );
    for (const r of rows) {
      console.log(
        `  ${r.employeeNameOriginal} rev=${r.revenueAmount} share=${r.employeeRevenueShareAmount} companyFlag=${r.countsForCompanyRevenue}`,
      );
    }
  }

  const zeroJoint = operationSummaries.filter(
    (o) => o.isJointOperation && (o.operationRevenueAmount ?? 0) === 0,
  );
  console.log(
    `\n2マンかつ会社売上0: ${zeroJoint.length}/${operationSummaries.filter((o) => o.isJointOperation).length}`,
  );

  const shareExcess = records
    .filter((r) => !r.isAttendanceOnlyRow)
    .reduce((s, r) => s + r.employeeRevenueShareAmount, 0);
  const company = operationSummaries.reduce(
    (s, o) => s + (o.operationRevenueAmount ?? 0),
    0,
  );
  console.log(`按分合計-会社売上差: ${shareExcess - company}`);
}

main();
