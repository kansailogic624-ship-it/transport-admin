/**
 * 社員名の表記ゆれ名寄せの検証
 * npx tsx scripts/test-employee-name-resolve.ts
 */
import {
  buildEmployeeNameIndex,
  canonicalizeDailyRecordNames,
  resolveCanonicalEmployeeName,
} from "../src/lib/employee-name-resolve";
import { normalizeDriverName } from "../src/lib/driving-report-parser";
import { preprocessFmDispatches } from "../src/lib/fm-dispatch-merge";
import type { ParsedFileMakerDispatch } from "../src/lib/filemaker-dispatch-parser";
import { DEFAULT_MASTERS } from "../src/lib/types";
import type { DailyRecord, EmployeeDetail } from "../src/lib/types";

const employees: EmployeeDetail[] = [
  {
    id: "1",
    employeeId: "1",
    name: "山本 剛志",
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

const index = buildEmployeeNameIndex(employees, DEFAULT_MASTERS);

if (normalizeDriverName("山本 剛志") !== normalizeDriverName("山本剛志")) {
  throw new Error("normalize key mismatch");
}

const resolved = resolveCanonicalEmployeeName("山本剛志", index);
if (resolved !== "山本 剛志") {
  throw new Error(`expected master name, got ${resolved}`);
}

const dispatch = {
  sourceFileName: "fm.xlsx",
  date: "2026-05-01",
  driverName: "山本剛志",
  vehicleNumber: "京都400あ11-11",
  dispatchName: "Amazon HB②",
  shipperName: "Amazon",
  revenue: "26500",
  tollFee: "",
  warnings: [],
} satisfies ParsedFileMakerDispatch;

const processed = preprocessFmDispatches([dispatch], employees, DEFAULT_MASTERS);
if (processed[0]!.driverName !== "山本 剛志") {
  throw new Error(`preprocess name failed: ${processed[0]!.driverName}`);
}

const record: DailyRecord = {
  id: "r1",
  date: "2026-05-01",
  operationType: "own",
  driverName: "山本剛志",
  clockIn: "",
  clockOut: "",
  rollCallTime: "",
  reportStatus: "not_submitted",
  trips: [
    {
      id: "t1",
      runType: "own",
      vehicleNumber: "",
      shipperName: "Amazon",
      jobName: "Amazon HB②",
      revenue: "26500",
      tollFee: "",
      startMeter: "",
      endMeter: "",
      crew: [
        {
          id: "c1",
          memberType: "employee",
          name: "山本剛志",
          dailyCost: "",
        },
      ],
      partnerName: "",
      partnerFee: "",
    },
  ],
  createdAt: "2026-05-01T00:00:00.000Z",
};

const canonical = canonicalizeDailyRecordNames(record, index);
if (canonical.driverName !== "山本 剛志") {
  throw new Error("record canonicalize failed");
}
if (canonical.trips[0]!.crew[0]!.name !== "山本 剛志") {
  throw new Error("crew canonicalize failed");
}

console.log("OK: employee-name-resolve");
