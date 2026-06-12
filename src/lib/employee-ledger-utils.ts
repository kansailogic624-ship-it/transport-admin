import type { EmployeeDetail } from "./types";

export function suggestNextEmployeeId(employees: EmployeeDetail[]): string {
  const numericIds = employees
    .map((e) => Number(e.employeeId))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numericIds.length === 0) return "1";
  return String(Math.max(...numericIds) + 1);
}

export function sortEmployees(employees: EmployeeDetail[]): EmployeeDetail[] {
  return [...employees].sort((a, b) =>
    a.employeeId.localeCompare(b.employeeId, "ja", { numeric: true }),
  );
}

export function isEmployeeIdTaken(
  employees: EmployeeDetail[],
  employeeId: string,
  excludeId?: string,
): boolean {
  const normalized = employeeId.trim();
  return employees.some(
    (e) =>
      e.employeeId.trim() === normalized &&
      (excludeId === undefined || e.id !== excludeId),
  );
}
