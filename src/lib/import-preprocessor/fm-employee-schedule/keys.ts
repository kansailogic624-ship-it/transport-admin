import { normalizeAliasKey } from "@/lib/alias-engine";

export function buildEmployeeDayKey(
  businessDate: string,
  employeeCanonical: string | null,
  employeeOriginal: string,
): string {
  const employeePart =
    employeeCanonical?.trim() ||
    normalizeAliasKey("employee", employeeOriginal) ||
    employeeOriginal.trim() ||
    "（社員未設定）";
  return `${businessDate}:${employeePart}`;
}

export function buildEmployeeJobKey(input: {
  businessDate: string;
  employeeCanonical: string | null;
  employeeOriginal: string;
  shipperCanonical: string | null;
  shipperOriginal: string;
  jobCanonical: string | null;
  jobOriginal: string;
  vehicleCanonical: string | null;
  vehicleOriginal: string;
  sourceRowNumber: number;
  provisional?: boolean;
}): string {
  const employee =
    input.employeeCanonical?.trim() ||
    normalizeAliasKey("employee", input.employeeOriginal) ||
    input.employeeOriginal.trim();
  const shipper =
    input.shipperCanonical?.trim() ||
    normalizeAliasKey("shipper", input.shipperOriginal) ||
    input.shipperOriginal.trim();
  const job =
    input.jobCanonical?.trim() ||
    normalizeAliasKey("course", input.jobOriginal) ||
    input.jobOriginal.trim();
  const vehicle =
    input.vehicleCanonical?.trim() ||
    normalizeAliasKey("vehicle", input.vehicleOriginal) ||
    input.vehicleOriginal.trim();

  return [
    input.businessDate,
    employee || "—",
    shipper || "—",
    job || "—",
    vehicle || "—",
    String(input.sourceRowNumber),
  ].join(":");
}

/** 共同作業（2マン）判定用。日付・荷主・業務のみ（車両・社員・行番号は含めない） */
export function buildJointJobKey(input: {
  businessDate: string;
  shipperCanonical: string | null;
  shipperOriginal: string;
  jobCanonical: string | null;
  jobOriginal: string;
}): string {
  const shipper =
    input.shipperCanonical?.trim() ||
    normalizeAliasKey("shipper", input.shipperOriginal) ||
    input.shipperOriginal.trim();
  const job =
    input.jobCanonical?.trim() ||
    normalizeAliasKey("course", input.jobOriginal) ||
    input.jobOriginal.trim();

  return [
    input.businessDate || "—",
    shipper || "—",
    job || "—",
  ].join(":");
}

/** @deprecated FM社員スケジュールでは jointJobKey を使用。車両込みの旧キー。 */
export function buildOperationKey(input: {
  businessDate: string;
  shipperCanonical: string | null;
  shipperOriginal: string;
  jobCanonical: string | null;
  jobOriginal: string;
  vehicleCanonical: string | null;
  vehicleOriginal: string;
}): string {
  const shipper =
    input.shipperCanonical?.trim() ||
    normalizeAliasKey("shipper", input.shipperOriginal) ||
    input.shipperOriginal.trim();
  const job =
    input.jobCanonical?.trim() ||
    normalizeAliasKey("course", input.jobOriginal) ||
    input.jobOriginal.trim();
  const vehicle =
    input.vehicleCanonical?.trim() ||
    normalizeAliasKey("vehicle", input.vehicleOriginal) ||
    input.vehicleOriginal.trim();

  return [
    input.businessDate || "—",
    shipper || "—",
    job || "—",
    vehicle || "—",
  ].join(":");
}
