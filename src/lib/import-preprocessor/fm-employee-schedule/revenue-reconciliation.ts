import type {
  FmEmployeeScheduleStagingRecord,
  FmScheduleRevenueReconciliation,
} from "./types";

export function buildFmScheduleRevenueReconciliation(
  records: FmEmployeeScheduleStagingRecord[],
): FmScheduleRevenueReconciliation {
  const workRecords = records.filter((r) => !r.isAttendanceOnlyRow);

  const excelOriginalTotal = workRecords
    .filter((r) => r.isRevenueRow)
    .reduce((sum, r) => sum + (r.revenueAmount ?? 0), 0);

  const companyTotal = excelOriginalTotal;

  const employeeShareTotal = workRecords.reduce(
    (sum, r) => sum + r.employeeRevenueShareAmount,
    0,
  );

  const mismatchReasons: string[] = [];

  if (companyTotal !== excelOriginalTotal) {
    mismatchReasons.push(
      `会社売上合計(${companyTotal}) ≠ Excel原文売上合計(${excelOriginalTotal})`,
    );
  }

  const partnerRevenue = workRecords
    .filter((r) => r.isPartnerLikeRow && r.isRevenueRow)
    .reduce((sum, r) => sum + (r.revenueAmount ?? 0), 0);
  const expectedEmployeeShare = excelOriginalTotal - partnerRevenue;
  if (employeeShareTotal !== expectedEmployeeShare) {
    mismatchReasons.push(
      `社員別売上合計(${employeeShareTotal}) ≠ 期待値(${expectedEmployeeShare})`,
    );
  }

  return {
    excelOriginalTotal,
    companyTotal,
    employeeShareTotal,
    isBalanced: mismatchReasons.length === 0,
    mismatchReasons,
  };
}
