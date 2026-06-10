"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { VehicleTripDrilldown } from "@/components/analytics-trip-edit-panel";
import { formatYen } from "@/lib/currency-format";
import type { VehicleCostBreakdownRow } from "@/lib/dashboard-analytics";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DailyRecord } from "@/lib/types";

type VehicleCostDrilldownProps = {
  rows: VehicleCostBreakdownRow[];
  records: DailyRecord[];
  yearMonth: string;
  vehicles: string[];
  onRecordsChange: (records: DailyRecord[]) => void;
  emptyMessage?: string;
};

export function VehicleCostDrilldown({
  rows,
  records,
  yearMonth,
  vehicles,
  onRecordsChange,
  emptyMessage = "この月の車両データはありません",
}: VehicleCostDrilldownProps) {
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);

  const toggle = (vehicleNumber: string) => {
    setExpandedVehicle((prev) =>
      prev === vehicleNumber ? null : vehicleNumber,
    );
  };

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>車両</TableHead>
          <TableHead className="text-right">売上</TableHead>
          <TableHead className="text-right">人件費</TableHead>
          <TableHead className="text-right">燃料代</TableHead>
          <TableHead className="text-right">高速代</TableHead>
          <TableHead className="text-right">修繕費</TableHead>
          <TableHead className="text-right">純利益</TableHead>
          <TableHead className="text-right">走行km</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((v) => {
          const isOpen = expandedVehicle === v.vehicleNumber;
          return (
            <Fragment key={v.vehicleNumber}>
              <TableRow
                className={cn(
                  "cursor-pointer hover:bg-slate-50",
                  isOpen && "bg-muted/40",
                )}
                onClick={() => toggle(v.vehicleNumber)}
              >
                <TableCell className="w-8 p-2">
                  {isOpen ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{v.vehicleNumber}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatYen(v.totalRevenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatYen(v.laborCost, { zeroAsDash: true })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatYen(v.fuelCost, { zeroAsDash: true })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatYen(v.tollCost, { zeroAsDash: true })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatYen(v.maintenanceCost, { zeroAsDash: true })}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold tabular-nums",
                    v.netProfit >= 0 ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {formatYen(v.netProfit)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {v.totalKm.toLocaleString()}
                </TableCell>
              </TableRow>
              {isOpen && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="p-0">
                    <VehicleTripDrilldown
                      vehicleLabel={v.vehicleNumber}
                      records={records}
                      yearMonth={yearMonth}
                      vehicles={vehicles}
                      onRecordsChange={onRecordsChange}
                    />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
