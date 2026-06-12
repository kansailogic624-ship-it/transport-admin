import { normalizeDriverName } from "./driving-report-parser";
import {
  buildEmployeeNameIndex,
  resolveCanonicalEmployeeName,
  type EmployeeNameIndex,
} from "./employee-name-resolve";
import { newCrewMember } from "./crew-utils";
import { normalizeIsoDate } from "./import-match-keys";
import type { ParsedFileMakerDispatch } from "./filemaker-dispatch-parser";
import { normalizeKey } from "./trip-utils";
import type {
  CrewMemberType,
  EmployeeDetail,
  MasterData,
  TripCrewMember,
} from "./types";

/** 備考欄の「塩貝(ﾊﾞ)」「塩貝（ﾊﾞ）」から助手の苗字を抽出 */
export function extractPartTimeSurnameFromRemarks(remarks: string): string | null {
  const text = remarks.trim();
  if (!text) return null;

  const markerRe = /[（(]\s*(?:ﾊﾞ|バ|ば)\s*[）)]/u;
  const markerMatch = text.match(markerRe);
  if (!markerMatch || markerMatch.index == null) return null;

  const before = text.slice(0, markerMatch.index).trim();
  const nameMatch = before.match(/([^\s：:、,/／]+)$/u);
  const surname = nameMatch?.[1]?.trim() ?? "";
  return surname.length > 0 ? surname : null;
}

function parseFmRevenue(revenue: string): number {
  const n = Number(String(revenue).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function sumRevenueField(a: string, b: string): string {
  const total = parseFmRevenue(a) + parseFmRevenue(b);
  return total > 0 ? String(total) : a || b;
}

function fmOperationKey(d: ParsedFileMakerDispatch): string | null {
  if (!d.date || d.isAttendanceRow) return null;
  const shipper = normalizeKey(d.shipperName, "");
  const job = normalizeKey(d.dispatchName, "");
  if (!shipper || !job) return null;
  return `${normalizeIsoDate(d.date)}|${shipper}|${job}`;
}

function hasMonthlySalary(name: string, masters: MasterData): boolean {
  const key = normalizeDriverName(name);
  for (const [salaryName, amount] of Object.entries(masters.employeeSalaries)) {
    if (amount <= 0) continue;
    if (normalizeDriverName(salaryName) === key) return true;
    if (key.startsWith(normalizeDriverName(salaryName))) return true;
    if (normalizeDriverName(salaryName).startsWith(key)) return true;
  }
  return false;
}

/** employee_details から苗字一致のアルバイトを検索 */
export function findPartTimeEmployeeBySurname(
  surname: string,
  employees: EmployeeDetail[],
  masters: MasterData,
): EmployeeDetail | null {
  const needle = surname.trim();
  if (!needle) return null;

  const candidates = employees.filter((e) => {
    if (e.activeFlag !== 1) return false;
    const name = e.name.trim();
    if (!name) return false;
    if (!name.startsWith(needle) && !name.includes(needle)) return false;
    return !hasMonthlySalary(name, masters);
  });

  const exact = candidates.filter((e) => e.name.trim().startsWith(needle));
  return exact[0] ?? candidates[0] ?? null;
}

export type ResolvedFmAssistant = {
  name: string;
  memberType: CrewMemberType;
  employeeId?: string;
};

/** 配車行から助手（セカンドドライバー）を解決 */
export function resolveFmAssistant(
  dispatch: ParsedFileMakerDispatch,
  employees: EmployeeDetail[],
  masters: MasterData,
): ResolvedFmAssistant | null {
  const remarksSurname =
    dispatch.assistantFromRemarks ??
    (dispatch.personalRemarks
      ? extractPartTimeSurnameFromRemarks(dispatch.personalRemarks)
      : null);

  if (remarksSurname) {
    const emp = findPartTimeEmployeeBySurname(
      remarksSurname,
      employees,
      masters,
    );
    return {
      name: emp?.name ?? remarksSurname,
      memberType: "part_time",
      employeeId: emp?.employeeId,
    };
  }

  if (dispatch.assistantDriverName) {
    const name = dispatch.assistantDriverName.trim();
    if (!name) return null;
    const emp = employees.find(
      (e) =>
        e.activeFlag === 1 &&
        normalizeDriverName(e.name) === normalizeDriverName(name),
    );
    const memberType: CrewMemberType =
      emp && !hasMonthlySalary(emp.name, masters) ? "part_time" : "employee";
    return {
      name: emp?.name ?? name,
      memberType,
      employeeId: emp?.employeeId,
    };
  }

  return null;
}

/** 乗務員リストを生成（主運転手＋助手） */
export function makeCrewFromFmDispatch(
  dispatch: ParsedFileMakerDispatch,
  employees: EmployeeDetail[],
  masters: MasterData,
): TripCrewMember[] {
  const index = buildEmployeeNameIndex(employees, masters);
  const primary = newCrewMember("employee");
  primary.name = resolveCanonicalEmployeeName(dispatch.driverName, index);

  const assistant = resolveFmAssistant(dispatch, employees, masters);
  if (!assistant) return [primary];

  const second = newCrewMember(assistant.memberType);
  second.name = assistant.name;
  if (assistant.employeeId) {
    second.id = assistant.employeeId;
  }
  return [primary, second];
}

/**
 * 同一日・同一荷主・同一業務で「車両あり行」と「車両なし行」を1運行に合体。
 * 助手行は消費し、主運転手（車両あり）行に助手名と売上を統合する。
 */
export function mergeFmTwoManVehicleRows(
  dispatches: ParsedFileMakerDispatch[],
): ParsedFileMakerDispatch[] {
  const consumed = new Set<number>();
  const mergedByPrimaryIdx = new Map<number, ParsedFileMakerDispatch>();

  const opGroups = new Map<string, number[]>();
  for (let i = 0; i < dispatches.length; i++) {
    const key = fmOperationKey(dispatches[i]!);
    if (!key) continue;
    const list = opGroups.get(key) ?? [];
    list.push(i);
    opGroups.set(key, list);
  }

  for (const indices of opGroups.values()) {
    const vehicleRows = indices.filter(
      (i) => !consumed.has(i) && dispatches[i]!.vehicleNumber.trim(),
    );
    const noVehicleRows = indices.filter(
      (i) => !consumed.has(i) && !dispatches[i]!.vehicleNumber.trim(),
    );

    if (vehicleRows.length === 0 || noVehicleRows.length === 0) continue;

    let primaryIdx = vehicleRows[0]!;
    for (const idx of vehicleRows) {
      if (
        parseFmRevenue(dispatches[idx]!.revenue) >
        parseFmRevenue(dispatches[primaryIdx]!.revenue)
      ) {
        primaryIdx = idx;
      }
    }

    let mergedRow: ParsedFileMakerDispatch = { ...dispatches[primaryIdx]! };
    let assistantName: string | undefined;

    for (const idx of noVehicleRows) {
      const assistantRow = dispatches[idx]!;
      if (
        normalizeDriverName(assistantRow.driverName) ===
        normalizeDriverName(mergedRow.driverName)
      ) {
        consumed.add(idx);
        continue;
      }

      assistantName = assistantRow.driverName;
      mergedRow = {
        ...mergedRow,
        revenue: sumRevenueField(mergedRow.revenue, assistantRow.revenue),
        tollFee: sumRevenueField(mergedRow.tollFee, assistantRow.tollFee),
        assistantDriverName: assistantName,
        personalRemarks:
          mergedRow.personalRemarks || assistantRow.personalRemarks,
      };
      consumed.add(idx);
    }

    if (assistantName) {
      mergedByPrimaryIdx.set(primaryIdx, mergedRow);
      consumed.add(primaryIdx);
    }
  }

  const out: ParsedFileMakerDispatch[] = [];
  const emittedMerged = new Set<number>();

  for (let i = 0; i < dispatches.length; i++) {
    if (consumed.has(i)) {
      if (mergedByPrimaryIdx.has(i) && !emittedMerged.has(i)) {
        out.push(mergedByPrimaryIdx.get(i)!);
        emittedMerged.add(i);
      }
      continue;
    }
    out.push(dispatches[i]!);
  }

  return out;
}

/** 備考欄の (ﾊﾞ) 表記を解析し assistantFromRemarks を付与 */
export function applyFmRemarksAssistants(
  dispatches: ParsedFileMakerDispatch[],
): ParsedFileMakerDispatch[] {
  return dispatches.map((d) => {
    if (d.assistantFromRemarks || !d.personalRemarks) return d;
    const surname = extractPartTimeSurnameFromRemarks(d.personalRemarks);
    if (!surname) return d;
    return { ...d, assistantFromRemarks: surname };
  });
}

/** 配車行の運転手名・助手名を社員マスタの正式表記へ統一 */
export function applyCanonicalEmployeeNames(
  dispatches: ParsedFileMakerDispatch[],
  index: EmployeeNameIndex,
): ParsedFileMakerDispatch[] {
  if (index.size === 0) return dispatches;

  return dispatches.map((d) => ({
    ...d,
    driverName: resolveCanonicalEmployeeName(d.driverName, index),
    assistantDriverName: d.assistantDriverName
      ? resolveCanonicalEmployeeName(d.assistantDriverName, index)
      : undefined,
  }));
}

/** FileMaker 配車のツーマン事前処理（車両行合体 → 備考解析 → 氏名名寄せ） */
export function preprocessFmDispatches(
  dispatches: ParsedFileMakerDispatch[],
  employees: EmployeeDetail[],
  masters: MasterData,
): ParsedFileMakerDispatch[] {
  const index = buildEmployeeNameIndex(employees, masters);
  const merged = applyFmRemarksAssistants(mergeFmTwoManVehicleRows(dispatches));
  return applyCanonicalEmployeeNames(merged, index);
}
