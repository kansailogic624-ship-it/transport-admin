import { normalizeDriverName } from "@/lib/driving-report-parser";
import type { AliasResolveResult } from "@/lib/alias-engine";
import type { EmployeeDetail } from "@/lib/types";
import { normalizePartnerLabelKey } from "./external-partner-labels";

export function findInactiveEmployeeInLedger(
  employees: EmployeeDetail[] | undefined,
  employeeNameOriginal: string,
): EmployeeDetail | null {
  if (!employees?.length) return null;
  const key = normalizeDriverName(employeeNameOriginal);
  if (!key) return null;

  for (const employee of employees) {
    if (employee.activeFlag === 1) continue;
    if (normalizeDriverName(employee.name) === key) {
      return employee;
    }
  }
  return null;
}

export function buildInactiveEmployeeResolveResult(
  employee: EmployeeDetail,
  employeeNameOriginal: string,
): AliasResolveResult {
  return {
    status: "resolved",
    canonicalId: employee.employeeId,
    canonicalName: employee.name.trim() || employeeNameOriginal.trim(),
    matchedAliasId: null,
    candidates: [],
    aliasKey: normalizeDriverName(employeeNameOriginal),
  };
}

export function buildPartnerEmployeeResolveResult(
  partnerNameOriginal: string,
): AliasResolveResult {
  return {
    status: "resolved",
    canonicalId: null,
    canonicalName: null,
    matchedAliasId: null,
    candidates: [],
    aliasKey: `partner:${normalizePartnerLabelKey(partnerNameOriginal)}`,
  };
}

export function buildPartnerDayKey(
  businessDate: string,
  partnerNameOriginal: string,
): string {
  return `partner:${businessDate}:${partnerNameOriginal.trim()}`;
}
