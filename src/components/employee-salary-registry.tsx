"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { safeNumber } from "@/lib/currency-format";
import { Label } from "@/components/ui/label";
import type { MasterData } from "@/lib/types";

type EmployeeSalaryRegistryProps = {
  masters: MasterData;
  onMastersChange: (masters: MasterData) => void;
};

export function EmployeeSalaryRegistry({
  masters,
  onMastersChange,
}: EmployeeSalaryRegistryProps) {
  const [draftRates, setDraftRates] = useState({
    partTime: String(masters.defaultPartTimeDaily || ""),
    dispatch: String(masters.defaultDispatchDaily || ""),
  });

  const updateSalary = (name: string, value: string) => {
    const amount = Number(value);
    const employeeSalaries = { ...masters.employeeSalaries };
    if (!value.trim() || !Number.isFinite(amount) || amount <= 0) {
      delete employeeSalaries[name];
    } else {
      employeeSalaries[name] = Math.round(amount);
    }
    onMastersChange({ ...masters, employeeSalaries });
  };

  const saveDefaultRates = () => {
    onMastersChange({
      ...masters,
      defaultPartTimeDaily: Number(draftRates.partTime) || 0,
      defaultDispatchDaily: Number(draftRates.dispatch) || 0,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">社員給与・非社員の標準日額</CardTitle>
        <CardDescription>
          社員の月給は、その社員が関わった業務数で割り、各運行業務に人件費として按分されます。アルバイト・派遣は業務ごとの日額（未入力時は標準日額）を使います。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="default-part-time">アルバイト標準日額（円）</Label>
            <CurrencyInput
              id="default-part-time"
              value={safeNumber(draftRates.partTime)}
              onChange={(n) =>
                setDraftRates((d) => ({ ...d, partTime: String(n) }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default-dispatch">派遣標準日額（円）</Label>
            <CurrencyInput
              id="default-dispatch"
              value={safeNumber(draftRates.dispatch)}
              onChange={(n) =>
                setDraftRates((d) => ({ ...d, dispatch: String(n) }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={saveDefaultRates}>
              標準日額を保存
            </Button>
          </div>
        </div>

        {masters.drivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            先に社員名を登録してください。
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {masters.drivers.map((name) => (
              <li
                key={name}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium leading-snug">{name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <Label className="sr-only">{name}の月給</Label>
                  <CurrencyInput
                    className="w-[140px]"
                    placeholder="月給（円）"
                    value={safeNumber(masters.employeeSalaries[name])}
                    onChange={(n) => updateSalary(name, String(n))}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    円/月
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
