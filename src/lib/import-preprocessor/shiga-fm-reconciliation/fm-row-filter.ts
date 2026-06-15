import type { FmEmployeeScheduleStagingRecord } from "../fm-employee-schedule/types";
import {
  isExcludedFmJob,
  resolveFmJobCourseMapping,
} from "./course-mapping";
import { isFaTruckShipper } from "./vendor-mapping";

export function isFmRowEligibleForShigaReconciliation(
  record: FmEmployeeScheduleStagingRecord,
): boolean {
  if (!record.isRevenueRow) return false;
  if (record.isAttendanceOnlyRow || record.isHolidayRow) return false;
  if ((record.revenueAmount ?? 0) <= 0) return false;

  const shipper = record.shipperNameOriginal.trim();
  const job = record.jobNameOriginal.trim();

  if (!isFaTruckShipper(shipper)) return false;
  if (isExcludedFmJob(job)) return false;

  return resolveFmJobCourseMapping(job) != null;
}

export function filterFmRowsForReconciliation(
  records: FmEmployeeScheduleStagingRecord[],
): FmEmployeeScheduleStagingRecord[] {
  return records.filter(isFmRowEligibleForShigaReconciliation);
}
