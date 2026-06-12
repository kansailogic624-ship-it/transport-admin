"use client";

import { Plus, Trash2 } from "lucide-react";
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
import { formatYen } from "@/lib/currency-format";
import {
  calculateTripLaborCost,
  crewTypeLabel,
} from "@/lib/labor-cost";
import { newCrewMember } from "@/lib/crew-utils";
import type {
  CrewMemberType,
  DailyRecord,
  MasterData,
  TripCrewMember,
  TripEntry,
} from "@/lib/types";

const MEMBER_TYPES: { value: CrewMemberType; label: string }[] = [
  { value: "employee", label: "社員" },
  { value: "part_time", label: "アルバイト" },
  { value: "dispatch", label: "派遣" },
];

type TripCrewEditorProps = {
  trip: TripEntry;
  tripIndex: number;
  recordDate: string;
  masters: MasterData;
  records: DailyRecord[];
  drivers: string[];
  onChange: (crew: TripCrewMember[]) => void;
};

export function TripCrewEditor({
  trip,
  tripIndex,
  recordDate,
  masters,
  records,
  drivers,
  onChange,
}: TripCrewEditorProps) {
  const crew = trip.crew?.length ? trip.crew : [newCrewMember()];
  const yearMonth = recordDate.slice(0, 7);
  const labor = calculateTripLaborCost(trip, records, yearMonth, masters);

  // 追加の乗務員（2名以上）がいる場合のみフォームを展開して表示する。
  // 代表ドライバーのみ（1名）の場合はボタンだけ表示してスペースを節約する。
  const hasAdditional = crew.length > 1;

  const updateMember = (id: string, patch: Partial<TripCrewMember>) => {
    onChange(
      crew.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  };

  const addMember = () => {
    onChange([...crew, newCrewMember()]);
  };

  const removeMember = (id: string) => {
    const next = crew.filter((m) => m.id !== id);
    onChange(next.length > 0 ? next : crew);
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed bg-background p-3 sm:col-span-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">
          乗務員（2名以上の共同業務に対応）
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={addMember}>
          <Plus className="size-4" />
          乗務員を追加
        </Button>
      </div>

      {/* 追加の乗務員がいる場合のみフォーム行を表示 */}
      {hasAdditional && crew.map((member, crewIndex) => (
        <div
          key={member.id}
          className="grid gap-2 rounded border bg-muted/20 p-2 sm:grid-cols-4"
        >
          <div className="space-y-1">
            <Label className="text-xs">区分</Label>
            <Select
              value={member.memberType ?? ""}
              onValueChange={(v) => {
                const type = (v ?? "employee") as CrewMemberType;
                updateMember(member.id, {
                  memberType: type,
                  name: "",
                  dailyCost: "",
                });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMBER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">氏名</Label>
            {member.memberType === "employee" ? (
              <Select
                value={member.name ?? ""}
                onValueChange={(v) =>
                  updateMember(member.id, { name: v ?? "" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="社員を選択" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={member.name}
                onChange={(e) =>
                  updateMember(member.id, { name: e.target.value })
                }
                placeholder={
                  member.memberType === "part_time"
                    ? "例: 田中（アルバイト）"
                    : "例: ○○派遣 山本"
                }
              />
            )}
          </div>

          <div className="flex items-end gap-1">
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">
                {member.memberType === "employee"
                  ? "人件費（自動）"
                  : "日額（円）"}
              </Label>
              {member.memberType === "employee" ? (
                <p className="rounded border bg-muted/40 px-2 py-2 text-xs tabular-nums">
                  {masters.employeeSalaries[member.name]
                    ? `給与按分 ≈${formatYen(
                        calculateTripLaborCost(
                          {
                            ...trip,
                            crew: [member],
                          },
                          records,
                          yearMonth,
                          masters,
                        ).total,
                      )}`
                    : "給与未登録"}
                </p>
              ) : (
                <CurrencyInput
                  value={safeNumber(member.dailyCost)}
                  onChange={(n) =>
                    updateMember(member.id, { dailyCost: String(n) })
                  }
                  placeholder={`標準 ${formatYen(
                    member.memberType === "part_time"
                      ? masters.defaultPartTimeDaily
                      : masters.defaultDispatchDaily,
                  )}`}
                />
              )}
            </div>
            {crew.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive"
                onClick={() => removeMember(member.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-4">
            乗務員{crewIndex + 1}: {crewTypeLabel(member.memberType)}
          </p>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        業務{tripIndex + 1} 人件費合計（按分）:{" "}
        <span className="font-semibold text-foreground">
          {formatYen(labor.total)}
        </span>
        {labor.items.length > 0 && (
          <span className="ml-1">
            （{labor.items.map((i) => `${i.name} ${formatYen(i.cost)}`).join(" / ")}）
          </span>
        )}
      </p>
    </div>
  );
}
