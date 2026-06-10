"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Download } from "lucide-react";
import { BackupControls } from "@/components/backup-controls";
import { formatYen } from "@/lib/currency-format";
import { DriverProductivityView } from "@/components/driver-productivity-view";
import { ShipperExpensePopover } from "@/components/shipper-expense-popover";
import { ShipperJobDrilldown } from "@/components/shipper-job-drilldown";
import { VehicleCostDrilldown } from "@/components/vehicle-cost-drilldown";
import { StackedCostChart } from "@/components/stacked-cost-chart";
import { SummaryBarChart } from "@/components/summary-chart";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  exportAllocationCsv,
  exportDailyRecordsCsv,
  exportFullMonthlyPack,
  exportMonthlySummaryCsv,
  exportPartnerSummaryCsv,
  exportShipperProfitCsv,
} from "@/lib/csv";
import {
  buildDriverAnalysis,
  buildShipperJobAnalysis,
  buildVehicleCostBreakdown,
  toStackedCostChartData,
} from "@/lib/dashboard-analytics";
import { enrichShipperJobMarginalProfit } from "@/lib/shipper-marginal-profit";
import {
  allocateExpenseByVehicleDays,
  allocateShipperNetProfit,
  buildMonthlySummary,
  enrichAllocationWithMaintenance,
  type ShipperProfitRow,
} from "@/lib/monthly-aggregate";
import { buildShipperExpenseBreakdown } from "@/lib/shipper-expense-breakdown";
import { useSelectedDate } from "@/contexts/selected-date-context";
import {
  aggregateFuelByVehicle,
  aggregateMaintenanceByVehicle,
  aggregateTollByVehicle,
  totalFuelForMonth,
  totalMaintenanceForMonth,
  totalTollExpenseForMonth,
} from "@/lib/vehicle-maintenance-cost";
import { loadVehicleExpenses } from "@/services/firestore-storage";
import type { DailyRecord, MasterData, VehicleExpenseRecord } from "@/lib/types";

type DashboardView = "vehicle" | "shipper" | "driver";

type MonthlySummaryProps = {
  records: DailyRecord[];
  masters: MasterData;
  onRestore: (records: DailyRecord[], masters: MasterData) => void;
  onRecordsChange?: (records: DailyRecord[]) => void;
};


function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function MonthlySummary({
  records,
  masters,
  onRestore,
  onRecordsChange,
}: MonthlySummaryProps) {
  const { selectedYearMonth: yearMonth, setSelectedYearMonth: setYearMonth } =
    useSelectedDate();
  const [dashboardView, setDashboardView] = useState<DashboardView>("vehicle");
  const [expenseLabel, setExpenseLabel] = useState("ガソリン代");
  const [totalExpenseInput, setTotalExpenseInput] = useState("");
  const [allocationApplied, setAllocationApplied] = useState(false);
  const [vehicleExpenses, setVehicleExpenses] = useState<VehicleExpenseRecord[]>(
    [],
  );

  useEffect(() => {
    void loadVehicleExpenses().then(setVehicleExpenses);
  }, [yearMonth]);

  const summary = useMemo(
    () => buildMonthlySummary(records, yearMonth, masters),
    [records, yearMonth, masters],
  );

  const totalExpense = Number(totalExpenseInput) || 0;

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

  const allocation = useMemo(() => {
    if (!allocationApplied || totalExpense <= 0) return null;
    const base = allocateExpenseByVehicleDays(summary.vehicles, totalExpense);
    return enrichAllocationWithMaintenance(base, maintenanceByVehicle);
  }, [allocationApplied, totalExpense, summary.vehicles, maintenanceByVehicle]);

  const shipperProfits = useMemo(() => {
    if (!allocationApplied || totalExpense <= 0) return null;
    return allocateShipperNetProfit(summary.shippers, totalExpense);
  }, [allocationApplied, totalExpense, summary.shippers]);

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

  const monthFuelTotal = useMemo(
    () => totalFuelForMonth(vehicleExpenses, yearMonth),
    [vehicleExpenses, yearMonth],
  );

  const monthTollImportTotal = useMemo(
    () => totalTollExpenseForMonth(vehicleExpenses, yearMonth),
    [vehicleExpenses, yearMonth],
  );

  const hasImportedFuel = useMemo(
    () => [...importedFuelByVehicle.values()].some((v) => v > 0),
    [importedFuelByVehicle],
  );

  const fuelByVehicle = useMemo(() => {
    if (hasImportedFuel) return importedFuelByVehicle;
    const map = new Map<string, number>();
    if (allocation) {
      for (const row of allocation) {
        map.set(row.vehicleNumber, row.allocatedExpense);
      }
    }
    return map;
  }, [hasImportedFuel, importedFuelByVehicle, allocation]);

  const fuelByShipper = useMemo(() => {
    const map = new Map<string, number>();
    if (shipperProfits) {
      for (const row of shipperProfits) {
        map.set(row.shipperName, row.allocatedExpense);
      }
    }
    return map;
  }, [shipperProfits]);

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

  const shipperAnalysis = useMemo(() => {
    const base = buildShipperJobAnalysis(
      records,
      yearMonth,
      masters,
      fuelByShipper.size > 0 ? fuelByShipper : undefined,
    );
    const commonExpense =
      allocationApplied && totalExpense > 0 ? totalExpense : 0;
    return enrichShipperJobMarginalProfit(base, commonExpense);
  }, [
    records,
    yearMonth,
    masters,
    fuelByShipper,
    allocationApplied,
    totalExpense,
  ]);

  const driverAnalysis = useMemo(
    () => buildDriverAnalysis(records, yearMonth, masters),
    [records, yearMonth, masters],
  );

  const shipperProfitChartData =
    shipperProfits?.slice(0, 8).map((s) => ({
      name: s.shipperName,
      value: s.netGrossProfit,
    })) ??
    shipperAnalysis.slice(0, 8).map((s) => ({
      name: s.shipperName,
      value: s.grossProfit,
    }));

  const handleAllocate = () => {
    if (totalExpense <= 0) {
      alert("総請求額を入力してください（1円以上）");
      return;
    }
    if (summary.vehicles.length === 0) {
      alert("この月に車両データがありません。日次入力で運行業務を登録してください。");
      return;
    }
    setAllocationApplied(true);
  };

  return (
    <div className="space-y-6">
      <BackupControls
        records={records}
        masters={masters}
        onRestore={onRestore}
      />

      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
        <div className="space-y-2">
          <Label htmlFor="summary-month">集計対象月</Label>
          <Input
            id="summary-month"
            type="month"
            value={yearMonth}
            onChange={(e) => {
              setYearMonth(e.target.value);
              setAllocationApplied(false);
            }}
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
            onClick={() =>
              exportFullMonthlyPack(
                records,
                yearMonth,
                masters,
                expenseLabel,
                allocationApplied ? totalExpense : 0,
              )
            }
          >
            <Download className="size-4" />
            一括ダウンロード
          </Button>
        </div>
      </div>

      {/* 分析切り口タブ（車両別 / 荷主別 / ドライバー別） */}
      <Tabs
        value={dashboardView}
        onValueChange={(v) => setDashboardView(v as DashboardView)}
      >
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="vehicle">① 車両別（経費内訳）</TabsTrigger>
          <TabsTrigger value="shipper">② 荷主・業務別</TabsTrigger>
          <TabsTrigger value="driver">③ ドライバー別</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>月間総売上</CardDescription>
            <CardTitle className="text-2xl">
              {formatYen(summary.totalRevenue)}
            </CardTitle>
          </CardHeader>
        </Card>
        {dashboardView === "vehicle" && (
          <>
            <Card className="border-orange-200 bg-orange-50/40">
              <CardHeader className="pb-2">
                <CardDescription>月間修繕コスト（整備費・部品代）</CardDescription>
                <CardTitle className="text-2xl text-orange-800">
                  {formatYen(monthMaintenanceTotal)}
                </CardTitle>
              </CardHeader>
            </Card>
            {hasImportedFuel && (
              <Card className="border-amber-200 bg-amber-50/40">
                <CardHeader className="pb-2">
                  <CardDescription>月間燃料代（加島様インポート）</CardDescription>
                  <CardTitle className="text-2xl text-amber-900">
                    {formatYen(monthFuelTotal)}
                  </CardTitle>
                </CardHeader>
              </Card>
            )}
            {monthTollImportTotal > 0 && (
              <Card className="border-teal-200 bg-teal-50/40">
                <CardHeader className="pb-2">
                  <CardDescription>月間高速代（KJS/コーポインポート）</CardDescription>
                  <CardTitle className="text-2xl text-teal-900">
                    {formatYen(monthTollImportTotal)}
                  </CardTitle>
                </CardHeader>
              </Card>
            )}
          </>
        )}
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
            <CardDescription>日次記録件数</CardDescription>
            <CardTitle className="text-2xl">{summary.recordCount} 件</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* ── ① 車両別（経費内訳） ── */}
      {dashboardView === "vehicle" && (
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
                {hasImportedFuel ? "" : "（燃料代未登録時は月次経費按分を使用）"}
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

      {/* ── ② 荷主・業務別（ドリルダウン） ── */}
      {dashboardView === "shipper" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">荷主別 粗利益ランキング</CardTitle>
              <CardDescription>
                粗利 ＝ 売上 − 高速代 − 人件費
                {shipperProfits ? " − 按分燃料代" : ""}（上位8社）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SummaryBarChart
                data={shipperProfitChartData}
                valueLabel="粗利益"
                color="hsl(142 71% 45%)"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">荷主 → 業務 階層分析</CardTitle>
              <CardDescription>
                荷主行で業務一覧を展開し、業務行をクリックすると日次明細をその場で修正できます。
                純利益・1台あたり純利益は高速代・人件費に加え、下部の月次経費を稼働台数で按分して算出します。
                {allocationApplied && totalExpense > 0
                  ? `（共通経費 ${formatYen(totalExpense)} を按分済）`
                  : "（月次経費按分は未適用 — 下部で按分計算を実行すると純利益に反映されます）"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ShipperJobDrilldown
                rows={shipperAnalysis}
                yearMonth={yearMonth}
                records={records}
                vehicles={masters.vehicles}
                masters={masters}
                onRecordsChange={
                  onRecordsChange ??
                  (() => {
                    /* read-only */
                  })
                }
                maintenanceByShipper={maintenanceByShipper}
                commonExpenseApplied={allocationApplied && totalExpense > 0}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ③ ドライバー別（生産性・労務） ── */}
      {dashboardView === "driver" && (
        <DriverProductivityView rows={driverAnalysis} />
      )}

      {summary.partners.length > 0 && (
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

      {dashboardView === "shipper" && shipperProfits && (
        <Card className="border-emerald-600/30">
          <CardHeader>
            <CardTitle className="text-lg">荷主別「真の粗利益」</CardTitle>
            <CardDescription>
              差引粗利益 ＝ 総売上 − 総高速代 − 総人件費 − 総傭車料 − 月次経費（{expenseLabel}{" "}
              {formatYen(totalExpense)} を荷主の売上比率で按分）
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
                  expenseLabel,
                  totalExpense,
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

      {dashboardView === "vehicle" && (
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-lg">月次経費の自動按分</CardTitle>
          <CardDescription>
            車両は稼働日数比率で燃料代を按分。純利益 ＝ 売上 − 人件費 − 燃料代 − 高速代 − 修繕費
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="expense-label">経費名目</Label>
              <Input
                id="expense-label"
                value={expenseLabel}
                onChange={(e) => setExpenseLabel(e.target.value)}
                placeholder="ガソリン代"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total-expense">総請求額（円）</Label>
              <CurrencyInput
                id="total-expense"
                value={Number(totalExpenseInput) || 0}
                onChange={(n) => {
                  setTotalExpenseInput(String(n));
                  setAllocationApplied(false);
                }}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="button" onClick={handleAllocate} className="w-full sm:w-auto">
                <Calculator className="size-4" />
                月次経費を按分して計算
              </Button>
            </div>
          </div>

          {allocation && (
            <>
              <p className="text-sm text-muted-foreground">
                {expenseLabel} {formatYen(totalExpense)} を{" "}
                {summary.vehicles.length} 台の稼働日数比率で按分しました。
              </p>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>車両番号</TableHead>
                      <TableHead className="text-right">稼働日数</TableHead>
                      <TableHead className="text-right">按分比率</TableHead>
                      <TableHead className="text-right">売上</TableHead>
                      <TableHead className="text-right">修繕コスト</TableHead>
                      <TableHead className="text-right">按分経費</TableHead>
                      <TableHead className="text-right font-semibold">
                        純利益
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocation.map((row) => {
                      const maintenance =
                        maintenanceByVehicle.get(row.vehicleNumber) ?? 0;
                      return (
                      <TableRow key={row.vehicleNumber}>
                        <TableCell className="font-medium">
                          {row.vehicleNumber}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.operatingDays} 日
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPct(row.allocationRatio)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatYen(row.totalRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-orange-700">
                          {formatYen(maintenance, { zeroAsDash: true })}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
                          {formatYen(row.allocatedExpense)}
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
                    );})}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>合計</TableCell>
                      <TableCell className="text-right">
                        {allocation.reduce((s, r) => s + r.operatingDays, 0)}{" "}
                        日
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        {formatYen(
                          allocation.reduce((s, r) => s + r.totalRevenue, 0),
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(monthMaintenanceTotal)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(
                          allocation.reduce((s, r) => s + r.allocatedExpense, 0),
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(
                          allocation.reduce((s, r) => s + r.grossProfit, 0),
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
                  exportAllocationCsv(
                    yearMonth,
                    expenseLabel,
                    totalExpense,
                    allocation,
                  )
                }
              >
                <Download className="size-4" />
                按分結果CSV
              </Button>
            </>
          )}

          {!allocationApplied && totalExpense > 0 && (
            <p className="text-sm text-muted-foreground">
              総請求額を入力したら「月次経費を按分して計算」を押してください。
            </p>
          )}
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
