import type { JobAnalysisRow, ShipperAnalysisRow } from "./dashboard-analytics";
import { allocateExpenseByWeights } from "./monthly-aggregate";

/** 経営判断用の目標利益率（15%） */
export const TARGET_NET_PROFIT_MARGIN = 0.15;

export type ShipperJobSortMode =
  | "shipperName"
  | "revenue"
  | "worstPerTrip";

export type MarginalProfitFields = {
  /** 月次共通経費（稼働台数按分） */
  allocatedCommonExpense: number;
  /** 純利益 ＝ 売上 − 高速代 − 人件費 − 傭車費 − 共通経費按分 */
  netProfit: number;
  /** 利益率（純利益 ÷ 売上） */
  profitMargin: number;
  /** 1台あたり純利益（限界利益） */
  netProfitPerTrip: number;
};

function computeMarginalMetrics(
  revenue: number,
  toll: number,
  labor: number,
  partnerFee: number,
  allocatedCommon: number,
  tripCount: number,
): MarginalProfitFields {
  const netProfit =
    revenue - toll - labor - partnerFee - allocatedCommon;
  const profitMargin = revenue > 0 ? netProfit / revenue : 0;
  const netProfitPerTrip =
    tripCount > 0 ? Math.round(netProfit / tripCount) : netProfit;
  return {
    allocatedCommonExpense: allocatedCommon,
    netProfit,
    profitMargin,
    netProfitPerTrip,
  };
}

/** 荷主・業務行に純利益・1台あたり純利益を付与（共通経費は稼働台数按分） */
export function enrichShipperJobMarginalProfit(
  rows: ShipperAnalysisRow[],
  totalCommonExpense: number,
): ShipperAnalysisRow[] {
  type JobRef = { shipperIndex: number; jobIndex: number };

  const jobRefs: JobRef[] = [];
  const weights: number[] = [];

  for (let si = 0; si < rows.length; si++) {
    for (let ji = 0; ji < rows[si]!.jobs.length; ji++) {
      jobRefs.push({ shipperIndex: si, jobIndex: ji });
      weights.push(rows[si]!.jobs[ji]!.tripCount);
    }
  }

  const jobCommonAlloc =
    totalCommonExpense > 0 && jobRefs.length > 0
      ? allocateExpenseByWeights(weights, totalCommonExpense).allocated
      : jobRefs.map(() => 0);

  const jobAllocByKey = new Map<string, number>();
  jobRefs.forEach((ref, index) => {
    const shipper = rows[ref.shipperIndex]!;
    const job = shipper.jobs[ref.jobIndex]!;
    jobAllocByKey.set(`${shipper.shipperName}::${job.jobName}`, jobCommonAlloc[index]!);
  });

  return rows.map((shipper) => {
    const enrichedJobs: JobAnalysisRow[] = shipper.jobs.map((job) => {
      const common = jobAllocByKey.get(`${shipper.shipperName}::${job.jobName}`) ?? 0;
      return {
        ...job,
        ...computeMarginalMetrics(
          job.totalRevenue,
          job.totalToll,
          job.totalLabor,
          job.totalPartnerFee,
          common,
          job.tripCount,
        ),
      };
    });

    const shipperCommon = enrichedJobs.reduce(
      (sum, job) => sum + job.allocatedCommonExpense,
      0,
    );

    return {
      ...shipper,
      jobs: enrichedJobs,
      ...computeMarginalMetrics(
        shipper.totalRevenue,
        shipper.totalToll,
        shipper.totalLabor,
        shipper.totalPartnerFee,
        shipperCommon,
        shipper.tripCount,
      ),
    };
  });
}

export function isMarginalProfitWarning(
  row: MarginalProfitFields,
  targetMargin = TARGET_NET_PROFIT_MARGIN,
): boolean {
  return row.netProfit < 0 || row.profitMargin < targetMargin;
}

export function sortShipperAnalysisRows(
  rows: ShipperAnalysisRow[],
  mode: ShipperJobSortMode,
): ShipperAnalysisRow[] {
  const copy = rows.map((shipper) => ({
    ...shipper,
    jobs: [...shipper.jobs],
  }));

  if (mode === "shipperName") {
    return copy.sort((a, b) =>
      a.shipperName.localeCompare(b.shipperName, "ja"),
    );
  }

  if (mode === "revenue") {
    return copy.sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  // worstPerTrip: 1台あたり純利益が低い順（荷主・業務とも）
  for (const shipper of copy) {
    shipper.jobs.sort((a, b) => a.netProfitPerTrip - b.netProfitPerTrip);
  }
  return copy.sort((a, b) => a.netProfitPerTrip - b.netProfitPerTrip);
}

/** 展開中荷主のワースト業務（1台あたり純利益最小） */
export function worstJobInShipper(
  shipper: ShipperAnalysisRow,
): JobAnalysisRow | null {
  if (shipper.jobs.length === 0) return null;
  return shipper.jobs.reduce((worst, job) =>
    job.netProfitPerTrip < worst.netProfitPerTrip ? job : worst,
  );
}
