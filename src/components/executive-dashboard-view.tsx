"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpAZ,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatYen } from "@/lib/currency-format";
import { formatRestraintDuration } from "@/lib/driver-monthly-detail";
import {
  buildExecutiveDashboard,
  type ExecutiveDashboardData,
} from "@/lib/analytics/dashboard-summary";
import type { ShipperProfitSortMode } from "@/lib/analytics/shipper-profit";
import type { VehicleProfitSortMode } from "@/lib/analytics/vehicle-profit";
import { formatYearMonthLabel } from "@/lib/shipper-expense-breakdown";
import { useSelectedDate } from "@/contexts/selected-date-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DailyRecord, MasterData, VehicleExpenseRecord } from "@/lib/types";

type ExecutiveDashboardViewProps = {
  records: DailyRecord[];
  masters: MasterData;
  vehicleExpenses: VehicleExpenseRecord[];
};

function formatPct(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "profit" | "expense" | "neutral";
}) {
  const accentClass =
    accent === "profit"
      ? "border-emerald-200 bg-emerald-50/50"
      : accent === "expense"
        ? "border-amber-200 bg-amber-50/40"
        : "";

  return (
    <Card className={accentClass}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardHeader>
    </Card>
  );
}

function NeedsImprovementReasons({
  reasons,
}: {
  reasons: ExecutiveDashboardData["needsImprovementShippers"][number]["reasons"];
}) {
  const labels = reasons.map((r) =>
    r === "lowMargin" ? "利益率10%未満" : "平均拘束12h超",
  );
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
        >
          {label}
        </span>
      ))}
    </span>
  );
}

export function ExecutiveDashboardView({
  records,
  masters,
  vehicleExpenses,
}: ExecutiveDashboardViewProps) {
  const { selectedYearMonth: yearMonth, setSelectedYearMonth: setYearMonth } =
    useSelectedDate();
  const [shipperSort, setShipperSort] = useState<ShipperProfitSortMode>("best");
  const [vehicleSort, setVehicleSort] = useState<VehicleProfitSortMode>("best");

  const dashboard = useMemo(
    () =>
      buildExecutiveDashboard({
        records,
        yearMonth,
        masters,
        vehicleExpenses,
        shipperSort,
        vehicleSort,
      }),
    [records, yearMonth, masters, vehicleExpenses, shipperSort, vehicleSort],
  );

  const { kpis } = dashboard;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
        <div className="space-y-2">
          <Label htmlFor="dashboard-month">対象月</Label>
          <Input
            id="dashboard-month"
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="w-[180px]"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {formatYearMonthLabel(yearMonth)}の経営サマリー
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="今月売上" value={formatYen(kpis.monthlyRevenue)} />
        <KpiCard
          label="今月総経費"
          value={formatYen(kpis.monthlyCoreExpenses)}
          sub={`人件費 ${formatYen(kpis.expenseBreakdown.labor)} / 燃料 ${formatYen(kpis.expenseBreakdown.fuel)} / 高速 ${formatYen(kpis.expenseBreakdown.toll)} / 修繕 ${formatYen(kpis.expenseBreakdown.maintenance)}`}
          accent="expense"
        />
        <KpiCard
          label="今月純利益"
          value={formatYen(kpis.monthlyNetProfit)}
          accent={kpis.monthlyNetProfit >= 0 ? "profit" : undefined}
        />
        <KpiCard
          label="粗利率"
          value={formatPct(kpis.grossMargin)}
        />
        <KpiCard
          label="稼働ドライバー数"
          value={`${kpis.activeDriverCount}名`}
        />
        <KpiCard
          label="稼働車両数"
          value={`${kpis.activeVehicleCount}台`}
        />
      </div>

      {dashboard.needsImprovementShippers.length > 0 && (
        <Card className="border-red-300 bg-red-50/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-900">
              <AlertTriangle className="size-5" />
              要改善荷主一覧
            </CardTitle>
            <CardDescription className="text-red-800/80">
              利益率10%未満、または平均拘束時間12時間超の荷主を自動検出しています。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>荷主名</TableHead>
                  <TableHead className="text-right">売上</TableHead>
                  <TableHead className="text-right">利益率</TableHead>
                  <TableHead className="text-right">平均拘束</TableHead>
                  <TableHead>判定理由</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.needsImprovementShippers.map((row) => (
                  <TableRow key={row.shipperName} className="text-red-900">
                    <TableCell>{row.rank}</TableCell>
                    <TableCell className="font-medium">
                      {row.shipperName}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatYen(row.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatPct(row.profitMargin)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatHours(row.averageRestraintHours)}
                    </TableCell>
                    <TableCell>
                      <NeedsImprovementReasons reasons={row.reasons} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>荷主別利益ランキング</CardTitle>
              <CardDescription>利益率順。ワースト表示も可能です。</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1"
              onClick={() =>
                setShipperSort((s) => (s === "best" ? "worst" : "best"))
              }
            >
              {shipperSort === "best" ? (
                <>
                  <ArrowDownAZ className="size-4" />
                  ワースト順
                </>
              ) : (
                <>
                  <TrendingUp className="size-4" />
                  ベスト順
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">順位</TableHead>
                  <TableHead>荷主名</TableHead>
                  <TableHead className="text-right">売上</TableHead>
                  <TableHead className="text-right">経費</TableHead>
                  <TableHead className="text-right">純利益</TableHead>
                  <TableHead className="text-right">利益率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.shipperRankings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      対象月の荷主データがありません。
                    </TableCell>
                  </TableRow>
                ) : (
                  dashboard.shipperRankings.map((row) => (
                    <TableRow key={row.shipperName}>
                      <TableCell>{row.rank}</TableCell>
                      <TableCell className="font-medium">
                        {row.shipperName}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(row.totalRevenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(row.totalExpense)}
                      </TableCell>
                      <TableCell
                        className={`text-right ${row.netProfit < 0 ? "text-red-700" : ""}`}
                      >
                        {formatYen(row.netProfit)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPct(row.profitMargin)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>車両別利益ランキング</CardTitle>
              <CardDescription>
                売上 − 燃料 − 高速 − 修繕。低利益順も表示可能です。
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1"
              onClick={() =>
                setVehicleSort((s) => (s === "best" ? "worst" : "best"))
              }
            >
              {vehicleSort === "best" ? (
                <>
                  <TrendingDown className="size-4" />
                  低利益順
                </>
              ) : (
                <>
                  <ArrowUpAZ className="size-4" />
                  高利益順
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">順位</TableHead>
                  <TableHead>車両</TableHead>
                  <TableHead className="text-right">売上</TableHead>
                  <TableHead className="text-right">燃料費</TableHead>
                  <TableHead className="text-right">高速代</TableHead>
                  <TableHead className="text-right">修繕費</TableHead>
                  <TableHead className="text-right">利益</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.vehicleRankings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      対象月の車両データがありません。
                    </TableCell>
                  </TableRow>
                ) : (
                  dashboard.vehicleRankings.map((row) => (
                    <TableRow key={row.vehicleNumber}>
                      <TableCell>{row.rank}</TableCell>
                      <TableCell className="font-medium">
                        {row.vehicleNumber}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(row.totalRevenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(row.fuelCost)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(row.tollCost)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(row.maintenanceCost)}
                      </TableCell>
                      <TableCell
                        className={`text-right ${row.profit < 0 ? "text-red-700" : ""}`}
                      >
                        {formatYen(row.profit)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ドライバー生産性ランキング</CardTitle>
          <CardDescription>
            売上/拘束時間の降順。利益は売上−人件費−高速代で算出しています。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">順位</TableHead>
                <TableHead>ドライバー</TableHead>
                <TableHead className="text-right">売上</TableHead>
                <TableHead className="text-right">拘束時間</TableHead>
                <TableHead className="text-right">売上/拘束</TableHead>
                <TableHead className="text-right">利益/拘束</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.driverRankings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    対象月のドライバーデータがありません。
                  </TableCell>
                </TableRow>
              ) : (
                dashboard.driverRankings.map((row) => (
                  <TableRow key={row.driverName}>
                    <TableCell>{row.rank}</TableCell>
                    <TableCell className="font-medium">
                      {row.driverName}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatYen(row.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatRestraintDuration(row.totalRestraintMinutes)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatYen(Math.round(row.revenuePerRestraintHour))}/h
                    </TableCell>
                    <TableCell className="text-right">
                      {formatYen(Math.round(row.profitPerRestraintHour))}/h
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
