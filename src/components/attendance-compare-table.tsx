"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calcTimecardVsRollCallDeviation,
  formatDeviationMinutes,
} from "@/lib/alerts";
import type { AttendanceSnapshots } from "@/lib/attendance-snapshots";
import { cn } from "@/lib/utils";

type AttendanceCompareTableProps = {
  snapshots: AttendanceSnapshots;
};

function displayActual(value: string): string {
  return value.trim() ? value : "—";
}

type RowConfig = {
  key: string;
  label: string;
  rollCallActual: string;
  timecardActual: string;
};

function rowDeviation(rollCallActual: string, timecardActual: string) {
  return calcTimecardVsRollCallDeviation(rollCallActual, timecardActual);
}

export function AttendanceCompareTable({
  snapshots,
}: AttendanceCompareTableProps) {
  const rows: RowConfig[] = [
    {
      key: "clock-in",
      label: "出勤",
      rollCallActual: snapshots.rollCallClockIn,
      timecardActual: snapshots.timecardIn,
    },
    {
      key: "clock-out",
      label: "退勤",
      rollCallActual: snapshots.rollCallClockOut,
      timecardActual: snapshots.timecardOut,
    },
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b">
          <TableHead className="h-7 w-14 px-2 text-[11px] font-medium">
            項目
          </TableHead>
          <TableHead className="h-7 px-2 text-[11px] font-medium">
            点呼記録簿(実績)
          </TableHead>
          <TableHead className="h-7 px-2 text-[11px] font-medium">
            タイムカード(実績)
          </TableHead>
          <TableHead className="h-7 w-16 px-2 text-right text-[11px] font-medium">
            乖離(分)
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const { diffMinutes, isAlert } = rowDeviation(
            row.rollCallActual,
            row.timecardActual,
          );

          return (
            <TableRow
              key={row.key}
              className={cn(
                "hover:bg-transparent border-b-0",
                isAlert && "bg-red-50 dark:bg-red-950/25",
              )}
            >
              <TableCell className="h-8 px-2 py-0 text-xs font-medium">
                {row.label}
              </TableCell>
              <TableCell className="h-8 px-2 py-0 text-xs tabular-nums">
                {displayActual(row.rollCallActual)}
              </TableCell>
              <TableCell className="h-8 px-2 py-0 text-xs tabular-nums text-muted-foreground">
                {displayActual(row.timecardActual)}
              </TableCell>
              <TableCell
                className={cn(
                  "h-8 px-2 py-0 text-right text-xs tabular-nums",
                  isAlert
                    ? "font-semibold text-red-700 dark:text-red-400"
                    : "text-muted-foreground",
                )}
              >
                {diffMinutes === null
                  ? "—"
                  : formatDeviationMinutes(diffMinutes)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
