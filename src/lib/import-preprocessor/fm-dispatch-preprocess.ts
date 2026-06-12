/**
 * FM配車 前処理コア（旧 fusion-import / fm-dispatch-merge ロジック再利用）
 * ※ Firestore には一切アクセスしない
 */

import { normalizeDriverName } from "@/lib/driving-report-parser";
import {
  activeFmDispatches,
  fmDispatchRowId,
  isHolidayDispatch,
  resolveHolidayDayStatus,
} from "@/lib/fusion-import";
import type { ParsedFileMakerDispatch } from "@/lib/filemaker-dispatch-parser";
import {
  makeCrewFromFmDispatch,
  preprocessFmDispatches,
} from "@/lib/fm-dispatch-merge";
import { normalizeIsoDate } from "@/lib/import-match-keys";
import { DEFAULT_MASTERS, type EmployeeDetail, type MasterData } from "@/lib/types";
import {
  classifyFmOperationType,
  normalizeDriverForPreprocess,
  normalizeJobForPreprocess,
  normalizeShipperForPreprocess,
  normalizeVehicleForPreprocess,
} from "./normalize";
import { parseMoneyText } from "./parsers/preprocess-common";
import type {
  FmDispatchAmountTotals,
  PreprocessedRecord,
  PreprocessNormalizeContext,
} from "./types";

export function buildFmSourceDispatchKey(
  dispatch: ParsedFileMakerDispatch,
): string {
  return [
    "filemaker_dispatch",
    normalizeIsoDate(dispatch.date),
    normalizeDriverName(dispatch.driverName),
    dispatch.vehicleNumber.trim(),
    dispatch.shipperName.trim(),
    dispatch.dispatchName.trim(),
    dispatch.revenue.trim(),
    dispatch.tollFee?.trim() ?? "",
    dispatch.timecardIn?.trim() ?? "",
    dispatch.timecardOut?.trim() ?? "",
  ].join("|");
}

function driverDayGroupKey(dispatch: ParsedFileMakerDispatch): string | null {
  if (!dispatch.date || !dispatch.driverName) return null;
  return `${normalizeIsoDate(dispatch.date)}|${normalizeDriverName(dispatch.driverName)}`;
}

/** 旧 fuseDispatchesWithReports と同じ基準で取込対象行を決定 */
export function selectFmDispatchesForPreprocess(
  processed: ParsedFileMakerDispatch[],
): ParsedFileMakerDispatch[] {
  const groups = new Map<string, ParsedFileMakerDispatch[]>();

  for (const d of processed) {
    const key = driverDayGroupKey(d);
    if (!key) continue;
    const grp = groups.get(key) ?? [];
    grp.push(d);
    groups.set(key, grp);
  }

  const selected: ParsedFileMakerDispatch[] = [];
  const selectedIds = new Set<string>();

  for (const group of groups.values()) {
    const holidayGroup = group.filter(isHolidayDispatch);
    const workGroup = group.filter((d) => !isHolidayDispatch(d));
    const activeWork = activeFmDispatches(workGroup);

    if (activeWork.length === 0 && holidayGroup.length > 0) {
      const head = holidayGroup[0]!;
      const id = fmDispatchRowId(head);
      if (!selectedIds.has(id)) {
        selectedIds.add(id);
        selected.push(head);
      }
      continue;
    }

    for (const d of activeWork) {
      const id = fmDispatchRowId(d);
      if (selectedIds.has(id)) continue;
      selectedIds.add(id);
      selected.push(d);
    }
  }

  return selected;
}

function dispatchToPreprocessedRecord(
  dispatch: ParsedFileMakerDispatch,
  sourceRowNumber: number,
  ctx?: PreprocessNormalizeContext,
  masters: MasterData = DEFAULT_MASTERS,
  employees: EmployeeDetail[] = [],
): PreprocessedRecord {
  const driver = normalizeDriverForPreprocess(dispatch.driverName, ctx);
  const vehicle = normalizeVehicleForPreprocess(dispatch.vehicleNumber, ctx);
  const shipper = normalizeShipperForPreprocess(dispatch.shipperName);
  const job = normalizeJobForPreprocess(dispatch.dispatchName);
  const revenue = parseMoneyText(dispatch.revenue);
  const tollFeeAmount = parseMoneyText(dispatch.tollFee);

  const crew = makeCrewFromFmDispatch(dispatch, employees, masters);
  const mainDriverName = crew[0]?.name ?? dispatch.driverName;
  const assistantDriverNames = crew
    .slice(1)
    .map((m) => m.name.trim())
    .filter(Boolean);

  const classified = classifyFmOperationType(dispatch, masters);

  const timecardIn = dispatch.timecardIn ?? "";
  const timecardOut = dispatch.timecardOut ?? "";
  const sourceDispatchKey = buildFmSourceDispatchKey(dispatch);

  const isHoliday = isHolidayDispatch(dispatch);
  const dayStatus = isHoliday
    ? (dispatch.dayStatus ?? resolveHolidayDayStatus([dispatch]))
    : undefined;

  const record: PreprocessedRecord = {
    id: crypto.randomUUID(),
    sourceType: "filemaker_dispatch",
    sourceFileName: dispatch.sourceFileName,
    sourceRowNumber,
    businessDate: dispatch.date,
    driverNameOriginal: dispatch.driverName,
    driverNameNormalized: driver.normalized,
    vehicleNoOriginal: dispatch.vehicleNumber,
    vehicleNoNormalized: vehicle.normalized || vehicle.display,
    shipperNameOriginal: dispatch.shipperName,
    shipperNameNormalized: shipper.normalized,
    jobNameOriginal: dispatch.dispatchName,
    jobNameNormalized: job,
    routeNameOriginal: dispatch.dispatchName,
    routeNameNormalized: job,
    companyOriginal: classified.partnerName || dispatch.shipperName,
    companyNormalized: classified.companyNormalized,
    operationType: classified.operationType,
    amount: revenue,
    cost: 0,
    salesAmount: revenue,
    paymentAmount: 0,
    differenceAmount: 0,
    excelDifferenceAmount: 0,
    calculatedGrossProfitAmount: 0,
    laborCostAmount: 0,
    workStartTime: timecardIn,
    workEndTime: timecardOut,
    sourceDispatchKey,
    startTime: timecardIn,
    endTime: timecardOut,
    tollFeeAmount,
    crewMembers: crew,
    mainDriverName,
    assistantDriverNames,
    partnerName: classified.partnerName,
    timecardIn,
    timecardOut,
    dayStatus,
    warnings: [...dispatch.warnings],
    errors: [],
    warningStatus: "pending",
    isManuallyEdited: false,
    raw: { ...dispatch },
  };

  return record;
}

export function buildFmDispatchAmountTotals(
  records: PreprocessedRecord[],
): FmDispatchAmountTotals {
  const totals: FmDispatchAmountTotals = {
    sales: 0,
    tollFee: 0,
    count: 0,
    ownCount: 0,
    partnerCount: 0,
    unknownCount: 0,
  };

  for (const record of records) {
    if (record.errors.length > 0) continue;
    totals.count += 1;
    totals.sales += record.salesAmount ?? record.amount ?? 0;
    totals.tollFee += record.tollFeeAmount ?? 0;
    if (record.operationType === "own") totals.ownCount += 1;
    else if (record.operationType === "partner") totals.partnerCount += 1;
    else totals.unknownCount += 1;
  }

  return totals;
}

export function processFmDispatchesForPreprocess(
  rawDispatches: ParsedFileMakerDispatch[],
  options: {
    ctx?: PreprocessNormalizeContext;
    masters?: MasterData | null;
    employees?: EmployeeDetail[];
  } = {},
): { records: PreprocessedRecord[]; parseWarnings: string[] } {
  const masters = options.masters ?? DEFAULT_MASTERS;
  const employees = options.employees ?? [];
  const processed = preprocessFmDispatches(rawDispatches, employees, masters);
  const selected = selectFmDispatchesForPreprocess(processed);

  const rowNumberById = new Map<string, number>();
  processed.forEach((d, index) => {
    rowNumberById.set(fmDispatchRowId(d), index + 1);
  });

  const records = selected.map((dispatch) => {
    const rowNum = rowNumberById.get(fmDispatchRowId(dispatch)) ?? 0;
    return dispatchToPreprocessedRecord(
      dispatch,
      rowNum,
      options.ctx,
      masters,
      employees,
    );
  });

  const parseWarnings: string[] = [];
  const skippedHoliday = processed.filter(
    (d) => isHolidayDispatch(d) && !selected.some((s) => fmDispatchRowId(s) === fmDispatchRowId(d)),
  );
  if (skippedHoliday.length > 0) {
    parseWarnings.push(
      `休日行 ${skippedHoliday.length} 件は同日運行ありのためスキップ（旧処理と同様）`,
    );
  }

  return { records, parseWarnings };
}
