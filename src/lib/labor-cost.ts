import { isPartnerTrip } from "./run-type";
import { recordInMonth } from "./trip-utils";
import type {
  CrewMemberType,
  DailyRecord,
  MasterData,
  TripCrewMember,
  TripEntry,
} from "./types";

export type LaborLineItem = {
  name: string;
  memberType: CrewMemberType;
  cost: number;
};

export type TripLaborCost = {
  total: number;
  items: LaborLineItem[];
};

const TYPE_LABELS: Record<CrewMemberType, string> = {
  employee: "社員",
  part_time: "アルバイト",
  dispatch: "派遣",
};

export function crewTypeLabel(type: CrewMemberType): string {
  return TYPE_LABELS[type];
}

export function formatCrewSummary(crew: TripCrewMember[]): string {
  if (crew.length === 0) return "—";
  return crew
    .map((c) => `${crewTypeLabel(c.memberType)}:${c.name || "未入力"}`)
    .join(" + ");
}

function parseDailyCost(value: string | undefined): number {
  const n = Number(value ?? "");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function countEmployeeTripsInMonth(
  records: DailyRecord[],
  yearMonth: string,
  employeeName: string,
): number {
  let count = 0;
  for (const record of records) {
    if (!recordInMonth(record.date, yearMonth)) continue;
    for (const trip of record.trips) {
      const crew = trip.crew ?? [];
      if (
        crew.some(
          (m) => m.memberType === "employee" && m.name.trim() === employeeName,
        )
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function employeeCostForTrip(
  employeeName: string,
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
): number {
  const salary = masters.employeeSalaries[employeeName] ?? 0;
  if (salary <= 0) return 0;

  const tripCount = countEmployeeTripsInMonth(records, yearMonth, employeeName);
  if (tripCount > 0) {
    return Math.round(salary / tripCount);
  }

  const days = daysInMonth(yearMonth);
  return Math.round(salary / days);
}

function nonEmployeeCost(
  member: TripCrewMember,
  masters: MasterData,
): number {
  const entered = parseDailyCost(member.dailyCost);
  if (entered > 0) return entered;

  if (member.memberType === "part_time") {
    return masters.defaultPartTimeDaily ?? 0;
  }
  if (member.memberType === "dispatch") {
    return masters.defaultDispatchDaily ?? 0;
  }
  return 0;
}

export function calculateTripLaborCost(
  trip: TripEntry,
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
): TripLaborCost {
  if (isPartnerTrip(trip)) {
    return { total: 0, items: [] };
  }

  const crew = trip.crew ?? [];
  const items: LaborLineItem[] = [];

  for (const member of crew) {
    const name = member.name.trim() || "（名前未入力）";
    let cost = 0;

    if (member.memberType === "employee") {
      cost = employeeCostForTrip(name, records, yearMonth, masters);
    } else {
      cost = nonEmployeeCost(member, masters);
    }

    if (cost > 0 || member.name.trim()) {
      items.push({
        name,
        memberType: member.memberType,
        cost,
      });
    }
  }

  return {
    total: items.reduce((s, i) => s + i.cost, 0),
    items,
  };
}
