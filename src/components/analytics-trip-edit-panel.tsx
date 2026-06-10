"use client";

import { useCallback, useMemo } from "react";
import { formatYen } from "@/lib/currency-format";
import {
  collectTripsForShipperJob,
  collectTripsForVehicle,
  patchAnalyticsTripLine,
  type AnalyticsTripLine,
} from "@/lib/analytics-drilldown";
import { jobOptionsForTrip } from "@/components/trip-entry-form";
import { VehiclePlateSelect } from "@/components/vehicle-plate-select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DailyRecord, MasterData, TripEntry } from "@/lib/types";

const DRILLDOWN_SCROLL_CLASS = "max-h-[300px] overflow-y-auto overflow-x-auto";

const MASTER_SELECT_CLASS =
  "w-full rounded border bg-white p-1 text-sm focus:ring-2 focus:ring-blue-500";

function shipperOptions(masters: MasterData, lines: AnalyticsTripLine[]): string[] {
  const names = new Set(masters.shippers);
  for (const line of lines) {
    const s = line.shipperName.trim();
    if (s && s !== "—") names.add(s);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "ja"));
}

function tripStub(line: AnalyticsTripLine): TripEntry {
  return {
    id: line.tripId,
    runType: "own",
    vehicleNumber: line.vehicleNumber,
    shipperName: line.shipperName === "—" ? "" : line.shipperName,
    jobName: line.jobName === "—" ? "" : line.jobName,
    revenue: String(line.revenue || ""),
    tollFee: "",
    startMeter: "",
    endMeter: "",
    crew: [],
    partnerName: "",
    partnerFee: "",
  };
}

type AnalyticsTripEditPanelProps = {
  lines: AnalyticsTripLine[];
  records: DailyRecord[];
  vehicles: string[];
  masters?: MasterData;
  mode: "vehicle" | "shipper";
  onRecordsChange: (records: DailyRecord[]) => void;
  emptyMessage?: string;
};

export function AnalyticsTripEditPanel({
  lines,
  records,
  vehicles,
  masters,
  mode,
  onRecordsChange,
  emptyMessage = "該当する日次明細はありません",
}: AnalyticsTripEditPanelProps) {
  const shippers = useMemo(
    () => (masters ? shipperOptions(masters, lines) : []),
    [masters, lines],
  );

  const applyPatch = useCallback(
    (
      line: AnalyticsTripLine,
      patch: Parameters<typeof patchAnalyticsTripLine>[3],
    ) => {
      onRecordsChange(patchAnalyticsTripLine(records, line.recordId, line.tripId, patch));
    },
    [records, onRecordsChange],
  );

  if (lines.length === 0) {
    return (
      <p className="py-3 text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <div className={DRILLDOWN_SCROLL_CLASS}>
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100/80 hover:bg-slate-100/80">
            <TableHead className="w-[100px]">日付</TableHead>
            <TableHead className="w-[100px]">ドライバー</TableHead>
            <TableHead>荷主名</TableHead>
            <TableHead>業務名</TableHead>
            <TableHead className="w-[100px] text-right">売上</TableHead>
            {mode === "vehicle" && (
              <TableHead className="min-w-[160px]">車両（修正）</TableHead>
            )}
            {mode === "shipper" && (
              <TableHead className="min-w-[120px]">売上（修正）</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={`${line.recordId}-${line.tripId}`}>
              <TableCell className="!whitespace-nowrap text-sm">
                {mode === "shipper" ? (
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={line.date}
                    onChange={(e) =>
                      applyPatch(line, { date: e.target.value })
                    }
                  />
                ) : (
                  line.date
                )}
              </TableCell>
              <TableCell className="text-sm">
                <div className="flex flex-col">
                  {mode === "shipper" ? (
                    <Input
                      className="h-8 text-xs"
                      value={line.driverName}
                      onChange={(e) =>
                        applyPatch(line, { driverName: e.target.value })
                      }
                    />
                  ) : (
                    <span className="font-medium">{line.driverName}</span>
                  )}
                  {line.coDriverName && (
                    <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                      👥 2名乗車 ({line.coDriverName})
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell
                className="text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                {mode === "shipper" && masters ? (
                  <select
                    className={MASTER_SELECT_CLASS}
                    value={
                      line.shipperName === "—" ? "" : line.shipperName
                    }
                    onChange={(e) =>
                      applyPatch(line, { shipperName: e.target.value })
                    }
                  >
                    <option value="">（未選択）</option>
                    {shippers.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  line.shipperName
                )}
              </TableCell>
              <TableCell
                className="text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                {mode === "shipper" && masters ? (
                  <select
                    className={MASTER_SELECT_CLASS}
                    value={line.jobName === "—" ? "" : line.jobName}
                    onChange={(e) =>
                      applyPatch(line, { jobName: e.target.value })
                    }
                  >
                    <option value="">（未選択）</option>
                    {jobOptionsForTrip(masters, {
                      ...tripStub(line),
                      shipperName:
                        line.shipperName === "—" ? "" : line.shipperName,
                    }).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  line.jobName
                )}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {line.revenue > 0 ? formatYen(line.revenue) : "—"}
              </TableCell>
              {mode === "vehicle" && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <VehiclePlateSelect
                    value={line.vehicleNumber}
                    vehicles={vehicles}
                    onChange={(plate) =>
                      applyPatch(line, { vehicleNumber: plate })
                    }
                  />
                </TableCell>
              )}
              {mode === "shipper" && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 text-right text-xs tabular-nums"
                    placeholder="0"
                    defaultValue={line.revenue > 0 ? line.revenue : ""}
                    key={`${line.recordId}-${line.tripId}-${line.revenue}`}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      applyPatch(line, {
                        revenue: raw === "" ? "" : String(Math.round(Number(raw))),
                      });
                    }}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type VehicleTripDrilldownProps = {
  vehicleLabel: string;
  records: DailyRecord[];
  yearMonth: string;
  vehicles: string[];
  onRecordsChange: (records: DailyRecord[]) => void;
};

export function VehicleTripDrilldown({
  vehicleLabel,
  records,
  yearMonth,
  vehicles,
  onRecordsChange,
}: VehicleTripDrilldownProps) {
  const lines = useMemo(
    () => collectTripsForVehicle(records, yearMonth, vehicleLabel, vehicles),
    [records, yearMonth, vehicleLabel, vehicles],
  );

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-3 py-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {vehicleLabel} の日次運行明細（{lines.length} 件）— 車両を選択すると集計に即反映されます
      </p>
      <AnalyticsTripEditPanel
        lines={lines}
        records={records}
        vehicles={vehicles}
        mode="vehicle"
        onRecordsChange={onRecordsChange}
        emptyMessage="この車両区分に該当する日次明細はありません"
      />
    </div>
  );
}

type ShipperJobTripDrilldownProps = {
  shipperName: string;
  jobName: string;
  records: DailyRecord[];
  yearMonth: string;
  vehicles: string[];
  masters: MasterData;
  onRecordsChange: (records: DailyRecord[]) => void;
};

export function ShipperJobTripDrilldown({
  shipperName,
  jobName,
  records,
  yearMonth,
  vehicles,
  masters,
  onRecordsChange,
}: ShipperJobTripDrilldownProps) {
  const lines = useMemo(
    () => collectTripsForShipperJob(records, yearMonth, shipperName, jobName),
    [records, yearMonth, shipperName, jobName],
  );

  return (
    <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-2">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        日次明細（{lines.length} 件）— 荷主・業務・売上を変更すると集計に即反映されます
      </p>
      <AnalyticsTripEditPanel
        lines={lines}
        records={records}
        vehicles={vehicles}
        masters={masters}
        mode="shipper"
        onRecordsChange={onRecordsChange}
      />
    </div>
  );
}
