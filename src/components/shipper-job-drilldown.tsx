"use client";

import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { ShipperJobTripDrilldown } from "@/components/analytics-trip-edit-panel";
import { ShipperExpensePopover } from "@/components/shipper-expense-popover";
import { formatYen } from "@/lib/currency-format";
import type { JobAnalysisRow, ShipperAnalysisRow } from "@/lib/dashboard-analytics";
import { buildShipperExpenseBreakdown } from "@/lib/shipper-expense-breakdown";
import {
  isMarginalProfitWarning,
  sortShipperAnalysisRows,
  TARGET_NET_PROFIT_MARGIN,
  worstJobInShipper,
  type ShipperJobSortMode,
} from "@/lib/shipper-marginal-profit";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DailyRecord, MasterData } from "@/lib/types";

function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatPerHour(yen: number): string {
  if (yen <= 0) return "—";
  return `${formatYen(Math.round(yen))}/h`;
}

function profitClass(value: number): string {
  return value >= 0 ? "text-emerald-600" : "text-red-600";
}

function metricOrZero(value: number | undefined): number {
  return value ?? 0;
}

function shipperMaintenanceShare(
  shipperName: string,
  maintenanceByShipper?: Map<string, number>,
): number {
  return maintenanceByShipper?.get(shipperName) ?? 0;
}

function jobMaintenanceShare(
  job: JobAnalysisRow,
  shipper: ShipperAnalysisRow,
  maintenanceByShipper?: Map<string, number>,
): number {
  const shipperMaint = shipperMaintenanceShare(
    shipper.shipperName,
    maintenanceByShipper,
  );
  if (shipperMaint <= 0 || shipper.totalRevenue <= 0) return 0;
  return Math.round(shipperMaint * (job.totalRevenue / shipper.totalRevenue));
}

function buildShipperBreakdown(
  shipper: ShipperAnalysisRow,
  maintenanceByShipper?: Map<string, number>,
) {
  return buildShipperExpenseBreakdown({
    labor: shipper.totalLabor,
    fuel:
      (shipper.allocatedCommonExpense ?? 0) > 0
        ? shipper.allocatedCommonExpense!
        : shipper.allocatedFuel,
    toll: shipper.totalToll,
    partner: shipper.totalPartnerFee,
    other: shipperMaintenanceShare(shipper.shipperName, maintenanceByShipper),
  });
}

function buildJobBreakdown(
  job: JobAnalysisRow,
  shipper: ShipperAnalysisRow,
  maintenanceByShipper?: Map<string, number>,
) {
  return buildShipperExpenseBreakdown({
    labor: job.totalLabor,
    fuel:
      (job.allocatedCommonExpense ?? 0) > 0
        ? job.allocatedCommonExpense!
        : job.allocatedFuel,
    toll: job.totalToll,
    partner: job.totalPartnerFee,
    other: jobMaintenanceShare(job, shipper, maintenanceByShipper),
  });
}

function jobKey(shipperName: string, jobName: string): string {
  return `${shipperName}::${jobName}`;
}

function MarginalWarningBadge({ row }: { row: JobAnalysisRow | ShipperAnalysisRow }) {
  if (
    row.netProfit === undefined ||
    row.profitMargin === undefined ||
    !isMarginalProfitWarning(row)
  ) {
    return null;
  }
  const label =
    row.netProfit < 0
      ? "赤字"
      : `利益率${formatPct(row.profitMargin)}`;
  return (
    <Badge
      variant="outline"
      className="ml-1.5 border-red-300 bg-red-50 text-[10px] text-red-700"
    >
      <AlertTriangle className="mr-0.5 size-3" />
      {label}
    </Badge>
  );
}

function marginalCellClass(row: JobAnalysisRow | ShipperAnalysisRow): string {
  if (
    row.netProfit !== undefined &&
    row.profitMargin !== undefined &&
    isMarginalProfitWarning(row)
  ) {
    return "bg-red-50/80 text-red-700";
  }
  return "";
}

type ShipperJobDrilldownProps = {
  rows: ShipperAnalysisRow[];
  yearMonth: string;
  records: DailyRecord[];
  vehicles: string[];
  masters: MasterData;
  onRecordsChange: (records: DailyRecord[]) => void;
  maintenanceByShipper?: Map<string, number>;
  commonExpenseApplied?: boolean;
};

export function ShipperJobDrilldown({
  rows,
  yearMonth,
  records,
  vehicles,
  masters,
  onRecordsChange,
  maintenanceByShipper,
  commonExpenseApplied = false,
}: ShipperJobDrilldownProps) {
  const [sortMode, setSortMode] = useState<ShipperJobSortMode>("shipperName");
  const [expandedShippers, setExpandedShippers] = useState<Set<string>>(
    new Set(),
  );
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const sortedRows = useMemo(
    () => sortShipperAnalysisRows(rows, sortMode),
    [rows, sortMode],
  );

  const toggleShipper = (shipperName: string) => {
    setExpandedShippers((prev) => {
      const next = new Set(prev);
      if (next.has(shipperName)) {
        next.delete(shipperName);
        setExpandedJob((job) =>
          job?.startsWith(`${shipperName}::`) ? null : job,
        );
      } else {
        next.add(shipperName);
      }
      return next;
    });
  };

  const toggleJob = (shipperName: string, jobName: string) => {
    const key = jobKey(shipperName, jobName);
    setExpandedJob((prev) => (prev === key ? null : key));
    setExpandedShippers((prev) => {
      const next = new Set(prev);
      next.add(shipperName);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        この月の荷主データはありません
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
        <div className="space-y-1">
          <Label htmlFor="shipper-sort" className="text-xs text-muted-foreground">
            表示順
          </Label>
          <Select
            value={sortMode}
            onValueChange={(v) => setSortMode(v as ShipperJobSortMode)}
          >
            <SelectTrigger id="shipper-sort" className="w-[260px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shipperName">荷主名順（デフォルト）</SelectItem>
              <SelectItem value="revenue">総売上高い順</SelectItem>
              <SelectItem value="worstPerTrip">
                1台あたり純利益ワースト順（赤字順）
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          目標利益率 {formatPct(TARGET_NET_PROFIT_MARGIN)} 未満・赤字は赤で強調
          {commonExpenseApplied ? "" : "（共通経費未按分時は人件費・高速代のみ控除）"}
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>荷主 / 業務（運行便）</TableHead>
              <TableHead className="text-right">売上</TableHead>
              <TableHead className="text-right">経費 (円)</TableHead>
              <TableHead className="text-right">純利益</TableHead>
              <TableHead className="text-right">利益率</TableHead>
              <TableHead className="text-right">1台あたり純利益</TableHead>
              <TableHead className="text-right">稼働台数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((shipper) => {
              const shipperOpen = expandedShippers.has(shipper.shipperName);
              const shipperBreakdown = buildShipperBreakdown(
                shipper,
                maintenanceByShipper,
              );
              const worstJob = worstJobInShipper(shipper);
              const bestJob = shipper.jobs.reduce<JobAnalysisRow | null>(
                (best, job) =>
                  !best ||
                  (job.netProfitPerTrip ?? 0) > (best.netProfitPerTrip ?? 0)
                    ? job
                    : best,
                null,
              );

              return (
                <Fragment key={shipper.shipperName}>
                  <TableRow
                    className={cn(
                      "cursor-pointer bg-muted/30 hover:bg-slate-50",
                      marginalCellClass(shipper),
                    )}
                    onClick={() => toggleShipper(shipper.shipperName)}
                  >
                    <TableCell className="w-8 px-2">
                      {shipperOpen ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {shipper.shipperName}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {shipper.jobs.length} 業務
                      </span>
                      <MarginalWarningBadge row={shipper} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatYen(shipper.totalRevenue)}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ShipperExpensePopover
                        amount={shipperBreakdown.total}
                        shipperName={shipper.shipperName}
                        yearMonth={yearMonth}
                        breakdown={shipperBreakdown}
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        profitClass(metricOrZero(shipper.netProfit)),
                      )}
                    >
                      {formatYen(metricOrZero(shipper.netProfit))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPct(metricOrZero(shipper.profitMargin))}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        profitClass(metricOrZero(shipper.netProfitPerTrip)),
                      )}
                    >
                      {formatYen(metricOrZero(shipper.netProfitPerTrip))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {shipper.tripCount} 台
                    </TableCell>
                  </TableRow>

                  {shipperOpen && (worstJob || bestJob) && (
                    <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                      <TableCell colSpan={8} className="py-2 text-xs">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 pl-10 text-muted-foreground">
                          {bestJob &&
                            (bestJob.netProfitPerTrip ?? 0) > 0 && (
                            <span>
                              <span className="font-medium text-emerald-700">
                                収益エンジン
                              </span>
                              ：{bestJob.jobName}（1台{" "}
                              {formatYen(
                                metricOrZero(bestJob.netProfitPerTrip),
                              )}{" "}
                              / 利益率{" "}
                              {formatPct(metricOrZero(bestJob.profitMargin))}）
                            </span>
                          )}
                          {worstJob && (
                            <span>
                              <span className="font-medium text-red-700">
                                要改善
                              </span>
                              ：{worstJob.jobName}（1台{" "}
                              {formatYen(
                                metricOrZero(worstJob.netProfitPerTrip),
                              )}{" "}
                              / 利益率{" "}
                              {formatPct(metricOrZero(worstJob.profitMargin))}）
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                  {shipperOpen &&
                    shipper.jobs.map((job) => {
                      const key = jobKey(shipper.shipperName, job.jobName);
                      const jobOpen = expandedJob === key;
                      const jobBreakdown = buildJobBreakdown(
                        job,
                        shipper,
                        maintenanceByShipper,
                      );
                      return (
                        <Fragment key={key}>
                          <TableRow
                            className={cn(
                              "cursor-pointer bg-background hover:bg-slate-50",
                              jobOpen && "bg-slate-50/60",
                              marginalCellClass(job),
                            )}
                            onClick={() =>
                              toggleJob(shipper.shipperName, job.jobName)
                            }
                          >
                            <TableCell className="w-8 px-2">
                              {jobOpen ? (
                                <ChevronDown className="size-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="size-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="pl-8 text-sm">
                              <span className="text-muted-foreground">└ </span>
                              {job.jobName}
                              {job.tripCount > 1 && (
                                <span className="ml-1.5 text-[11px] text-muted-foreground">
                                  （{job.tripCount}台合算）
                                </span>
                              )}
                              <MarginalWarningBadge row={job} />
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {formatYen(job.totalRevenue)}
                            </TableCell>
                            <TableCell
                              className="text-right text-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ShipperExpensePopover
                                amount={jobBreakdown.total}
                                shipperName={shipper.shipperName}
                                yearMonth={yearMonth}
                                jobName={job.jobName}
                                breakdown={jobBreakdown}
                              />
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-sm font-medium tabular-nums",
                                profitClass(metricOrZero(job.netProfit)),
                              )}
                            >
                              {formatYen(metricOrZero(job.netProfit))}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {formatPct(metricOrZero(job.profitMargin))}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-sm font-semibold tabular-nums",
                                profitClass(metricOrZero(job.netProfitPerTrip)),
                              )}
                            >
                              {formatYen(metricOrZero(job.netProfitPerTrip))}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {job.tripCount} 台
                            </TableCell>
                          </TableRow>
                          {jobOpen && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={8} className="p-0">
                                <ShipperJobTripDrilldown
                                  shipperName={shipper.shipperName}
                                  jobName={job.jobName}
                                  records={records}
                                  yearMonth={yearMonth}
                                  vehicles={vehicles}
                                  masters={masters}
                                  onRecordsChange={onRecordsChange}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
