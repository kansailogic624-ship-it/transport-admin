"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { patchRecordTripFusion } from "@/lib/trip-fusion-utils";
import type { DailyRecord, MasterData, TripEntry } from "@/lib/types";

const NONE_VALUE = "__none__";

type TripFusionEditorProps = {
  record: DailyRecord;
  trip: TripEntry;
  tripIndex: number;
  masters: MasterData;
  compact?: boolean;
  /** 親の「記憶する」チェック（プレビュー画面） */
  learnEnabled?: boolean;
  /** 個別の記憶チェックを表示（日次一覧用） */
  showLearnCheckbox?: boolean;
  onRecordChange: (record: DailyRecord) => void;
  onMastersChange: (masters: MasterData) => void;
  /** 両方まとめて更新（プレビュー用・連続更新の取りこぼし防止） */
  onPatched?: (record: DailyRecord, masters: MasterData) => void;
};

export function TripFusionEditor({
  record,
  trip,
  tripIndex,
  masters,
  compact = false,
  learnEnabled = false,
  showLearnCheckbox = true,
  onRecordChange,
  onMastersChange,
  onPatched,
}: TripFusionEditorProps) {
  const options = record.fusionDispatchOptions ?? [];
  if (options.length === 0) return null;

  const [localLearn, setLocalLearn] = useState(true);
  const [jobName, setJobName] = useState(trip.jobName);
  const [revenue, setRevenue] = useState(trip.revenue);
  const [shipperName, setShipperName] = useState(trip.shipperName);

  const selected =
    trip.linkedDispatchName &&
    options.some((o) => o.dispatchName === trip.linkedDispatchName)
      ? trip.linkedDispatchName
      : NONE_VALUE;

  useEffect(() => {
    setJobName(trip.jobName);
    setRevenue(trip.revenue);
    setShipperName(trip.shipperName);
  }, [
    trip.id,
    trip.jobName,
    trip.revenue,
    trip.shipperName,
    trip.linkedDispatchName,
  ]);

  const shouldLearn = showLearnCheckbox ? localLearn : learnEnabled;

  const apply = (dispatchName: string, overrides?: { learn?: boolean }) => {
    const name = dispatchName === NONE_VALUE ? "" : dispatchName;
    const { record: nextRecord, masters: nextMasters } = patchRecordTripFusion(
      record,
      trip.id,
      {
        dispatchName: name,
        jobName: jobName.trim() || undefined,
        shipperName: shipperName.trim() || undefined,
        revenue: revenue.trim() || undefined,
        learn:
          overrides?.learn ??
          (shouldLearn && Boolean(name) && Boolean(trip.reportSourceLabel?.trim())),
      },
      masters,
    );
    if (onPatched) {
      onPatched(nextRecord, nextMasters);
    } else {
      onRecordChange(nextRecord);
      onMastersChange(nextMasters);
    }
  };

  const previewInline = compact && Boolean(onPatched) && !showLearnCheckbox;
  const fieldInputClass = compact
    ? "h-6 px-1.5 text-xs"
    : "h-8 text-sm";
  const selectTriggerClass = compact
    ? "h-6 w-full min-w-0 max-w-none py-0 text-xs [&_svg]:size-3"
    : "h-8 bg-background";

  return (
    <div
      className={
        previewInline
          ? "space-y-1 text-xs"
          : `mt-2 space-y-2 rounded-md border border-amber-200/80 bg-amber-50/50 p-2 ${compact ? "text-xs" : "text-sm"}`
      }
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {!previewInline && (
        <>
          <p className="font-medium text-amber-950">
            FileMaker配車（業務{tripIndex + 1}）
          </p>
          {trip.reportSourceLabel && (
            <p className="text-muted-foreground">
              日報: {trip.reportSourceLabel}
            </p>
          )}
        </>
      )}

      <div
        className={
          previewInline
            ? "grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-0.5"
            : "space-y-0.5"
        }
      >
        <Label
          className={
            previewInline
              ? "text-[11px] text-muted-foreground"
              : "text-xs"
          }
        >
          FM配車
        </Label>
        <Select
          value={selected ?? ""}
          onValueChange={(v) => {
            if (!v) return;
            const opt = options.find((o) => o.dispatchName === v);
            if (opt) {
              setJobName(opt.dispatchName);
              setShipperName(opt.shipperName);
              if (tripIndex === 0) {
                setRevenue(opt.revenue);
              }
            }
            apply(v, { learn: false });
          }}
        >
          <SelectTrigger size={compact ? "sm" : "default"} className={selectTriggerClass}>
            <SelectValue placeholder="配車を選択" />
          </SelectTrigger>
          <SelectContent className={compact ? "text-xs" : undefined}>
            <SelectItem value={NONE_VALUE} className={compact ? "py-1 text-xs" : undefined}>
              （未選択・日報のまま）
            </SelectItem>
            {options.map((o) => (
              <SelectItem
                key={o.dispatchName}
                value={o.dispatchName}
                className={compact ? "py-1 text-xs" : undefined}
              >
                {o.dispatchName}
                {o.shipperName ? ` / ${o.shipperName}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className={
          previewInline
            ? "grid grid-cols-3 gap-1"
            : "grid gap-2 sm:grid-cols-3"
        }
      >
        <div className="space-y-0">
          <Label className={previewInline ? "text-[11px] text-muted-foreground" : "text-xs"}>
            {previewInline ? "業務" : "業務名"}
          </Label>
          <Input
            className={fieldInputClass}
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            onBlur={() =>
              apply(selected === NONE_VALUE ? "" : selected, { learn: false })
            }
          />
        </div>
        <div className="space-y-0">
          <Label className={previewInline ? "text-[11px] text-muted-foreground" : "text-xs"}>
            荷主
          </Label>
          <Input
            className={fieldInputClass}
            value={shipperName}
            onChange={(e) => setShipperName(e.target.value)}
            onBlur={() =>
              apply(selected === NONE_VALUE ? "" : selected, { learn: false })
            }
          />
        </div>
        <div className="space-y-0">
          <Label className={previewInline ? "text-[11px] text-muted-foreground" : "text-xs"}>
            {previewInline ? "売上" : "売上（円）"}
          </Label>
          <Input
            className={`${fieldInputClass} text-right tabular-nums`}
            inputMode="numeric"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            onBlur={() =>
              apply(selected === NONE_VALUE ? "" : selected, { learn: false })
            }
          />
        </div>
      </div>

      {(showLearnCheckbox || !previewInline) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {showLearnCheckbox && (
            <>
              <Checkbox
                id={`learn-${trip.id}`}
                checked={localLearn}
                onCheckedChange={(v) => setLocalLearn(v === true)}
              />
              <Label htmlFor={`learn-${trip.id}`} className="text-xs font-normal">
                この修正を記憶する
              </Label>
            </>
          )}
          {!previewInline && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={`ml-auto ${compact ? "h-6 px-2 text-xs" : "h-7"}`}
              onClick={() =>
                apply(selected === NONE_VALUE ? "" : selected, {
                  learn: shouldLearn,
                })
              }
            >
              反映
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
