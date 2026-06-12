"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SummaryBarChart, SummaryPieChart } from "@/components/summary-chart";
import { formatYen } from "@/lib/currency-format";
import type { ShipperAnalysisRow } from "@/lib/dashboard-analytics";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

type ShipperPerformanceViewProps = {
  rows: ShipperAnalysisRow[];
  yearMonth: string;
};

export function ShipperPerformanceView({
  rows,
  yearMonth,
}: ShipperPerformanceViewProps) {
  const [expandedShipper, setExpandedShipper] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<"pie" | "bar">("pie");

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.totalRevenue - a.totalRevenue),
    [rows],
  );

  const totalRevenue = useMemo(
    () => sortedRows.reduce((sum, row) => sum + row.totalRevenue, 0),
    [sortedRows],
  );

  const totalTrips = useMemo(
    () => sortedRows.reduce((sum, row) => sum + row.tripCount, 0),
    [sortedRows],
  );

  const chartData = useMemo(
    () =>
      sortedRows
        .filter((row) => row.totalRevenue > 0)
        .slice(0, 10)
        .map((row) => ({
          name: row.shipperName,
          value: row.totalRevenue,
        })),
    [sortedRows],
  );

  const toggleShipper = (shipperName: string) => {
    setExpandedShipper((prev) => (prev === shipperName ? null : shipperName));
  };

  if (sortedRows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {yearMonth} の荷主別実績データはありません
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>荷主数</CardDescription>
            <CardTitle className="text-2xl">{sortedRows.length} 社</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>月間総売上</CardDescription>
            <CardTitle className="text-2xl">{formatYen(totalRevenue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>運行件数合計</CardDescription>
            <CardTitle className="text-2xl">{totalTrips} 回</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">荷主別 売上構成比</CardTitle>
            <CardDescription>
              売上上位10社の構成（{yearMonth}）
            </CardDescription>
          </div>
          <div className="flex gap-1 rounded-md border p-0.5 text-xs">
            <button
              type="button"
              className={cn(
                "rounded px-2.5 py-1 transition-colors",
                chartMode === "pie"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setChartMode("pie")}
            >
              円グラフ
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-2.5 py-1 transition-colors",
                chartMode === "bar"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setChartMode("bar")}
            >
              横棒
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {chartMode === "pie" ? (
            <SummaryPieChart data={chartData} valueLabel="売上" />
          ) : (
            <SummaryBarChart
              data={chartData}
              valueLabel="売上"
              color="hsl(221 83% 53%)"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">荷主別実績一覧</CardTitle>
          <CardDescription>
            荷主名をクリックすると、業務名ごとの売上内訳を展開できます
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 pb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>荷主名</TableHead>
                <TableHead className="text-right">月間総売上</TableHead>
                <TableHead className="text-right">運行件数</TableHead>
                <TableHead className="text-right">構成比</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => {
                const share =
                  totalRevenue > 0 ? row.totalRevenue / totalRevenue : 0;
                const isExpanded = expandedShipper === row.shipperName;
                const jobs = [...row.jobs].sort(
                  (a, b) => b.totalRevenue - a.totalRevenue,
                );

                return (
                  <Fragment key={row.shipperName}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleShipper(row.shipperName)}
                    >
                      <TableCell className="text-muted-foreground">
                        {isExpanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.shipperName}
                        <Badge variant="secondary" className="ml-2">
                          {jobs.length} 業務
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatYen(row.totalRevenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.tripCount} 回
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPct(share)}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={5} className="p-0">
                          <div className="border-t px-4 py-3">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              {row.shipperName} の業務別内訳
                            </p>
                            {jobs.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                業務データがありません
                              </p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>業務名</TableHead>
                                    <TableHead className="text-right">
                                      売上
                                    </TableHead>
                                    <TableHead className="text-right">
                                      運行件数
                                    </TableHead>
                                    <TableHead className="text-right">
                                      荷主内構成比
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {jobs.map((job) => {
                                    const jobShare =
                                      row.totalRevenue > 0
                                        ? job.totalRevenue / row.totalRevenue
                                        : 0;
                                    return (
                                      <TableRow key={job.jobName}>
                                        <TableCell>{job.jobName}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {formatYen(job.totalRevenue)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {job.tripCount} 回
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {formatPct(jobShare)}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell />
                <TableCell>合計</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatYen(totalRevenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {totalTrips} 回
                </TableCell>
                <TableCell className="text-right">100.0%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
