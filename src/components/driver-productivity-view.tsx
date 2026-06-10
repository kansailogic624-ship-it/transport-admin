"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { formatYen } from "@/lib/currency-format";
import type { DriverAnalysisRow } from "@/lib/dashboard-analytics";
import { formatRestraintDuration } from "@/lib/driver-monthly-detail";
import { SummaryBarChart } from "@/components/summary-chart";
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

function ComplianceBadge({ row }: { row: DriverAnalysisRow }) {
  if (row.complianceStatus === "violation") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
        <ShieldAlert className="size-3.5" />
        超過
      </span>
    );
  }
  if (row.complianceStatus === "warning") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        <AlertTriangle className="size-3.5" />
        注意
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
      <CheckCircle2 className="size-3.5" />
      適合
    </span>
  );
}

type DriverProductivityViewProps = {
  rows: DriverAnalysisRow[];
};

export function DriverProductivityView({ rows }: DriverProductivityViewProps) {
  const chartData = rows.slice(0, 8).map((d) => ({
    name: d.driverName,
    value: d.totalRevenue,
  }));

  const violationCount = rows.filter(
    (r) => r.complianceStatus === "violation",
  ).length;
  const warningCount = rows.filter(
    (r) => r.complianceStatus === "warning",
  ).length;

  return (
    <div className="space-y-6">
      {(violationCount > 0 || warningCount > 0) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            violationCount > 0
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <p className="font-medium">改善基準告示（月間拘束時間）アラート</p>
          <p className="mt-1 text-xs opacity-90">
            {violationCount > 0 && `${violationCount}名が上限超過`}
            {violationCount > 0 && warningCount > 0 && " / "}
            {warningCount > 0 && `${warningCount}名が注意ゾーン（上限の80%以上）`}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ドライバー別売上</CardTitle>
            <CardDescription>上位8名</CardDescription>
          </CardHeader>
          <CardContent>
            <SummaryBarChart data={chartData} valueLabel="売上" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">生産性サマリー</CardTitle>
            <CardDescription>
              実車率 ＝ 走行km ÷（拘束時間 × 基準35km/h）
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">平均実車率</p>
              <p className="text-xl font-semibold">
                {rows.length > 0
                  ? formatPct(
                      rows.reduce((s, r) => s + r.loadedRate, 0) / rows.length,
                    )
                  : "—"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">平均労働分配率</p>
              <p className="text-xl font-semibold">
                {rows.length > 0
                  ? formatPct(
                      rows.reduce((s, r) => s + r.laborShareRatio, 0) /
                        rows.length,
                    )
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">ドライバー別 生産性・労務チェック</CardTitle>
          <CardDescription>
            売上・拘束時間・実車率・労働分配率・改善基準告示ステータス
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              この月のドライバーデータはありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ドライバー</TableHead>
                  <TableHead className="text-right">売上</TableHead>
                  <TableHead className="text-right">拘束時間</TableHead>
                  <TableHead className="text-right">走行km</TableHead>
                  <TableHead className="text-right">実車率</TableHead>
                  <TableHead className="text-right">労働分配率</TableHead>
                  <TableHead className="text-right">時間単価</TableHead>
                  <TableHead>労務</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.driverName}>
                    <TableCell className="font-medium">
                      {row.driverName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatYen(row.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRestraintDuration(row.totalRestraintMinutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalKm.toLocaleString()} km
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPct(row.loadedRate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPct(row.laborShareRatio)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.revenuePerHour > 0
                        ? `${formatYen(Math.round(row.revenuePerHour))}/h`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <ComplianceBadge row={row} />
                        <p className="text-xs text-muted-foreground">
                          {row.complianceLabel}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
