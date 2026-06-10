"use client";

import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, User } from "lucide-react";
import { AlertList } from "@/components/alert-list";
import { DayStatusBadge } from "@/components/day-status-badge";
import { Badge } from "@/components/ui/badge";
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
import {
  buildDriverDayDetailRows,
  buildDriverMonthSummaries,
  formatRestraintDuration,
  type DriverDayDetailRow,
  type DriverMonthSummary,
} from "@/lib/driver-monthly-detail";
import { normalizeDriverName } from "@/lib/driving-report-parser";
import { withReportStatusManual } from "@/lib/record-manual-override";
import { useSelectedDate } from "@/contexts/selected-date-context";
import { cn } from "@/lib/utils";
import {
  ReportStatusBadge,
  ReportStatusSelect,
} from "@/components/report-status-control";
import { formatYen } from "@/lib/currency-format";
import type { DailyRecord, DailyReportStatus } from "@/lib/types";

const DRIVER_TABLE_COLS = 6;

type DriverDetailViewProps = {
  records: DailyRecord[];
  onRecordsChange?: (records: DailyRecord[]) => void;
};

type DriverDayDetailTableProps = {
  driverName: string;
  yearMonth: string;
  summary: DriverMonthSummary;
  dayRows: DriverDayDetailRow[];
  onRecordsChange?: (records: DailyRecord[]) => void;
  onPatchReportStatus: (
    driverName: string,
    date: string,
    status: DailyReportStatus,
  ) => void;
};

function DriverDayDetailTable({
  driverName,
  yearMonth,
  summary,
  dayRows,
  onRecordsChange,
  onPatchReportStatus,
}: DriverDayDetailTableProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const datesWithAlerts = useMemo(() => {
    const set = new Set<string>();
    for (const row of dayRows) {
      if (row.alerts.length > 0) set.add(row.date);
    }
    return set;
  }, [dayRows]);

  if (dayRows.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        このドライバーの明細はありません。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1 border-b border-slate-200 pb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <User className="size-4 shrink-0 text-slate-600" />
          {driverName} — {yearMonth} の運行明細（1日1行）
        </h3>
        <p className="text-xs text-muted-foreground">
          当月サマリー：売上 {formatYen(summary.totalRevenue)} / 走行{" "}
          {summary.totalKm.toLocaleString()} km / 拘束{" "}
          {formatRestraintDuration(summary.totalRestraintMinutes)}
        </p>
        {datesWithAlerts.size > 0 && (
          <p className="flex items-center gap-1 text-xs font-medium text-red-600">
            <AlertTriangle className="size-3.5 shrink-0" />
            警告のある日が {datesWithAlerts.size} 日あります
          </p>
        )}
      </div>

      <div className="min-w-0 overflow-x-auto">
        <Table className="w-full min-w-[880px] table-fixed">
          <TableHeader>
            <TableRow className="bg-slate-100/80 hover:bg-slate-100/80">
              <TableHead className="w-8" />
              <TableHead className="w-[88px]">日付</TableHead>
              <TableHead className="w-[120px]">出退勤</TableHead>
              <TableHead className="w-[100px]">車両</TableHead>
              <TableHead className="w-[140px]">配車名</TableHead>
              <TableHead className="w-[72px] text-right">売上</TableHead>
              <TableHead className="w-[64px] text-right">走行km</TableHead>
              <TableHead className="w-[48px] text-center">明細</TableHead>
              <TableHead className="w-[100px]">日報</TableHead>
              <TableHead className="min-w-[250px]">アラート</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dayRows.map((row) => (
              <Fragment key={row.id}>
                <TableRow
                  className={cn(
                    row.isMissing
                      ? "border-l-4 border-l-red-500 bg-red-50/80"
                      : "cursor-pointer hover:bg-white/80",
                    !row.isMissing &&
                      row.alerts.length > 0 &&
                      "border-l-4 border-l-red-500 bg-red-50/60",
                  )}
                  onClick={() => {
                    if (row.isMissing) return;
                    setExpandedDate((d) => (d === row.date ? null : row.date));
                  }}
                >
                  <TableCell className="p-2">
                    {expandedDate === row.date ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </TableCell>
                  <TableCell className="!whitespace-nowrap font-medium">
                    {row.date}
                  </TableCell>
                  <TableCell className="!whitespace-normal text-sm">
                    {row.clockIn !== "—" ? (
                      <span>
                        {row.clockIn} 〜 {row.clockOut}
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                    {(row.timecardIn || row.timecardOut) && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <span>TC:</span>
                        <span
                          className={
                            row.timecardDeviation.inAlert
                              ? "font-semibold text-red-600"
                              : ""
                          }
                        >
                          {row.timecardIn ?? "—"}
                        </span>
                        <span>〜</span>
                        <span
                          className={
                            row.timecardDeviation.outAlert
                              ? "font-semibold text-red-600"
                              : ""
                          }
                        >
                          {row.timecardOut ?? "—"}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="!whitespace-normal text-sm">
                    {row.vehicleNumber}
                  </TableCell>
                  <TableCell className="!whitespace-normal text-sm">
                    {row.isMissing ? (
                      <span className="break-words font-semibold leading-snug text-red-600">
                        {row.missingMessage ?? row.dispatchName}
                      </span>
                    ) : row.dayStatus ? (
                      <DayStatusBadge status={row.dayStatus} />
                    ) : (
                      <span className="break-words">{row.dispatchName}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-medium">
                    {row.dayStatus ? (
                      <span className="text-muted-foreground">—</span>
                    ) : row.revenue > 0 ? (
                      formatYen(row.revenue)
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.km > 0 ? row.km : "—"}
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {row.tripCount}件
                  </TableCell>
                  <TableCell
                    className="!whitespace-normal"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.isMissing ? (
                      <Badge className="border-red-300 bg-red-100 text-[10px] text-red-800">
                        未入力警告
                      </Badge>
                    ) : onRecordsChange ? (
                      <ReportStatusSelect
                        compact
                        value={row.reportStatus}
                        onChange={(status) =>
                          onPatchReportStatus(driverName, row.date, status)
                        }
                      />
                    ) : (
                      <ReportStatusBadge status={row.reportStatus} />
                    )}
                  </TableCell>
                  <TableCell className="!whitespace-normal min-w-[250px] align-top break-words">
                    {row.alerts.length > 0 ? (
                      <AlertList
                        alerts={row.alerts}
                        className="[&_li]:break-words [&_span]:break-words"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
                {expandedDate === row.date && (
                  <TableRow className="bg-white/60 hover:bg-white/60">
                    <TableCell colSpan={10} className="p-3">
                      {(row.timecardIn || row.timecardOut) && (
                        <div className="mb-3 rounded border bg-background px-3 py-2 text-xs">
                          <p className="mb-1.5 font-medium text-muted-foreground">
                            出退勤時刻の比較
                          </p>
                          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                            <div className="text-muted-foreground" />
                            <div className="font-medium">出勤</div>
                            <div className="font-medium">退勤</div>
                            <div className="text-muted-foreground">点呼簿</div>
                            <div>{row.clockIn || "—"}</div>
                            <div>{row.clockOut || "—"}</div>
                            <div className="text-muted-foreground">
                              タイムカード
                            </div>
                            <div
                              className={
                                row.timecardDeviation.inAlert
                                  ? "font-semibold text-red-600"
                                  : ""
                              }
                            >
                              {row.timecardIn ?? "—"}
                            </div>
                            <div
                              className={
                                row.timecardDeviation.outAlert
                                  ? "font-semibold text-red-600"
                                  : ""
                              }
                            >
                              {row.timecardOut ?? "—"}
                            </div>
                          </div>
                        </div>
                      )}
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        業務明細（{row.tripCount} 件）
                      </p>
                      <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                        {row.trips.map((trip, i) => (
                          <li
                            key={trip.id}
                            className="rounded border bg-background px-2 py-1"
                          >
                            <span className="font-medium">業務{i + 1}</span>
                            {" — "}
                            {trip.shipperName}
                            {trip.jobName ? ` / ${trip.jobName}` : ""}
                            {trip.revenue > 0
                              ? ` / ${formatYen(trip.revenue)}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function DriverDetailView({
  records,
  onRecordsChange,
}: DriverDetailViewProps) {
  const { selectedYearMonth: yearMonth, setSelectedYearMonth: setYearMonth } =
    useSelectedDate();
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);

  const summaries = useMemo(
    () => buildDriverMonthSummaries(records, yearMonth),
    [records, yearMonth],
  );

  const expandedDayRows = useMemo(() => {
    if (!expandedDriver) return [];
    return buildDriverDayDetailRows(records, yearMonth, expandedDriver);
  }, [records, yearMonth, expandedDriver]);

  const patchDayReportStatus = (
    driverName: string,
    date: string,
    reportStatus: DailyReportStatus,
  ) => {
    if (!onRecordsChange) return;
    onRecordsChange(
      records.map((r) => {
        if (r.date !== date) return r;
        if (
          normalizeDriverName(r.driverName) !== normalizeDriverName(driverName)
        ) {
          return r;
        }
        return withReportStatusManual(r, reportStatus);
      }),
    );
  };

  const toggleDriver = (driverName: string) => {
    setExpandedDriver((prev) => (prev === driverName ? null : driverName));
  };

  return (
    <div className="flex w-full max-w-full min-w-0 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
        <div className="space-y-2">
          <Label htmlFor="driver-month">対象月</Label>
          <Input
            id="driver-month"
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="w-[180px]"
          />
        </div>
        <Badge variant="secondary">{summaries.length} 名が稼働</Badge>
      </div>

      <Card className="flex min-h-0 w-full max-w-full flex-col overflow-hidden">
        <CardHeader className="shrink-0 pb-3">
          <CardTitle className="text-lg">ドライバー一覧</CardTitle>
          <CardDescription>
            名前をクリックすると、その行の直下に日別の運行明細が展開されます
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0 pb-4">
          {summaries.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              この月の稼働データはありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>名前</TableHead>
                  <TableHead className="text-right">総売上</TableHead>
                  <TableHead className="text-right">稼働日</TableHead>
                  <TableHead className="text-right">走行km</TableHead>
                  <TableHead className="text-right">拘束時間</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => {
                  const isOpen = expandedDriver === s.driverName;
                  return (
                    <Fragment key={s.driverName}>
                      <TableRow
                        className={cn(
                          "cursor-pointer",
                          isOpen && "bg-muted",
                        )}
                        onClick={() => toggleDriver(s.driverName)}
                      >
                        <TableCell className="w-8 p-2">
                          {isOpen ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {s.driverName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatYen(s.totalRevenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.operatingDays}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.totalKm.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatRestraintDuration(s.totalRestraintMinutes)}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell
                            colSpan={DRIVER_TABLE_COLS}
                            className="border-t-2 border-slate-200 bg-slate-50 p-0"
                          >
                            <div className="max-h-[400px] overflow-y-auto overflow-x-hidden border-b border-slate-200 px-4 py-3">
                              <DriverDayDetailTable
                                key={s.driverName}
                                driverName={s.driverName}
                                yearMonth={yearMonth}
                                summary={s}
                                dayRows={expandedDayRows}
                                onRecordsChange={onRecordsChange}
                                onPatchReportStatus={patchDayReportStatus}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
