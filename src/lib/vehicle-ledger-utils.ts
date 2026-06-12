import type { VehicleDetail } from "./types";

const INSPECTION_ALERT_DAYS = 30;

export function suggestNextVehicleId(vehicles: VehicleDetail[]): string {
  const numericIds = vehicles
    .map((v) => Number(v.vehicleId))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numericIds.length === 0) return "1";
  return String(Math.max(...numericIds) + 1);
}

export function sortVehicles(vehicles: VehicleDetail[]): VehicleDetail[] {
  return [...vehicles].sort((a, b) =>
    a.vehicleId.localeCompare(b.vehicleId, "ja", { numeric: true }),
  );
}

export function isVehicleIdTaken(
  vehicles: VehicleDetail[],
  vehicleId: string,
  excludeId?: string,
): boolean {
  const normalized = vehicleId.trim();
  return vehicles.some(
    (v) =>
      v.vehicleId.trim() === normalized &&
      (excludeId === undefined || v.id !== excludeId),
  );
}

export function isVehicleActive(vehicle: VehicleDetail): boolean {
  return !vehicle.scrappedDate.trim();
}

export function daysUntilInspection(
  inspectionExpiry: string,
  today = new Date(),
): number | null {
  if (!inspectionExpiry.trim()) return null;
  const expiry = new Date(`${inspectionExpiry}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return Math.ceil((expiry.getTime() - start.getTime()) / 86_400_000);
}

export function isInspectionAlert(
  inspectionExpiry: string,
  today = new Date(),
): boolean {
  const days = daysUntilInspection(inspectionExpiry, today);
  if (days === null) return false;
  return days <= INSPECTION_ALERT_DAYS;
}

export function formatLoadKg(value: number): string {
  if (!value) return "—";
  return `${value.toLocaleString("ja-JP")} kg`;
}
