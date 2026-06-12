"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { BackupControls } from "@/components/backup-controls";
import { formatYen } from "@/lib/currency-format";
import { DriverDetailView } from "@/components/driver-detail-view";
import { ShipperExpensePopover } from "@/components/shipper-expense-popover";
import { ShipperPerformanceView } from "@/components/shipper-performance-view";
import { VehicleCostDrilldown } from "@/components/vehicle-cost-drilldown";
import { StackedCostChart } from "@/components/stacked-cost-chart";
import {
  MonthlyTrendComboChart,
  SummaryBarChart,
} from "@/components/summary-chart";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  exportDailyRecordsCsv,
  exportFullMonthlyPack,
  exportMonthlySummaryCsv,
  exportPartnerSummaryCsv,
  exportShipperProfitCsv,
} from "@/lib/csv";
import {
  buildShipperJobAnalysis,
  buildVehicleCostBreakdown,
  toStackedCostChartData,
} from "@/lib/dashboard-analytics";
import { sumAllocationExpenses } from "@/lib/allocation-expense-utils";
import {
  buildMonthlyFinancialSnapshot,
  buildMonthlyTrendSnapshots,
  fuelByVehicleFromAllocation,
} from "@/lib/monthly-overview-metrics";
import {
  allocateShipperNetProfit,
  buildMonthlySummary,
  type ShipperProfitRow,
} from "@/lib/monthly-aggregate";
import { buildShipperExpenseBreakdown } from "@/lib/shipper-expense-breakdown";
import { useSelectedDate } from "@/contexts/selected-date-context";
import {
  aggregateFuelByVehicle,
  aggregateMaintenanceByVehicle,
  aggregateTollByVehicle,
  totalMaintenanceForMonth,
  totalTollExpenseForMonth,
} from "@/lib/vehicle-maintenance-cost";
import type { DailyRecord, MasterData, VehicleExpenseRecord } from "@/lib/types";

type AnalyticsTab = "overview" | "driver" | "shipper" | "vehicle";

type MonthlySummaryProps = {
  records: DailyRecord[];
  masters: MasterData;
  vehicleExpenses: VehicleExpenseRecord[];
  onRestore: (records: DailyRecord[], masters: MasterData) => void;
  onRecordsChange?: (records: DailyRecord[]) => void;
};


function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function MonthlySummary({
  records,
  masters,
  vehicleExpenses,
  onRestore,
  onRecordsChange,
}: MonthlySummaryProps) {
  const { selectedYearMonth: yearMonth, setSelectedYearMonth: setYearMonth } =
    useSelectedDate();
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("overview");

  const summary = useMemo(
    () => buildMonthlySummary(records, yearMonth, masters),
    [records, yearMonth, masters],
  );

  const totalAllocationExpense = useMemo(
    () => sumAllocationExpenses(masters),
    [masters],
  );

  const financialSnapshot = useMemo(
    () =>
      buildMonthlyFinancialSnapshot(
        records,
        yearMonth,
        masters,
        vehicleExpenses,
      ),
    [records, yearMonth, masters, vehicleExpenses],
  );

  const trendSnapshots = useMemo(
    () =>
      buildMonthlyTrendSnapshots(
        records,
        yearMonth,
        masters,
        vehicleExpenses,
        6,
      ),
    [records, yearMonth, masters, vehicleExpenses],
  );

  const maintenanceByVehicle = useMemo(
    () =>
      aggregateMaintenanceByVehicle(
        vehicleExpenses,
        yearMonth,
        summary.vehicles.map((v) => v.vehicleNumber),
      ),
    [vehicleExpenses, yearMonth, summary.vehicles],
  );

  const monthMaintenanceTotal = useMemo(
    () => totalMaintenanceForMonth(vehicleExpenses, yearMonth),
    [vehicleExpenses, yearMonth],
  );

  const shipperProfits = useMemo(() => {
    if (totalAllocationExpense <= 0) return null;
    return allocateShipperNetProfit(summary.shippers, totalAllocationExpense);
  }, [totalAllocationExpense, summary.shippers]);

  const vehicleKeys = useMemo(
    () => summary.vehicles.map((v) => v.vehicleNumber),
    [summary.vehicles],
  );

  const importedFuelByVehicle = useMemo(
    () => aggregateFuelByVehicle(vehicleExpenses, yearMonth, vehicleKeys),
    [vehicleExpenses, yearMonth, vehicleKeys],
  );

  const importedTollByVehicle = useMemo(
    () => aggregateTollByVehicle(vehicleExpenses, yearMonth, vehicleKeys),
    [vehicleExpenses, yearMonth, vehicleKeys],
  );

  const monthTollImportTotal = useMemo(
    () => totalTollExpenseForMonth(vehicleExpenses, yearMonth),
    [vehicleExpenses, yearMonth],
  );

  const hasImportedFuel = useMemo(
    () => [...importedFuelByVehicle.values()].some((v) => v > 0),
    [importedFuelByVehicle],
  );

  const fuelByVehicle = useMemo(
    () =>
      fuelByVehicleFromAllocation(
        records,
        yearMonth,
        masters,
        vehicleExpenses,
      ),
    [records, yearMonth, masters, vehicleExpenses],
  );

  const maintenanceByShipper = useMemo(() => {
    const map = new Map<string, number>();
    const totalRev = summary.shippers.reduce((s, r) => s + r.totalRevenue, 0);
    if (totalRev <= 0 || monthMaintenanceTotal <= 0) return map;
    for (const shipper of summary.shippers) {
      const share = Math.round(
        monthMaintenanceTotal * (shipper.totalRevenue / totalRev),
      );
      if (share > 0) map.set(shipper.shipperName, share);
    }
    return map;
  }, [summary.shippers, monthMaintenanceTotal]);

  function buildProfitExpenseBreakdown(row: ShipperProfitRow) {
    return buildShipperExpenseBreakdown({
      labor: row.totalLabor,
      fuel: row.allocatedExpense,
      toll: row.totalToll,
      partner: row.totalPartnerFee,
      other: maintenanceByShipper.get(row.shipperName) ?? 0,
    });
  }

  const vehicleCostRows = useMemo(
    () =>
      buildVehicleCostBreakdown(
        records,
        yearMonth,
        masters,
        maintenanceByVehicle,
        fuelByVehicle,
        importedTollByVehicle,
      ),
    [
      records,
      yearMonth,
      masters,
      maintenanceByVehicle,
      fuelByVehicle,
      importedTollByVehicle,
    ],
  );

  const stackedChartData = useMemo(
    () => toStackedCostChartData(vehicleCostRows),
    [vehicleCostRows],
  );

  const shipperPerformanceRows = useMemo(
    () => buildShipperJobAnalysis(records, yearMonth, masters),
    [records, yearMonth, masters],
  );

  return (
    <div className="space-y-6">
      <BackupControls
        records={records}
        masters={masters}
        onRestore={onRestore}
      />

      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
        <div className="space-y-2">
          <Label htmlFor="summary-month">対象月</Label>
          <Input
            id="summary-month"
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="w-[180px]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportDailyRecordsCsv(records, yearMonth, masters)}
          >
            <Download className="size-4" />
            運行実績CSV（当月）
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportMonthlySummaryCsv(summary)}
          >
            <Download className="size-4" />
            月次集計CSV
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => exportFullMonthlyPack(records, yearMonth, masters)}
          >
            <Download className="size-4" />
            一括ダウンロード
          </Button>
        </div>
      </div>

      <Tabs
        value={analyticsTab}
        onValueChange={(v) => setAnalyticsTab(v as AnalyticsTab)}
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="overview">月次集計（全体）</TabsTrigger>
          <TabsTrigger value="driver">ドライバー別実績</TabsTrigger>
          <TabsTrigger value="shipper">荷主別実績</TabsTrigger>
          <TabsTrigger value="vehicle">車両別実績</TabsTrigger>
        </TabsList>
      </Tabs>

      {analyticsTab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>月間総売上</CardDescription>
                <CardTitle className="text-2xl">
                  {formatYen(financialSnapshot.totalRevenue)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-sky-200 bg-sky-50/40">
              <CardHeader className="pb-2">
                <CardDescription>1日1台あたりの平均売上</CardDescription>
                <CardTitle className="text-2xl text-sky-900">
                  {financialSnapshot.totalVehicleDays > 0
                    ? formatYen(financialSnapshot.avgRevenuePerVehicleDay)
                    : "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-violet-200 bg-violet-50/40">
              <CardHeader className="pb-2">
                <CardDescription>労働分配率（人件費÷粗利益）</CardDescription>
                <CardTitle className="text-2xl text-violet-900">
                  {financialSnapshot.laborDistributionRate != null
                    ? formatPct(financialSnapshot.laborDistributionRate)
                    : "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card
              className={
                financialSnapshot.netProfit >= 0
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-red-200 bg-red-50/40"
              }
            >
              <CardHeader className="pb-2">
                <CardDescription>純利益（按分費込み）</CardDescription>
                <CardTitle
                  className={`text-2xl ${
                    financialSnapshot.netProfit >= 0
                      ? "text-emerald-800"
                      : "text-red-700"
                  }`}
                >
                  {formatYen(financialSnapshot.netProfit)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>月間総走行</CardDescription>
                <CardTitle className="text-2xl">
                  {summary.totalKm.toLocaleString()} km
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>総稼働台数（車両×日）</CardDescription>
                <CardTitle className="text-2xl">
                  {financialSnapshot.totalVehicleDays} 台日
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>按分経費合計（マスタ登録）</CardDescription>
                <CardTitle className="text-2xl">
                  {formatYen(financialSnapshot.allocationExpense)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>稼働荷主数</CardDescription>
                <CardTitle className="text-2xl">
                  {summary.shippers.length} 社
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-orange-200 bg-orange-50/40">
              <CardHeader className="pb-2">
                <CardDescription>月間修繕コスト</CardDescription>
                <CardTitle className="text-2xl text-orange-800">
                  {formatYen(financialSnapshot.totalMaintenance)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="pb-2">
                <CardDescription>
                  月間燃料代
                  {hasImportedFuel ? "（インポート）" : ""}
                </CardDescription>
                <CardTitle className="text-2xl text-amber-900">
                  {formatYen(financialSnapshot.totalFuel)}
                </CardTitle>
              </CardHeader>
            </Card>
            {monthTollImportTotal > 0 && (
              <Card className="border-teal-200 bg-teal-50/40">
                <CardHeader className="pb-2">
                  <CardDescription>月間高速代（インポート）</CardDescription>
                  <CardTitle className="text-2xl text-teal-900">
                    {formatYen(monthTollImportTotal)}
                  </CardTitle>
                </CardHeader>
              </Card>
            )}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>日次記録件数</CardDescription>
                <CardTitle className="text-2xl">{summary.recordCount} 件</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">月別推移（売上・総経費・純利益）</CardTitle>
              <CardDescription>
                過去6ヶ月の経営推移。総経費にはマスタの按分費・人件費・燃料・修繕等を含みます。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyTrendComboChart snapshots={trendSnapshots} />
            </CardContent>
          </Card>
        </div>
      )}

      {analyticsTab === "vehicle" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">車両別 経費内訳（積層）</CardTitle>
              <CardDescription>
                純利益 ＝ 売上 −（人件費 ＋ 燃料代 ＋ 高速代 ＋ 修繕費）— 上位8台
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StackedCostChart data={stackedChartData} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">車両別 コスト明細</CardTitle>
              <CardDescription>
                修繕費・燃料代・高速代は車両経費管理のインポートから自動連動
                {hasImportedFuel ? "" : "（燃料代未登録時はマスタ登録の按分費を車両稼働日数で配分）"}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {onRecordsChange ? (
                <VehicleCostDrilldown
                  rows={vehicleCostRows}
                  records={records}
                  yearMonth={yearMonth}
                  vehicles={masters.vehicles}
                  onRecordsChange={onRecordsChange}
                />
              ) : (
                <SummaryTable
                  headers={[
                    "車両",
                    "売上",
                    "人件費",
                    "燃料代",
                    "高速代",
                    "修繕費",
                    "純利益",
                    "走行km",
                  ]}
                  rows={vehicleCostRows.map((v) => [
                    v.vehicleNumber,
                    formatYen(v.totalRevenue),
                    formatYen(v.laborCost, { zeroAsDash: true }),
                    formatYen(v.fuelCost, { zeroAsDash: true }),
                    formatYen(v.tollCost, { zeroAsDash: true }),
                    formatYen(v.maintenanceCost, { zeroAsDash: true }),
                    formatYen(v.netProfit),
                    v.totalKm.toLocaleString(),
                  ])}
                  emptyMessage="この月の車両データはありません"
                  profitColumn={6}
                  profitValues={vehicleCostRows.map((v) => v.netProfit)}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {analyticsTab === "shipper" && (
        <ShipperPerformanceView
          rows={shipperPerformanceRows}
          yearMonth={yearMonth}
        />
      )}

      {analyticsTab === "driver" && (
        <DriverDetailView
          records={records}
          onRecordsChange={onRecordsChange}
          embedded
        />
      )}

      {analyticsTab === "overview" && summary.partners.length > 0 && (
        <Card className="border-blue-600/30">
          <CardHeader>
            <CardTitle className="text-lg">協力会社（傭車先）別集計</CardTitle>
            <CardDescription>
              粗利益 ＝ 売上 − 傭車料金（支払運賃）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SummaryBarChart
              data={summary.partners.slice(0, 8).map((p) => ({
                name: p.partnerName,
                value: p.grossProfit,
              }))}
              valueLabel="粗利益"
              color="hsl(221 83% 53%)"
            />
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>協力会社</TableHead>
                    <TableHead className="text-right">運行回数</TableHead>
                    <TableHead className="text-right">総売上</TableHead>
                    <TableHead className="text-right">総傭車料</TableHead>
                    <TableHead className="text-right font-semibold">
                      粗利益
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.partners.map((row) => (
                    <TableRow key={row.partnerName}>
                      <TableCell className="font-medium">
                        {row.partnerName}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.tripCount} 回
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(row.totalRevenue)}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatYen(row.totalPartnerFee)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          row.grossProfit >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatYen(row.grossProfit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportPartnerSummaryCsv(summary)}
            >
              <Download className="size-4" />
              協力会社別CSV
            </Button>
          </CardContent>
        </Card>
      )}

      {analyticsTab === "overview" && shipperProfits && (
        <Card className="border-emerald-600/30">
          <CardHeader>
            <CardTitle className="text-lg">荷主別「真の粗利益」</CardTitle>
            <CardDescription>
              差引粗利益 ＝ 総売上 − 総高速代 − 総人件費 − 総傭車料 − 按分経費（マスタ登録の合計{" "}
              {formatYen(totalAllocationExpense)} を荷主の売上比率で按分）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>荷主名</TableHead>
                    <TableHead className="text-right">運行回数</TableHead>
                    <TableHead className="text-right">売上比率</TableHead>
                    <TableHead className="text-right">総売上</TableHead>
                    <TableHead className="text-right">経費 (円)</TableHead>
                    <TableHead className="text-right">総高速代</TableHead>
                    <TableHead className="text-right">総人件費</TableHead>
                    <TableHead className="text-right">総傭車料</TableHead>
                    <TableHead className="text-right">按分燃料代</TableHead>
                    <TableHead className="text-right font-semibold">
                      差引粗利益
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipperProfits.map((row) => {
                    const expenseBreakdown = buildProfitExpenseBreakdown(row);
                    return (
                    <TableRow key={row.shipperName}>
                      <TableCell className="font-medium">
                        {row.shipperName}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.tripCount} 回
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPct(row.revenueRatio)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(row.totalRevenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ShipperExpensePopover
                          amount={expenseBreakdown.total}
                          shipperName={row.shipperName}
                          yearMonth={yearMonth}
                          breakdown={expenseBreakdown}
                        />
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatYen(row.totalToll)}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatYen(row.totalLabor)}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatYen(row.totalPartnerFee)}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatYen(row.allocatedExpense)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          row.netGrossProfit >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatYen(row.netGrossProfit)}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>合計</TableCell>
                    <TableCell className="text-right">
                      {shipperProfits.reduce((s, r) => s + r.tripCount, 0)} 回
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right">
                      {formatYen(
                        shipperProfits.reduce((s, r) => s + r.totalRevenue, 0),
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatYen(
                        shipperProfits.reduce(
                          (s, r) => s + buildProfitExpenseBreakdown(r).total,
                          0,
                        ),
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatYen(
                        shipperProfits.reduce((s, r) => s + r.totalToll, 0),
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatYen(
                        shipperProfits.reduce((s, r) => s + r.totalLabor, 0),
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatYen(
                        shipperProfits.reduce(
                          (s, r) => s + r.totalPartnerFee,
                          0,
                        ),
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatYen(
                        shipperProfits.reduce(
                          (s, r) => s + r.allocatedExpense,
                          0,
                        ),
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatYen(
                        shipperProfits.reduce(
                          (s, r) => s + r.netGrossProfit,
                          0,
                        ),
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                exportShipperProfitCsv(
                  yearMonth,
                  "按分費合計",
                  totalAllocationExpense,
                  shipperProfits,
                )
              }
            >
              <Download className="size-4" />
              荷主別粗利益CSV
            </Button>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

function SummaryTable({
  headers,
  rows,
  emptyMessage,
  profitColumn,
  profitValues,
}: {
  headers: string[];
  rows: string[][];
  emptyMessage: string;
  profitColumn?: number;
  profitValues?: number[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((cell, j) => {
              const isProfit =
                profitColumn !== undefined && j === profitColumn;
              const num = isProfit ? (profitValues?.[i] ?? 0) : 0;
              return (
                <TableCell
                  key={j}
                  className={
                    j > 0
                      ? `text-right tabular-nums${
                          isProfit
                            ? num >= 0
                              ? " font-semibold text-emerald-600"
                              : " font-semibold text-red-600"
                            : ""
                        }`
                      : "font-medium"
                  }
                >
                  {cell}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
