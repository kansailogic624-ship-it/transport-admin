"use client";

import { Trash2 } from "lucide-react";
import { AlertList } from "@/components/alert-list";
import { TripCrewEditor } from "@/components/trip-crew-editor";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { safeNumber } from "@/lib/currency-format";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTripAlerts } from "@/lib/alerts";
import { getJobsForShipper } from "@/lib/masters";
import type { DailyRecord, MasterData, TripEntry } from "@/lib/types";
import type { RunType } from "@/lib/types";

type TripEntryFormProps = {
  trip: TripEntry;
  index: number;
  recordDate: string;
  masters: MasterData;
  records: DailyRecord[];
  drivers: string[];
  canRemove: boolean;
  jobOptions: string[];
  onChange: (patch: Partial<TripEntry>) => void;
  onRemove: () => void;
};

const RUN_LABELS: { value: RunType; label: string }[] = [
  { value: "own", label: "自社便" },
  { value: "partner", label: "傭車（協力会社）" },
];

export function TripEntryForm({
  trip,
  index,
  recordDate,
  masters,
  records,
  drivers,
  canRemove,
  jobOptions,
  onChange,
  onRemove,
}: TripEntryFormProps) {
  const isPartner = trip.runType === "partner";

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">業務 {index + 1}</span>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-background p-0.5">
            {RUN_LABELS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  trip.runType === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() =>
                  onChange({
                    runType: opt.value,
                    ...(opt.value === "partner"
                      ? {
                          crew: [],
                          startMeter: "",
                          endMeter: "",
                        }
                      : {}),
                  })
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="size-4" />
              削除
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {isPartner && (
          <>
            <div className="space-y-2">
              <Label>協力会社名</Label>
              {masters.partners.length > 0 ? (
                <Select
                  value={trip.partnerName}
                  onValueChange={(v) => onChange({ partnerName: v ?? "" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="協力会社を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {masters.partners.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  マスタ登録で協力会社を追加してください
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>傭車料金（支払運賃・円）</Label>
              <CurrencyInput
                value={safeNumber(trip.partnerFee)}
                onChange={(n) => onChange({ partnerFee: String(n) })}
              />
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label>車両番号</Label>
          {masters.vehicles.length > 0 ? (
            <Select
              value={trip.vehicleNumber}
              onValueChange={(v) => onChange({ vehicleNumber: v ?? "" })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="車両を選択（任意）" />
              </SelectTrigger>
              <SelectContent>
                {masters.vehicles.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={trip.vehicleNumber}
              onChange={(e) => onChange({ vehicleNumber: e.target.value })}
              placeholder="車両番号"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>荷主名</Label>
          {masters.shippers.length > 0 ? (
            <Select
              value={trip.shipperName}
              onValueChange={(v) =>
                onChange({ shipperName: v ?? "", jobName: "" })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="荷主を選択" />
              </SelectTrigger>
              <SelectContent>
                {masters.shippers.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">
              マスタ登録で荷主名を追加してください
            </p>
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>業務名</Label>
          {!trip.shipperName ? (
            <div>
              <p className="text-xs text-muted-foreground">
                先に荷主名を選択してください
              </p>
              {trip.jobName && (
                <p className="mt-0.5 text-xs text-amber-700">
                  取込済の業務名: {trip.jobName}
                </p>
              )}
            </div>
          ) : jobOptions.length > 0 ? (
            <Select
              value={trip.jobName}
              onValueChange={(v) => onChange({ jobName: v ?? "" })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="業務名を選択" />
              </SelectTrigger>
              <SelectContent>
                {jobOptions.map((job) => (
                  <SelectItem key={job} value={job}>
                    {job}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-amber-700">
              「{trip.shipperName}」に業務名がありません
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>売上金額（円）</Label>
          <CurrencyInput
            value={safeNumber(trip.revenue)}
            onChange={(n) => onChange({ revenue: String(n) })}
          />
        </div>

        {!isPartner && (
          <div className="space-y-2">
            <Label>高速代（円）</Label>
            <CurrencyInput
              value={safeNumber(trip.tollFee)}
              onChange={(n) => onChange({ tollFee: String(n) })}
            />
          </div>
        )}

        {!isPartner && (
          <>
            <TripCrewEditor
              trip={trip}
              tripIndex={index}
              recordDate={recordDate}
              masters={masters}
              records={records}
              drivers={drivers}
              onChange={(crew) => onChange({ crew })}
            />
            <AlertList
              alerts={getTripAlerts(trip, index)}
              className="sm:col-span-2"
            />
            <div className="space-y-2">
              <Label>開始メーター (km)</Label>
              <Input
                type="number"
                min={0}
                value={trip.startMeter}
                onChange={(e) => onChange({ startMeter: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>終了メーター (km)</Label>
              <Input
                type="number"
                min={0}
                value={trip.endMeter}
                onChange={(e) => onChange({ endMeter: e.target.value })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function jobOptionsForTrip(
  masters: MasterData,
  trip: TripEntry,
): string[] {
  const jobs = getJobsForShipper(masters, trip.shipperName);
  if (trip.jobName && !jobs.includes(trip.jobName)) {
    return [trip.jobName, ...jobs];
  }
  return jobs;
}
