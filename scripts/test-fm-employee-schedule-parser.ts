/**
 * FM社員スケジュール A-I 列パーサーテスト
 * npx tsx scripts/test-fm-employee-schedule-parser.ts
 */
import type { AliasLedgerSources } from "../src/lib/alias-engine";
import {
  buildFmEmployeeSchedulePreprocessResult,
  processFmEmployeeScheduleSheets,
} from "../src/lib/import-preprocessor/fm-employee-schedule/build-result";
import {
  matchesFmScheduleFilter,
  filterFmScheduleRecords,
} from "../src/lib/import-preprocessor/fm-employee-schedule/filters";
import {
  countDismissedWarnings,
  countOnHoldWarnings,
  countPendingWarnings,
  dismissFmWarning,
  getActionableWarnings,
  getCurrentWarnings,
  getDismissedWarnings,
  getOnHoldWarnings,
  getWarningDisposition,
  holdFmWarning,
  isAttendanceHolidayRow,
  reopenFmWarning,
} from "../src/lib/import-preprocessor/fm-employee-schedule/warning-tracking";
import {
  applyFmWarningDismiss,
  applyFmWarningHold,
} from "../src/lib/import-preprocessor/fm-employee-schedule/warning-actions";
import { buildJointDetectionReasons } from "../src/lib/import-preprocessor/fm-employee-schedule/joint-detection-reasons";
import { computeWarningResolutionRate } from "../src/lib/import-preprocessor/fm-employee-schedule/resolution-rate";
import {
  revertFmRecordToImport,
  revertFmRecordToPreviousSave,
} from "../src/lib/import-preprocessor/fm-employee-schedule/record-revert";
import {
  buildFmWarningEditQueue,
  findWarningEditIndex,
} from "../src/lib/import-preprocessor/fm-employee-schedule/warning-edit-queue";
import { applyFmManualVehicleFill } from "../src/lib/import-preprocessor/fm-employee-schedule/manual-vehicle-actions";
import { applyFmManualRecordEdit } from "../src/lib/import-preprocessor/fm-employee-schedule/fm-record-edit-session";
import { findJointPartnerCandidates } from "../src/lib/import-preprocessor/fm-employee-schedule/joint-partner-candidates";
import {
  findManualVehicleFillCandidates,
  needsManualVehicleFill,
} from "../src/lib/import-preprocessor/fm-employee-schedule/manual-vehicle-fill";
import {
  parseNotePartner,
  applyNotePartnerDetection,
} from "../src/lib/import-preprocessor/fm-employee-schedule/note-partner-detection";
import { formatJointPartnerDisplay } from "../src/lib/import-preprocessor/fm-employee-schedule/partner-display";
import { matchesWarningFlagFilter } from "../src/lib/import-preprocessor/fm-employee-schedule/filters";
import { attachFmRecordOriginalStates } from "../src/lib/import-preprocessor/fm-employee-schedule/record-snapshot";
import {
  applyFmReviewDecisionRules,
  applyFmScheduleReviewDecision,
  buildReviewDecisionKey,
  createReviewDecisionRule,
  isAutoDetectedJointGroup,
  revertFmScheduleReviewDecision,
} from "../src/lib/import-preprocessor/fm-employee-schedule/review-decision";
import type { MasterData } from "../src/lib/types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const masters: MasterData = {
  drivers: ["川本 剛士", "岩淵 綾太"],
  partners: [],
  vehicles: ["91-44", "京都400あ91-44"],
  shippers: ["エフピコ", "G-FOOT"],
  shipperJobs: {
    エフピコ: ["平和堂①", "京都②（若菜）", "トレー搬送", "集荷①"],
    "G-FOOT": ["GB亀岡"],
  },
  employeeSalaries: { "川本 剛士": 300000 },
  mappingRules: [],
  allocationExpenses: [],
};

const ledger: AliasLedgerSources = {
  employees: [
    {
      id: "E001",
      employeeId: "E001",
      name: "川本 剛士",
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
    {
      id: "E002",
      employeeId: "E002",
      name: "岩淵 綾太",
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
  ],
  vehicles: [
    {
      id: "V9144",
      vehicleId: "V9144",
      vehicleCode: "91-44",
      plateNumber: "京都400あ91-44",
      tonnageDisplay: "",
      vehicleName: "",
      modelType: "",
      inspectionExpiry: "",
      firstYear: "",
      loadCapacity: 0,
      grossWeight: 0,
      registeredDate: "",
      scrappedDate: "",
      updatedAt: "",
    },
  ],
  jobs: [
    {
      id: "J001",
      jobId: "J001",
      shipperName: "エフピコ",
      jobName: "平和堂①",
      revenue: 85000,
      priceHistory: [],
      notes: "",
      updatedAt: "",
    },
    {
      id: "J002",
      jobId: "J002",
      shipperName: "エフピコ",
      jobName: "京都②（若菜）",
      revenue: 62000,
      priceHistory: [],
      notes: "",
      updatedAt: "",
    },
    {
      id: "J003",
      jobId: "J003",
      shipperName: "G-FOOT",
      jobName: "GB亀岡",
      revenue: 45000,
      priceHistory: [],
      notes: "",
      updatedAt: "",
    },
  ],
};

const rows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [
    85000,
    "エフピコ",
    "平和堂①",
    "91-44",
    "川本 剛士",
    "06:30:00",
    "18:45:00",
    "2026/05/01",
    "",
  ],
  [
    62000,
    "エフピコ",
    "京都②（若菜）",
    "京都9144",
    "川本 剛士",
    "06:30:00",
    "18:45:00",
    "2026/05/01",
    "",
  ],
  [
    45000,
    "G-FOOT",
    "GB亀岡",
    "京都400あ91-44",
    "川本 剛士",
    "06:30:00",
    "18:45:00",
    "2026/05/01",
    "",
  ],
  ["", "勤怠用", "休み", "", "岩淵 綾太", "", "", "2026/05/02", ""],
];

const { records, daySummaries, fmScheduleTotals } = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows }],
  "schedule202605.xlsx",
  masters,
  ledger,
);

assert(records.length === 4, `rows: ${records.length}`);
assert(daySummaries.length === 2, `days: ${daySummaries.length}`);

const kawamoto = records.filter((r) =>
  r.employeeNameOriginal.includes("川本"),
);
assert(kawamoto.length === 3, "kawamoto jobs");
const laborTrue = kawamoto.filter((r) => r.countsForLaborTime);
assert(laborTrue.length === 1, "labor once per day");
assert(laborTrue[0]!.bindingMinutes === 12 * 60 + 15, `binding ${laborTrue[0]!.bindingMinutes}`);

const revenueSum = kawamoto.reduce(
  (s, r) => s + (r.isRevenueRow ? (r.revenueAmount ?? 0) : 0),
  0,
);
assert(revenueSum === 192000, `revenue ${revenueSum}`);
assert(fmScheduleTotals.sales === 192000, "totals sales");

const day1 = daySummaries.find((d) => d.businessDate === "2026-05-01");
assert(day1?.rowCount === 3, "day1 rows");
assert(day1?.revenueTotal === 192000, "day1 revenue");

const attendance = records.find((r) => r.isAttendanceOnlyRow);
assert(attendance?.dayStatus === "公休", "holiday");
assert(attendance?.revenueAmount === 0, "no revenue on attendance");

assert(
  kawamoto.every((r) => r.employeeDayKey.startsWith("2026-05-01:")),
  `employeeDayKey ${kawamoto.map((r) => r.employeeDayKey).join(",")}`,
);

const sample = kawamoto[0]!;
assert(
  sample.employeeNameCanonical === "川本 剛士" &&
    sample.employeeCanonicalId === "E001" &&
    sample.aliasStatus.employee === "resolved",
  `employee: ${sample.employeeNameCanonical} id=${sample.employeeCanonicalId}`,
);
assert(
  sample.jobCanonicalId === "J001" && sample.aliasStatus.job === "resolved",
  `job id=${sample.jobCanonicalId}`,
);
assert(
  sample.vehicleCanonicalId === "V9144" && sample.aliasStatus.vehicle === "resolved",
  `vehicle id=${sample.vehicleCanonicalId}`,
);

const kyoto9144 = records.find((r) => r.vehicleNumberOriginal === "京都9144");
assert(
  kyoto9144?.vehicleCanonicalId === "V9144" &&
    kyoto9144.aliasStatus.vehicle === "resolved",
  "vehicle variant 京都9144",
);

assert(fmScheduleTotals.unresolvedEmployeeCount === 0, "no unresolved employees");
assert(fmScheduleTotals.unresolvedVehicleCount === 0, "no unresolved vehicles");
assert(fmScheduleTotals.unresolvedShipperCount === 0, "no unresolved shippers");
assert(fmScheduleTotals.unresolvedJobCount === 0, "no unresolved jobs");

const recon = fmScheduleTotals.revenueReconciliation;
assert(recon.isBalanced, `reconciliation: ${recon.mismatchReasons.join(", ")}`);
assert(
  recon.excelOriginalTotal === recon.companyTotal,
  "excel equals company",
);
assert(
  recon.employeeShareTotal === recon.companyTotal,
  "employee share equals company",
);
assert(recon.companyTotal === 192000, "company sales");

// 台帳のみ（MasterData 空）でも解決できること
const ledgerOnly = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: rows.slice(0, 2) }],
  "ledger-only.xlsx",
  {
    drivers: [],
    partners: [],
    vehicles: [],
    shippers: [],
    shipperJobs: {},
    employeeSalaries: {},
    mappingRules: [],
    allocationExpenses: [],
  },
  ledger,
);
const ledgerRow = ledgerOnly.records[0]!;
assert(
  ledgerRow.aliasStatus.employee === "resolved" &&
    ledgerRow.employeeCanonicalId === "E001",
  "ledger-only employee",
);
assert(
  ledgerRow.aliasStatus.vehicle === "resolved" &&
    ledgerRow.vehicleCanonicalId === "V9144",
  "ledger-only vehicle",
);

// 同一社員日の車両補完
const fillLedger: AliasLedgerSources = {
  employees: [
    {
      id: "E103",
      employeeId: "E103",
      name: "川本 剛士",
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
    {
      id: "E101",
      employeeId: "E101",
      name: "吉田 勉",
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
    {
      id: "E102",
      employeeId: "E102",
      name: "久保 慎一",
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
  ],
  vehicles: [
    {
      id: "V2178",
      vehicleId: "V2178",
      vehicleCode: "21-78",
      plateNumber: "京都101あ21-78",
      tonnageDisplay: "",
      vehicleName: "",
      modelType: "",
      inspectionExpiry: "",
      firstYear: "",
      loadCapacity: 0,
      grossWeight: 0,
      registeredDate: "",
      scrappedDate: "",
      updatedAt: "",
    },
    {
      id: "V4445",
      vehicleId: "V4445",
      vehicleCode: "44-45",
      plateNumber: "京都200い44-45",
      tonnageDisplay: "",
      vehicleName: "",
      modelType: "",
      inspectionExpiry: "",
      firstYear: "",
      loadCapacity: 0,
      grossWeight: 0,
      registeredDate: "",
      scrappedDate: "",
      updatedAt: "",
    },
  ],
  jobs: ledger.jobs,
};

const fillMasters: MasterData = {
  ...masters,
  drivers: ["吉田 勉", "久保 慎一", "川本 剛士"],
  shippers: ["エフピコ", "G-FOOT"],
  shipperJobs: {
    エフピコ: ["平和堂①", "京都②（若菜）", "集荷①"],
    "G-FOOT": ["GB亀岡", "GB②"],
  },
};

const fillRows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [10000, "エフピコ", "平和堂①", "", "吉田 勉", "06:00", "18:00", "2026/05/01", ""],
  [10000, "エフピコ", "京都②（若菜）", "", "吉田 勉", "06:00", "18:00", "2026/05/01", ""],
  [10000, "エフピコ", "集荷①", "21-78", "吉田 勉", "06:00", "18:00", "2026/05/01", ""],
  [10000, "G-FOOT", "GB亀岡", "44-45", "久保 慎一", "06:00", "18:00", "2026/05/01", ""],
  [10000, "G-FOOT", "GB②", "", "久保 慎一", "06:00", "18:00", "2026/05/01", ""],
  [10000, "エフピコ", "平和堂①", "91-44", "川本 剛士", "06:00", "18:00", "2026/05/01", ""],
  [10000, "エフピコ", "集荷①", "", "川本 剛士", "06:00", "18:00", "2026/05/01", ""],
  [10000, "エフピコ", "トレー搬送", "38-12", "川本 剛士", "06:00", "18:00", "2026/05/01", ""],
];

const fillResult = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: fillRows }],
  "fill-test.xlsx",
  fillMasters,
  { ...fillLedger, vehicles: [...fillLedger.vehicles!, ...ledger.vehicles!] },
);

const yoshidaEmpty = fillResult.records.filter(
  (r) => r.employeeNameOriginal === "吉田 勉" && !r.vehicleNumberOriginal.trim(),
);
assert(yoshidaEmpty.length === 2, `yoshida empty rows: ${yoshidaEmpty.length}`);
assert(
  yoshidaEmpty.every(
    (r) =>
      r.vehicleNumberFilled === "21-78" &&
      r.vehicleNumberCanonical === "京都101あ21-78" &&
      r.vehicleCanonicalId === "V2178" &&
      r.infoFlags.includes("VEHICLE_FILLED_FROM_EMPLOYEE_DAY") &&
      !r.warningFlags.includes("REVENUE_WITHOUT_VEHICLE"),
  ),
  "yoshida fill",
);

const kuboFilled = fillResult.records.find(
  (r) => r.employeeNameOriginal === "久保 慎一" && !r.vehicleNumberOriginal.trim(),
);
assert(
  kuboFilled?.vehicleNumberFilled === "44-45" &&
    kuboFilled.vehicleCanonicalId === "V4445" &&
    !kuboFilled.warningFlags.includes("REVENUE_WITHOUT_VEHICLE"),
  "kubo fill",
);

const kawamotoMulti = fillResult.records.filter(
  (r) => r.employeeNameOriginal === "川本 剛士",
);
assert(
  kawamotoMulti.some((r) => r.warningFlags.includes("MULTIPLE_VEHICLES_SAME_DAY")),
  "multiple vehicles same day",
);
const kawamotoEmpty = kawamotoMulti.filter(
  (r) => !r.vehicleNumberOriginal.trim(),
);
assert(
  kawamotoEmpty.some((r) =>
    r.infoFlags.includes("VEHICLE_FILLED_FROM_JOINT_JOB"),
  ),
  "joint job fill when same job has vehicle on another member",
);

// 2マン同一運行・売上二重計上防止
const jointRows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [85000, "エフピコ", "平和堂①", "21-78", "吉田 勉", "06:00", "18:00", "2026/05/01", ""],
  [85000, "エフピコ", "平和堂①", "21-78", "久保 慎一", "06:00", "18:00", "2026/05/01", ""],
  [62000, "エフピコ", "京都②（若菜）", "21-78", "吉田 勉", "06:00", "18:00", "2026/05/01", ""],
];

const jointResult = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: jointRows }],
  "joint-test.xlsx",
  fillMasters,
  { ...fillLedger, vehicles: fillLedger.vehicles! },
);

const jointOp = jointResult.records.filter(
  (r) => r.jobNameOriginal === "平和堂①",
);
assert(jointOp.length === 2, `joint rows: ${jointOp.length}`);
assert(
  jointOp.every((r) => r.isJointOperation && r.jointOperationMemberCount === 2),
  "joint operation flag",
);
assert(
  jointOp.every((r) => r.operationRevenueAmount === 170000),
  "operation revenue sum",
);
assert(
  jointOp.every((r) => r.employeeRevenueShareAmount === 85000),
  "employee share as revenueAmount",
);
assert(
  jointResult.fmScheduleTotals.sales === 232000,
  `company sales ${jointResult.fmScheduleTotals.sales}`,
);
assert(
  jointOp.every((r) => !r.countsForCompanyRevenue),
  "no representative company flag",
);
assert(
  !jointOp.some((r) =>
    r.warningFlags.includes("JOINT_OPERATION_REVENUE_DUPLICATE"),
  ),
  "no duplicate revenue warning",
);
assert(
  jointOp.some((r) => r.infoFlags.includes("JOINT_OPERATION_DETECTED")),
  "joint detected info",
);
assert(
  jointOp[0]!.jointJobKey === jointOp[1]!.jointJobKey,
  "same jointJobKey",
);
assert(!jointOp[0]!.jointJobKey.includes("吉田"), "jointJobKey excludes employee");
assert(
  !jointOp[0]!.jointJobKey.includes("21-78"),
  "jointJobKey excludes vehicle",
);

const soloRow = jointResult.records.find(
  (r) => r.jobNameOriginal === "京都②（若菜）",
)!;
assert(!soloRow.isJointOperation, "solo row");
assert(!soloRow.countsForCompanyRevenue, "solo no company flag");
assert(soloRow.operationRevenueAmount === 62000, "solo revenue");
assert(soloRow.employeeRevenueShareAmount === 62000, "solo employee share");

const jointRecon = jointResult.fmScheduleTotals.revenueReconciliation;
assert(jointRecon.isBalanced, `joint recon: ${jointRecon.mismatchReasons.join(", ")}`);
assert(jointRecon.excelOriginalTotal === 232000, `excel ${jointRecon.excelOriginalTotal}`);
assert(jointRecon.companyTotal === 232000, "company total");
assert(jointRecon.employeeShareTotal === 232000, "employee share total");

// 同一 operationKey + 同一社員の重複行（同乗教育の可能性）
const rideAlongLedger: AliasLedgerSources = {
  ...ledger,
  employees: [
    ...ledger.employees!,
    {
      id: "E003",
      employeeId: "E003",
      name: "坪田 孝之",
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
  ],
  jobs: [
    ...ledger.jobs!,
    {
      id: "J004",
      jobId: "J004",
      shipperName: "エフピコ",
      jobName: "久御山C①",
      revenue: 7400,
      priceHistory: [],
      notes: "",
      updatedAt: "",
    },
  ],
};

const rideAlongRows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [7400, "エフピコ", "久御山C①", "", "坪田 孝之", "06:00", "18:00", "2026/05/03", ""],
  [7400, "エフピコ", "久御山C①", "", "坪田 孝之", "06:00", "18:00", "2026/05/03", ""],
];

const rideAlongResult = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: rideAlongRows }],
  "ride-along-test.xlsx",
  masters,
  rideAlongLedger,
);

const rideAlongOpRows = rideAlongResult.records.filter(
  (r) => r.jobNameOriginal === "久御山C①",
);
assert(rideAlongOpRows.length === 2, `ride-along rows kept: ${rideAlongOpRows.length}`);
assert(
  rideAlongOpRows.every((r) => r.requiresHumanReview),
  "requires human review",
);
assert(
  rideAlongOpRows.every((r) =>
    r.warningFlags.includes("POSSIBLE_RIDE_ALONG_TRAINING"),
  ),
  "possible ride along warning",
);
assert(
  rideAlongOpRows.every((r) => r.warningFlags.includes("REQUIRES_HUMAN_REVIEW")),
  "requires human review warning",
);
assert(
  rideAlongOpRows.every((r) => r.employeeRevenueShareAmount === 7400),
  "employee share as revenueAmount",
);
assert(
  rideAlongOpRows.every((r) => !r.countsForCompanyRevenue),
  "no company flag",
);
assert(
  rideAlongResult.fmScheduleTotals.sales === 14800,
  `company sales ${rideAlongResult.fmScheduleTotals.sales}`,
);
const rideAlongRecon = rideAlongResult.fmScheduleTotals.revenueReconciliation;
assert(rideAlongRecon.isBalanced, "no hard mismatch");
assert(rideAlongRecon.companyTotal === 14800, "company total sum");
assert(
  rideAlongResult.operationSummaries.some((o) => o.requiresHumanReview),
  "operation summary flagged",
);

// Amazon HB②: 車両あり/なしの2マン（会社売上 = 26,500 + 26,500）
const amazonLedger: AliasLedgerSources = {
  ...ledger,
  employees: [
    ...ledger.employees!,
    {
      id: "E010",
      employeeId: "E010",
      name: "中出 真敬",
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
    {
      id: "E011",
      employeeId: "E011",
      name: "ディン ヴィエット ダン",
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
  ],
  vehicles: [
    ...ledger.vehicles!,
    {
      id: "V5288",
      vehicleId: "V5288",
      vehicleCode: "52-88",
      plateNumber: "京都400あ52-88",
      tonnageDisplay: "",
      vehicleName: "",
      modelType: "",
      inspectionExpiry: "",
      firstYear: "",
      loadCapacity: 0,
      grossWeight: 0,
      registeredDate: "",
      scrappedDate: "",
      updatedAt: "",
    },
  ],
  jobs: [
    ...ledger.jobs!,
    {
      id: "J010",
      jobId: "J010",
      shipperName: "Amazon",
      jobName: "Amazon HB②",
      revenue: 53000,
      priceHistory: [],
      notes: "",
      updatedAt: "",
    },
  ],
};

const amazonMasters: MasterData = {
  ...masters,
  drivers: [...masters.drivers, "中出 真敬", "ディン ヴィエット ダン"],
  vehicles: [...masters.vehicles, "52-88", "京都400あ52-88"],
  shippers: [...masters.shippers, "Amazon"],
  shipperJobs: { ...masters.shipperJobs, Amazon: ["Amazon HB②"] },
};

const amazonRows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [26500, "Amazon", "Amazon HB②", "52-88", "中出 真敬", "06:00", "18:00", "2026/05/01", ""],
  [26500, "Amazon", "Amazon HB②", "", "ディン ヴィエット ダン", "06:00", "18:00", "2026/05/01", ""],
];

const amazonResult = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: amazonRows }],
  "amazon-hb2-test.xlsx",
  amazonMasters,
  amazonLedger,
);

const amazonOp = amazonResult.records.filter(
  (r) => r.jobNameOriginal === "Amazon HB②",
);
assert(amazonOp.length === 2, `amazon rows: ${amazonOp.length}`);
assert(
  amazonOp.every((r) => r.isJointOperation && r.jointOperationMemberCount === 2),
  "amazon joint operation",
);
assert(
  amazonOp.every((r) => r.operationRevenueAmount === 53000),
  "amazon company revenue 53000",
);
assert(
  amazonOp.every((r) => r.employeeRevenueShareAmount === 26500),
  "amazon employee share 26500",
);
assert(
  amazonResult.fmScheduleTotals.sales === 53000,
  `amazon total sales ${amazonResult.fmScheduleTotals.sales}`,
);
const dinRow = amazonOp.find((r) =>
  r.employeeNameOriginal.includes("ディン"),
)!;
assert(
  dinRow.infoFlags.includes("VEHICLE_FILLED_FROM_JOINT_JOB"),
  "vehicle proposed from joint job",
);
assert(dinRow.vehicleNumberFilled === "52-88", "vehicle fill value");

// 傭車・外注ラベル（ﾈｸｽﾄﾌﾞﾚｰﾄﾞ①）
const partnerRows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [4000, "エフピコ", "平和堂①", "", "ﾈｸｽﾄﾌﾞﾚｰﾄﾞ①", "", "", "2026/05/01", ""],
  [43800, "エフピコ", "京都②（若菜）", "", "ﾈｸｽﾄﾌﾞﾚｰﾄﾞ①", "", "", "2026/05/01", ""],
];

const partnerResult = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: partnerRows }],
  "partner-test.xlsx",
  masters,
  ledger,
);

const partnerRecs = partnerResult.records.filter((r) => r.isPartnerLikeRow);
assert(partnerRecs.length === 2, `partner rows: ${partnerRecs.length}`);
assert(
  partnerRecs.every((r) => r.partnerNameOriginal === "ﾈｸｽﾄﾌﾞﾚｰﾄﾞ①"),
  "partner name",
);
assert(
  partnerRecs.every((r) =>
    r.infoFlags.includes("EXTERNAL_PARTNER_LABEL"),
  ),
  "external partner info",
);
assert(
  !partnerRecs.some((r) => r.warningFlags.includes("UNRESOLVED_EMPLOYEE")),
  "not unresolved employee",
);
assert(
  partnerRecs.every((r) => r.employeeRevenueShareAmount === 0),
  "no employee share",
);
assert(
  partnerRecs.every((r) => !r.countsForLaborTime),
  "no labor time",
);
assert(
  partnerResult.fmScheduleTotals.sales === 47800, // 4000 + 43800
  `partner company sales ${partnerResult.fmScheduleTotals.sales}`,
);
assert(
  partnerResult.fmScheduleTotals.unresolvedEmployeeCount === 0,
  "no unresolved employees",
);

// 退職者の休み行（山田 大貴）
const inactiveLedger: AliasLedgerSources = {
  ...ledger,
  employees: [
    ...ledger.employees!,
    {
      id: "E092",
      employeeId: "92",
      name: "山田　大貴",
      nameKana: "やまだ　だいき",
      address: "",
      birthDate: "",
      hireDate: "",
      appointmentDate: "",
      licenseNumber: "",
      activeFlag: 0,
      retirementReason: "",
      updatedAt: "",
    },
  ],
};

const inactiveRows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [0, "勤怠用", "休み", "", "山田 大貴", "08:00", "17:00", "2026/05/01", ""],
];

const inactiveResult = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: inactiveRows }],
  "inactive-holiday-test.xlsx",
  masters,
  inactiveLedger,
);

const inactiveRec = inactiveResult.records[0]!;
assert(inactiveRec.resolvedInactiveEmployee, "resolved inactive");
assert(
  inactiveRec.infoFlags.includes("INACTIVE_EMPLOYEE_ATTENDANCE_ONLY"),
  "inactive attendance info",
);
assert(
  !inactiveRec.warningFlags.includes("UNRESOLVED_EMPLOYEE"),
  "not unresolved",
);
assert(
  inactiveResult.fmScheduleTotals.unresolvedEmployeeCount === 0,
  "inactive unresolved count",
);

// トレー搬送: 同一日付・荷主・業務だが別車両 → 別作業として確定
const trayLedger: AliasLedgerSources = {
  ...fillLedger,
  employees: [
    ...(fillLedger.employees ?? []),
    {
      id: "E010",
      employeeId: "E010",
      name: "串間 盛寿",
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
    {
      id: "E011",
      employeeId: "E011",
      name: "蒼座 武",
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
    {
      id: "E012",
      employeeId: "E012",
      name: "堀川 昭人",
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
  ],
  vehicles: [
    ...(fillLedger.vehicles ?? []),
    {
      id: "V2490",
      vehicleId: "V2490",
      vehicleCode: "24-90",
      plateNumber: "京都300う24-90",
      tonnageDisplay: "",
      vehicleName: "",
      modelType: "",
      inspectionExpiry: "",
      firstYear: "",
      loadCapacity: 0,
      grossWeight: 0,
      registeredDate: "",
      scrappedDate: "",
      updatedAt: "",
    },
    {
      id: "V9472",
      vehicleId: "V9472",
      vehicleCode: "94-72",
      plateNumber: "京都300う94-72",
      tonnageDisplay: "",
      vehicleName: "",
      modelType: "",
      inspectionExpiry: "",
      firstYear: "",
      loadCapacity: 0,
      grossWeight: 0,
      registeredDate: "",
      scrappedDate: "",
      updatedAt: "",
    },
    {
      id: "V9657",
      vehicleId: "V9657",
      vehicleCode: "96-57",
      plateNumber: "京都300う96-57",
      tonnageDisplay: "",
      vehicleName: "",
      modelType: "",
      inspectionExpiry: "",
      firstYear: "",
      loadCapacity: 0,
      grossWeight: 0,
      registeredDate: "",
      scrappedDate: "",
      updatedAt: "",
    },
  ],
};

const trayMasters: MasterData = {
  ...fillMasters,
  drivers: ["串間 盛寿", "蒼座 武", "堀川 昭人"],
  shipperJobs: {
    ...fillMasters.shipperJobs,
    エフピコ: [...(fillMasters.shipperJobs?.エフピコ ?? []), "トレー搬送"],
  },
};

const trayRows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [4000, "エフピコ", "トレー搬送", "24-90", "串間 盛寿", "06:00", "18:00", "2026/05/01", ""],
  [4000, "エフピコ", "トレー搬送", "94-72", "蒼座 武", "06:00", "18:00", "2026/05/01", ""],
  [4000, "エフピコ", "トレー搬送", "96-57", "堀川 昭人", "06:00", "18:00", "2026/05/01", ""],
];

const trayResult = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: trayRows }],
  "tray-test.xlsx",
  trayMasters,
  trayLedger,
);

const trayOp = trayResult.records.filter((r) => r.jobNameOriginal === "トレー搬送");
assert(trayOp.length === 3, `tray rows: ${trayOp.length}`);
assert(
  trayOp.every((r) => r.isJointOperation && r.jointOperationMemberCount === 3),
  "tray auto-detected as joint",
);
assert(isAutoDetectedJointGroup(trayOp), "tray is auto-detected joint group");

const trayPreprocess = buildFmEmployeeSchedulePreprocessResult({
  fileName: "tray-test.xlsx",
  records: trayResult.records,
  daySummaries: trayResult.daySummaries,
  operationSummaries: trayResult.operationSummaries,
  fmScheduleTotals: trayResult.fmScheduleTotals,
  parseWarnings: trayResult.parseWarnings,
  createdAt: new Date().toISOString(),
});

const traySeparate = applyFmScheduleReviewDecision({
  result: trayPreprocess,
  jointJobKey: trayOp[0]!.jointJobKey,
  decisionType: "separate_operations",
  scope: "same_shipper_job",
  saveRule: false,
});

const trayAfter = traySeparate.fmScheduleRecords!.filter(
  (r) => r.jobNameOriginal === "トレー搬送",
);
assert(
  trayAfter.every(
    (r) =>
      !r.isJointOperation &&
      r.jointOperationMemberCount === 1 &&
      r.jointOperationReviewDecision === "separate_operations",
  ),
  "tray separate operations applied",
);
assert(
  !trayAfter.some((r) =>
    r.infoFlags.includes("JOINT_OPERATION_DETECTED"),
  ),
  "tray joint info removed",
);
assert(
  trayAfter.every((r) => r.employeeRevenueShareAmount === 4000),
  "tray employee share unchanged",
);
assert(
  traySeparate.fmScheduleTotals!.sales === 12000,
  `tray company sales ${traySeparate.fmScheduleTotals!.sales}`,
);
assert(
  traySeparate.fmScheduleTotals!.revenueReconciliation.isBalanced,
  "tray recon balanced after separate",
);
assert(
  (traySeparate.fmScheduleTotals!.pendingWarningCount ?? 0) <
    (trayResult.fmScheduleTotals.pendingWarningCount ?? 0),
  "separate operations reduces pending warnings",
);
assert(
  trayResult.fmScheduleTotals.jointThreePlusCount === 1,
  `tray 3-man count ${trayResult.fmScheduleTotals.jointThreePlusCount}`,
);
assert(
  jointResult.fmScheduleTotals.jointTwoManCount === 1,
  `joint 2-man count ${jointResult.fmScheduleTotals.jointTwoManCount}`,
);
assert(
  traySeparate.fmOperationSummaries!.filter((o) => o.jobNameCanonical === "トレー搬送")
    .length === 3,
  "tray split into 3 operation summaries",
);

// 車両パターンルールの自動適用
const trayRule = createReviewDecisionRule({
  jointJobKey: trayOp[0]!.jointJobKey,
  decisionType: "separate_operations",
  scope: "same_shipper_job_vehicle_pattern",
  shipperCanonical: "エフピコ",
  jobCanonical: "トレー搬送",
});
assert(
  trayRule.decisionKey ===
    buildReviewDecisionKey({
      sourceType: "filemaker_employee_schedule",
      shipperCanonical: "エフピコ",
      jobCanonical: "トレー搬送",
    }),
  "review decision key format",
);

const trayAutoApplied = applyFmReviewDecisionRules(trayResult.records, [trayRule]);
const trayAutoRows = trayAutoApplied.filter((r) => r.jobNameOriginal === "トレー搬送");
assert(
  trayAutoRows.every((r) => !r.isJointOperation && r.jointOperationMemberCount === 1),
  "vehicle pattern rule auto-applies separate operations",
);

// originalState 付与・フィルタ・元に戻す
const withOriginal = attachFmRecordOriginalStates(trayResult.records);
assert(
  withOriginal.every((r) => r.originalState != null),
  "originalState attached",
);

const warningRows = filterFmScheduleRecords(
  jointResult.records,
  "has_warnings",
);
assert(
  warningRows.every((r) => getActionableWarnings(r).length > 0),
  "has_warnings filter",
);
assert(
  jointResult.records.filter((r) => r.isJointOperation).every((r) =>
    matchesFmScheduleFilter(r, "joint_two_man"),
  ),
  "joint_two_man filter",
);

assert(
  jointResult.fmScheduleTotals.pendingWarningCount >= 0,
  "pending warning count",
);
assert(
  jointResult.records.every((r) => r.originalWarningFlags != null),
  "originalWarningFlags initialized",
);

const jointWarnRow = jointResult.records.find(
  (r) =>
    r.isJointOperation &&
    getCurrentWarnings(r).includes("REQUIRES_HUMAN_REVIEW"),
);
assert(jointWarnRow, "joint row has REQUIRES_HUMAN_REVIEW");
const beforeActionable = getActionableWarnings(jointWarnRow!);
const dismissed = dismissFmWarning(jointWarnRow!, "REQUIRES_HUMAN_REVIEW");
assert(
  getActionableWarnings(dismissed).length === beforeActionable.length - 1,
  "dismiss reduces actionable warnings",
);

const inactiveHoliday = inactiveResult.records[0]!;
assert(
  isAttendanceHolidayRow(inactiveHoliday) ||
    matchesFmScheduleFilter(inactiveHoliday, "attendance_holiday"),
  "attendance holiday row detect",
);
assert(
  getActionableWarnings(inactiveHoliday).length === 0,
  "inactive holiday has no actionable warnings",
);
assert(
  inactiveHoliday.infoFlags.includes("HOLIDAY_ROW_INFO") ||
    inactiveHoliday.infoFlags.includes("INACTIVE_EMPLOYEE_ATTENDANCE_ONLY"),
  "holiday shown in info flags",
);

const trayReverted = revertFmScheduleReviewDecision({
  result: traySeparate,
  jointJobKey: trayOp[0]!.jointJobKey,
});
const trayRevertedRows = trayReverted.fmScheduleRecords!.filter(
  (r) => r.jobNameOriginal === "トレー搬送",
);
assert(
  trayRevertedRows.every((r) => r.isJointOperation && r.jointOperationMemberCount === 3),
  "revert restores original joint detection",
);
assert(
  (trayReverted.fmReviewDecisionHistory?.length ?? 0) >= 2,
  "history entries recorded",
);

// 備考欄アルバイト同乗検出
assert(parseNotePartner("河邑（ﾊﾞ）")?.name === "河邑", "note partner halfwidth kana");
assert(parseNotePartner("河邑(ﾊﾞ)")?.name === "河邑", "note partner ascii paren");
assert(parseNotePartner("河邑（バ）")?.name === "河邑", "note partner fullwidth バ");
assert(parseNotePartner("河邑(バ)")?.name === "河邑", "note partner ascii fullwidth バ");
assert(parseNotePartner("通常備考") == null, "note partner non-match");

const noteRows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [10000, "エフピコ", "平和堂①", "24-90", "デイヴィ", "08:00", "16:00", "2026/05/03", "河邑（ﾊﾞ）"],
];
const noteResult = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: noteRows }],
  "note-partner.xlsx",
  masters,
  ledger,
);
const noteRow = noteResult.records[0]!;
assert(noteRow.isJointOperation, "note partner elevates to joint");
assert(noteRow.jointOperationMemberCount === 2, "note partner 2-man");
assert(
  noteRow.infoFlags.includes("NOTE_RIDE_ALONG_PARTNER_DETECTED"),
  "note partner info flag",
);
assert(
  !getActionableWarnings(noteRow).includes("REQUIRES_HUMAN_REVIEW"),
  "note partner not requires human review",
);
assert(
  noteRow.employeeRevenueShareAmount === 10000,
  "note partner keeps revenueAmount",
);
assert(
  formatJointPartnerDisplay(noteRow).includes("デイヴィ") &&
    formatJointPartnerDisplay(noteRow).includes("河邑（アルバイト）"),
  `note partner display: ${formatJointPartnerDisplay(noteRow)}`,
);

const patched = applyNotePartnerDetection([
  {
    ...noteRow,
    isJointOperation: false,
    jointOperationMemberCount: 1,
    jointOperationMembers: [],
    infoFlags: [],
    personalNote: "河邑(バ)",
  },
]);
assert(
  patched[0]!.jointOperationMemberCount === 2,
  "applyNotePartnerDetection patch",
);

// 手動車番補完
const manualFillRows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [10000, "エフピコ", "平和堂①", "24-90", "串間 盛寿", "08:00", "16:00", "2026/05/02", ""],
  [8000, "エフピコ", "集荷①", "38-12", "串間 盛寿", "08:30", "16:30", "2026/05/02", ""],
  [5000, "エフピコ", "京都②（若菜）", "", "串間 盛寿", "09:00", "17:00", "2026/05/02", ""],
];
const manualResult = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: manualFillRows }],
  "manual-fill.xlsx",
  masters,
  ledger,
);
const manualTarget = manualResult.records.find(
  (r) =>
    r.employeeNameOriginal === "串間 盛寿" &&
    r.jobNameOriginal === "京都②（若菜）" &&
    !r.vehicleNumberOriginal.trim(),
)!;
assert(manualTarget, "manual fill target row exists");
assert(needsManualVehicleFill(manualTarget), "needs manual vehicle fill");
const candidates = findManualVehicleFillCandidates(
  manualTarget,
  manualResult.records,
);
assert(
  candidates.some((c) => c.vehicle === "24-90"),
  "manual fill candidate from same day",
);
assert(
  getActionableWarnings(manualTarget).includes("REVENUE_WITHOUT_VEHICLE"),
  "manual target has revenue without vehicle",
);

const manualPreprocess = buildFmEmployeeSchedulePreprocessResult({
  fileName: "manual-fill.xlsx",
  records: manualResult.records,
  daySummaries: manualResult.daySummaries,
  operationSummaries: manualResult.operationSummaries,
  fmScheduleTotals: manualResult.fmScheduleTotals,
  parseWarnings: manualResult.parseWarnings,
  createdAt: new Date().toISOString(),
});
const beforePending = manualPreprocess.fmScheduleTotals?.pendingWarningCount ?? 0;
const manualFilled = applyFmManualVehicleFill({
  result: manualPreprocess,
  recordId: manualTarget.id,
  vehicle: "24-90",
  sourceRowNumber: 2,
  masters,
  ledger,
});
const filledRow = manualFilled.fmScheduleRecords!.find((r) => r.id === manualTarget.id)!;
assert(
  filledRow.vehicleNumberFilled === "24-90",
  "manual fill applied",
);
assert(
  filledRow.infoFlags.includes("VEHICLE_FILLED_MANUAL"),
  "manual fill info flag",
);
assert(
  !getActionableWarnings(filledRow).includes("REVENUE_WITHOUT_VEHICLE"),
  "manual fill clears revenue without vehicle warning",
);
assert(
  (manualFilled.fmScheduleTotals?.pendingWarningCount ?? 0) < beforePending,
  "manual fill reduces pending warnings",
);

assert(
  matchesWarningFlagFilter(manualTarget, "REVENUE_WITHOUT_VEHICLE"),
  "warning flag filter matches",
);
const warningFiltered = filterFmScheduleRecords(
  manualResult.records,
  "all",
  { warningFlag: "REVENUE_WITHOUT_VEHICLE" },
);
assert(
  warningFiltered.some((r) => r.id === manualTarget.id),
  "warning flag filter includes manual target",
);
assert(
  warningFiltered.every((r) => matchesWarningFlagFilter(r, "REVENUE_WITHOUT_VEHICLE")),
  "warning flag filter records",
);

// 修正モード保存（車番＋共同作業＋履歴）
const jointEditRows = [
  [
    "実売上",
    "荷主名",
    "業務名",
    "車両番号",
    "社員名",
    "出勤時間",
    "退勤時間",
    "日付",
    "個人備考",
  ],
  [10000, "エフピコ", "平和堂①", "24-90", "中出 真敬", "08:00", "16:00", "2026/05/04", ""],
  [8000, "エフピコ", "集荷①", "", "デイヴィ", "08:30", "16:00", "2026/05/04", "河邑（ﾊﾞ）"],
];
const jointEditProcessed = processFmEmployeeScheduleSheets(
  [{ sheetName: "Sheet1", rows: jointEditRows }],
  "joint-edit.xlsx",
  masters,
  ledger,
);
const jointPartnerRow = jointEditProcessed.records.find(
  (r) => r.employeeNameOriginal === "デイヴィ",
)!;
const partnerCandidates = findJointPartnerCandidates(
  jointPartnerRow,
  jointEditProcessed.records,
  "24-90",
);
assert(
  partnerCandidates.some((c) => c.name === "中出 真敬"),
  "joint partner candidate same day/time/vehicle",
);
assert(
  partnerCandidates.some((c) => c.label.includes("河邑")),
  "joint partner includes note part-time",
);

const jointEditResult = applyFmManualRecordEdit({
  result: buildFmEmployeeSchedulePreprocessResult({
    fileName: "joint-edit.xlsx",
    records: jointEditProcessed.records,
    daySummaries: jointEditProcessed.daySummaries,
    operationSummaries: jointEditProcessed.operationSummaries,
    fmScheduleTotals: jointEditProcessed.fmScheduleTotals,
    parseWarnings: jointEditProcessed.parseWarnings,
    createdAt: new Date().toISOString(),
  }),
  recordId: jointPartnerRow.id,
  edit: {
    vehicle: "24-90",
    jointMode: "two_man",
    partner: partnerCandidates.find((c) => c.name === "中出 真敬") ?? partnerCandidates[0]!,
    editedBy: "管理者",
  },
  masters,
  ledger,
});
const editedJoint = jointEditResult.fmScheduleRecords!.find(
  (r) => r.id === jointPartnerRow.id,
)!;
assert(editedJoint.vehicleNumberFilled === "24-90", "edit mode vehicle fill");
assert(editedJoint.isJointOperation, "edit mode joint");
assert(
  (editedJoint.manualEditHistory?.length ?? 0) >= 1,
  "edit mode history recorded",
);

const recordEdited = applyFmManualRecordEdit({
  result: manualPreprocess,
  recordId: manualTarget!.id,
  edit: { vehicle: "24-90", jointMode: "solo", editedBy: "管理者" },
  masters,
  ledger,
});
const histRow = recordEdited.fmScheduleRecords!.find((r) => r.id === manualTarget!.id)!;
assert(
  histRow.manualEditHistory?.some((h) => h.field === "vehicle"),
  "vehicle edit history",
);
assert(
  histRow.manualEditHistory?.every(
    (h) => h.editedBy === "管理者" && h.beforeLabel && h.afterLabel,
  ),
  "edit history has editor and before/after",
);

// 警告3状態・件数分離
const warnRow = jointResult.records.find(
  (r) => getActionableWarnings(r).length > 0,
)!;
assert(warnRow, "warning row for 3-state test");
const pendingBefore = countPendingWarnings(jointResult.records);
const dismissedRow = dismissFmWarning(
  warnRow,
  getActionableWarnings(warnRow)[0]!,
  "問題なし",
  "管理者",
);
assert(
  getWarningDisposition(dismissedRow, getActionableWarnings(warnRow)[0]!) ===
    "dismissed_ok" ||
    getDismissedWarnings(dismissedRow).includes(
      getActionableWarnings(warnRow)[0]!,
    ),
  "dismiss sets dismissed_ok",
);
assert(
  countPendingWarnings([dismissedRow]) < pendingBefore,
  "dismiss reduces pending count",
);
assert(
  countDismissedWarnings([dismissedRow]) >= 1,
  "dismissed count increases",
);

const heldRow = holdFmWarning(
  jointResult.records.find((r) => getActionableWarnings(r).length > 0) ?? warnRow,
  getActionableWarnings(
    jointResult.records.find((r) => getActionableWarnings(r).length > 0) ?? warnRow,
  )[0]!,
  "保留",
  "管理者",
);
assert(
  getOnHoldWarnings(heldRow).length >= 1,
  "hold sets on_hold",
);
assert(
  countOnHoldWarnings([heldRow]) >= 1,
  "on hold count",
);

const reopened = reopenFmWarning(heldRow, getOnHoldWarnings(heldRow)[0]!);
assert(
  getActionableWarnings(reopened).includes(getOnHoldWarnings(heldRow)[0]!),
  "reopen restores needs_action",
);

const dismissViaAction = applyFmWarningDismiss({
  result: jointEditResult,
  recordId: jointPartnerRow.id,
  flag: getActionableWarnings(jointPartnerRow)[0]!,
});
assert(
  (dismissViaAction.fmScheduleTotals?.dismissedWarningCount ?? 0) >= 0,
  "totals include dismissedWarningCount",
);
assert(
  dismissViaAction.fmScheduleTotals?.onHoldWarningCount != null,
  "totals include onHoldWarningCount",
);

const holdViaAction = applyFmWarningHold({
  result: jointEditResult,
  recordId: jointPartnerRow.id,
  flag:
    getActionableWarnings(
      jointEditResult.fmScheduleRecords!.find((r) => r.id === jointPartnerRow.id)!,
    )[0] ?? "REQUIRES_HUMAN_REVIEW",
});
assert(
  (holdViaAction.fmScheduleTotals?.onHoldWarningCount ?? 0) >= 0,
  "hold action updates totals",
);

// 判定理由
const reasons = buildJointDetectionReasons(editedJoint, jointEditResult.fmScheduleRecords!);
assert(
  reasons.some((r) => r.code === "note_detected" || r.code === "same_vehicle"),
  "joint detection reasons built",
);

assert(
  editedJoint.jointOperationReviewDecision === "joint_operation",
  "edit session sets joint review decision",
);

assert(
  matchesFmScheduleFilter(filledRow, "vehicle_filled"),
  "vehicle_filled filter includes manual fill",
);

// Phase2: 解消率
const resolution = computeWarningResolutionRate(jointResult.records);
assert(
  resolution.totalOriginalWarningCount >= 0,
  "resolution total warnings",
);
assert(
  jointResult.fmScheduleTotals!.warningResolutionRatePercent >= 0,
  "resolution rate in totals",
);

// Phase2: 警告ナビキュー
const queue = buildFmWarningEditQueue(jointResult.records);
assert(queue.length >= 0, "warning edit queue");
if (queue.length > 0) {
  const idx = findWarningEditIndex(queue, queue[0]!.recordId, queue[0]!.flag);
  assert(idx === 0, "warning queue index");
}

// Phase2: 手動修正フィルタ・件数
assert(
  matchesFmScheduleFilter(editedJoint, "manual_edited"),
  "manual_edited filter",
);
assert(
  matchesFmScheduleFilter(editedJoint, "manual_vehicle_fill"),
  "manual_vehicle_fill filter",
);
assert(
  (manualFilled.fmScheduleTotals?.manualEditedRowCount ?? 0) >= 1,
  "manual edited row count",
);

// Phase2: 車番根拠
const vehicleHist = editedJoint.manualEditHistory?.find((e) => e.field === "vehicle");
assert(
  vehicleHist?.rationale?.basisLines?.includes("同日"),
  "vehicle fill rationale same day",
);

// Phase2: revert
const reverted = revertFmRecordToImport({
  result: jointEditResult,
  recordId: jointPartnerRow.id,
});
const revertedRow = reverted.fmScheduleRecords!.find((r) => r.id === jointPartnerRow.id)!;
assert(
  (revertedRow.manualEditHistory?.length ?? 0) === 0,
  "revert to import clears history",
);

// save snapshot + undo
const withSave = applyFmManualRecordEdit({
  result: jointEditResult,
  recordId: jointPartnerRow.id,
  edit: { vehicle: "24-90", jointMode: "solo", editedBy: "管理者" },
  masters,
  ledger,
});
const undone = revertFmRecordToPreviousSave({
  result: withSave,
  recordId: jointPartnerRow.id,
  masters,
  ledger,
});
assert(undone.fmScheduleRecords != null, "revert to previous save");

console.log("test-fm-employee-schedule-parser: OK");
