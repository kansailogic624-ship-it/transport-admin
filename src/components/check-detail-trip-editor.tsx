"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatYen, safeNumber } from "@/lib/currency-format";
import { newCrewMember } from "@/lib/crew-utils";
import { getJobsForShipper } from "@/lib/masters";
import type { MasterData, TripEntry } from "@/lib/types";

export const JOB_PRESET_OTHER = "__other__";

const COMPACT_SELECT =
  "h-7 w-full min-w-0 text-xs shadow-sm [&_[data-slot=select-value]]:truncate";
const COMPACT_INPUT =
  "h-7 rounded-md border border-input bg-transparent px-2 py-0 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export type TripDraftRow = {
  id: string;
  shipperName: string;
  jobPreset: string;
  customJobName: string;
  amount: number;
  /** 配送件数（ドロップ数） */
  dropCount: number;
};

function resolveTripJob(trip: TripEntry): string {
  return (
    trip.jobName.trim() ||
    trip.linkedDispatchName?.trim() ||
    trip.shipperName.trim() ||
    ""
  );
}

export function tripToDraftRow(
  trip: TripEntry,
  masters: MasterData,
): TripDraftRow {
  const shipper = trip.shipperName.trim();
  const job = resolveTripJob(trip);
  const matchedShipper =
    shipper && masters.shippers.includes(shipper)
      ? shipper
      : (masters.shippers[0] ?? "");
  const jobsForShipper = getJobsForShipper(masters, matchedShipper);
  const inMaster = job && jobsForShipper.includes(job);

  return {
    id: trip.id,
    shipperName: matchedShipper,
    jobPreset: inMaster ? job : job ? JOB_PRESET_OTHER : "",
    customJobName: inMaster ? "" : job,
    amount: safeNumber(trip.revenue),
    dropCount:
      typeof trip.dropCount === "number" && trip.dropCount > 0
        ? trip.dropCount
        : 1,
  };
}

export function tripsToDraftRows(
  trips: TripEntry[],
  masters: MasterData,
): TripDraftRow[] {
  return trips.map((t) => tripToDraftRow(t, masters));
}

export function draftRowJobName(row: TripDraftRow): string {
  if (row.jobPreset === JOB_PRESET_OTHER) return row.customJobName.trim();
  return row.jobPreset.trim();
}

export function newEmptyTripDraftRow(masters: MasterData): TripDraftRow {
  const shipper = masters.shippers[0] ?? "";
  const jobs = getJobsForShipper(masters, shipper);
  return {
    id: crypto.randomUUID(),
    shipperName: shipper,
    jobPreset: jobs[0] ?? "",
    customJobName: "",
    amount: 0,
    dropCount: 1,
  };
}

export function draftRowsToTrips(
  rows: TripDraftRow[],
  driverName: string,
  originalTrips: TripEntry[],
): TripEntry[] {
  const byId = new Map(originalTrips.map((t) => [t.id, t]));

  return rows.map((row) => {
    const jobName = draftRowJobName(row);
    const shipperName = row.shipperName.trim() || jobName;
    const revenue = row.amount > 0 ? String(Math.round(row.amount)) : "";
    const base = byId.get(row.id);

    const dropCount =
      row.dropCount > 0 ? Math.round(row.dropCount) : undefined;

    if (base) {
      return {
        ...base,
        shipperName,
        jobName,
        revenue,
        dropCount,
        linkedDispatchName: base.linkedDispatchName || jobName || undefined,
      };
    }

    const crewMember = newCrewMember("employee");
    crewMember.name = driverName;
    return {
      id: row.id,
      runType: "own",
      vehicleNumber: "",
      shipperName,
      jobName,
      revenue,
      tollFee: "",
      startMeter: "",
      endMeter: "",
      crew: [crewMember],
      partnerName: "",
      partnerFee: "",
      dropCount,
      linkedDispatchName: jobName || undefined,
    };
  });
}

export function tripDraftTotal(rows: TripDraftRow[]): number {
  return rows.reduce((sum, r) => sum + safeNumber(r.amount), 0);
}

export function tripDraftsEqual(a: TripDraftRow[], b: TripDraftRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i]!;
    return (
      row.id === other.id &&
      row.shipperName === other.shipperName &&
      row.jobPreset === other.jobPreset &&
      row.customJobName === other.customJobName &&
      row.amount === other.amount &&
      row.dropCount === other.dropCount
    );
  });
}

type TripRowProps = {
  index: number;
  row: TripDraftRow;
  masters: MasterData;
  onUpdate: (patch: Partial<TripDraftRow>) => void;
  onRemove: () => void;
};

function CompactTripRow({
  index,
  row,
  masters,
  onUpdate,
  onRemove,
}: TripRowProps) {
  const jobs = getJobsForShipper(masters, row.shipperName);
  const showCustomJob =
    row.jobPreset === JOB_PRESET_OTHER && jobs.length > 0;

  return (
    <div className="rounded-md border border-border/70 bg-muted/15 px-2 py-1.5">
      {/* 上段: 荷主 40% + 案件 60% */}
      <div className="flex items-center gap-1.5">
        <span className="w-4 shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {index + 1}.
        </span>
        <div className="grid min-w-0 flex-1 grid-cols-[2fr_3fr] gap-1.5">
          <Select
            value={row.shipperName ?? ""}
            onValueChange={(v) => {
              const shipper = v ?? "";
              const shipperJobs = getJobsForShipper(masters, shipper);
              onUpdate({
                shipperName: shipper,
                jobPreset: shipperJobs[0] ?? "",
                customJobName: "",
              });
            }}
          >
            <SelectTrigger className={COMPACT_SELECT}>
              <SelectValue placeholder="荷主名" />
            </SelectTrigger>
            <SelectContent>
              {masters.shippers.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {jobs.length > 0 ? (
            <Select
              value={row.jobPreset ?? ""}
              onValueChange={(v) =>
                onUpdate({
                  jobPreset: v ?? "",
                  customJobName:
                    v === JOB_PRESET_OTHER ? row.customJobName : "",
                })
              }
            >
              <SelectTrigger className={COMPACT_SELECT}>
                <SelectValue placeholder="案件・コース名" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job} value={job} className="text-xs">
                    {job}
                  </SelectItem>
                ))}
                <SelectItem value={JOB_PRESET_OTHER} className="text-xs">
                  その他
                </SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              className={COMPACT_INPUT}
              value={row.customJobName}
              placeholder="案件・コース名"
              onChange={(e) =>
                onUpdate({
                  jobPreset: JOB_PRESET_OTHER,
                  customJobName: e.target.value,
                })
              }
            />
          )}
        </div>
      </div>

      {showCustomJob && (
        <div className="mt-1 pl-5">
          <Input
            className={COMPACT_INPUT + " w-full"}
            value={row.customJobName}
            placeholder="案件名を入力"
            onChange={(e) => onUpdate({ customJobName: e.target.value })}
          />
        </div>
      )}

      {/* 下段: 金額 + 件数 + 削除 */}
      <div className="mt-1 flex items-center gap-1.5 pl-5">
        <span className="shrink-0 text-[10px] text-muted-foreground">金額</span>
        <input
          type="number"
          min={0}
          step={1}
          className={
            COMPACT_INPUT + " w-24 text-right tabular-nums"
          }
          value={row.amount || ""}
          placeholder="0"
          onChange={(e) =>
            onUpdate({ amount: safeNumber(e.target.value) })
          }
        />
        <span className="shrink-0 text-[10px] text-muted-foreground">円</span>
        <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">
          件数
        </span>
        <input
          type="number"
          min={1}
          step={1}
          className={COMPACT_INPUT + " w-14 text-right tabular-nums"}
          value={row.dropCount || ""}
          placeholder="1"
          onChange={(e) => {
            const n = safeNumber(e.target.value);
            onUpdate({ dropCount: n > 0 ? n : 1 });
          }}
        />
        <span className="shrink-0 text-[10px] text-muted-foreground">件</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemove}
          aria-label="この業務を削除"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

type Props = {
  rows: TripDraftRow[];
  masters: MasterData;
  onChange: (rows: TripDraftRow[]) => void;
};

export function CheckDetailTripEditor({ rows, masters, onChange }: Props) {
  const total = tripDraftTotal(rows);
  const hasShippers = masters.shippers.length > 0;

  function updateRow(id: string, patch: Partial<TripDraftRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  function addRow() {
    onChange([...rows, newEmptyTripDraftRow(masters)]);
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">業務一覧</h3>
        <p className="text-sm font-bold tabular-nums text-foreground">
          合計 {formatYen(total)}
        </p>
      </div>

      {!hasShippers ? (
        <p className="mb-2 rounded-md border border-dashed bg-muted/20 px-2 py-3 text-center text-xs text-muted-foreground">
          マスタ登録で荷主名・業務名を登録すると、ここで選択できるようになります。
        </p>
      ) : rows.length === 0 ? (
        <p className="mb-2 rounded-md border border-dashed bg-muted/20 px-2 py-3 text-center text-xs text-muted-foreground">
          業務が登録されていません。「＋業務を追加」から入力してください。
        </p>
      ) : (
        <div className="space-y-1">
          {rows.map((row, index) => (
            <CompactTripRow
              key={row.id}
              index={index}
              row={row}
              masters={masters}
              onUpdate={(patch) => updateRow(row.id, patch)}
              onRemove={() => removeRow(row.id)}
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 h-7 w-full gap-1 text-xs"
        onClick={addRow}
        disabled={!hasShippers}
      >
        <Plus className="size-3.5" />
        業務を追加
      </Button>
    </section>
  );
}
