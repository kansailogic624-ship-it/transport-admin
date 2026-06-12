import { normalizeDriverName } from "./driving-report-parser";
import type { DailyRecord, EmployeeDetail, MasterData } from "./types";

/** normalizeDriverName キー → 正式社員名（マスタ表記） */
export type EmployeeNameIndex = Map<string, string>;

function registerName(index: EmployeeNameIndex, rawName: string, canonical: string): void {
  const key = normalizeDriverName(rawName);
  const name = canonical.trim();
  if (!key || !name || name === "—") return;
  if (!index.has(key)) {
    index.set(key, name);
  }
}

/** 社員マスタ・給与マスタ・ドライバーマスタから名寄せ索引を構築 */
export function buildEmployeeNameIndex(
  employees: EmployeeDetail[],
  masters?: MasterData,
): EmployeeNameIndex {
  const index: EmployeeNameIndex = new Map();

  for (const employee of employees) {
    if (employee.activeFlag !== 1) continue;
    registerName(index, employee.name, employee.name);
  }

  if (masters) {
    for (const driver of masters.drivers) {
      registerName(index, driver, driver);
    }
    for (const name of Object.keys(masters.employeeSalaries)) {
      registerName(index, name, name);
    }
  }

  return index;
}

/** インポート名を社員マスタの正式表記へ解決（未登録時は入力値をそのまま返す） */
export function resolveCanonicalEmployeeName(
  raw: string | null | undefined,
  index: EmployeeNameIndex,
): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  const key = normalizeDriverName(trimmed);
  return index.get(key) ?? trimmed;
}

/** 日次レコードの代表ドライバー名・乗務員名をマスタ表記へ統一 */
export function canonicalizeDailyRecordNames(
  record: DailyRecord,
  index: EmployeeNameIndex,
): DailyRecord {
  if (index.size === 0) return record;

  const driverName = resolveCanonicalEmployeeName(record.driverName, index);
  const trips = record.trips.map((trip) => ({
    ...trip,
    crew: trip.crew.map((member) => ({
      ...member,
      name: member.name.trim()
        ? resolveCanonicalEmployeeName(member.name, index)
        : member.name,
    })),
  }));

  if (driverName === record.driverName && trips === record.trips) {
    return record;
  }

  return {
    ...record,
    driverName,
    trips,
  };
}
