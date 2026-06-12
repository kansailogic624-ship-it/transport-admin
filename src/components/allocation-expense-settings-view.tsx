"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createAllocationExpenseEntry,
  normalizeAllocationExpenses,
  sumAllocationExpenses,
} from "@/lib/allocation-expense-utils";
import { formatYen } from "@/lib/currency-format";
import type { AllocationExpenseEntry, MasterData } from "@/lib/types";

type AllocationExpenseSettingsViewProps = {
  masters: MasterData;
  onMastersChange: (masters: MasterData) => void;
};

export function AllocationExpenseSettingsView({
  masters,
  onMastersChange,
}: AllocationExpenseSettingsViewProps) {
  const entries = masters.allocationExpenses ?? [];
  const total = useMemo(() => sumAllocationExpenses(masters), [masters]);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftAmount, setDraftAmount] = useState(0);

  const persist = (nextEntries: AllocationExpenseEntry[]) => {
    onMastersChange(
      normalizeAllocationExpenses({
        ...masters,
        allocationExpenses: nextEntries,
      }),
    );
  };

  const updateEntry = (
    id: string,
    patch: Partial<Pick<AllocationExpenseEntry, "label" | "amount">>,
  ) => {
    persist(
      entries.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : entry,
      ),
    );
  };

  const removeEntry = (id: string) => {
    persist(entries.filter((entry) => entry.id !== id));
  };

  const addEntry = () => {
    const label = draftLabel.trim();
    if (!label) return;
    if (draftAmount <= 0) return;
    persist([
      ...entries,
      createAllocationExpenseEntry(label, Math.round(draftAmount)),
    ]);
    setDraftLabel("");
    setDraftAmount(0);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>按分費設定</CardTitle>
          <CardDescription>
            家賃・光熱費など、毎月固定で発生する経費を登録します。登録した金額の合計が「集計・データ出力
            → 月次集計（全体）」の総経費に自動反映され、純利益から差し引かれます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="min-w-[200px] flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                項目名
              </label>
              <Input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="例: 家賃"
              />
            </div>
            <div className="w-[180px] space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                月額（円）
              </label>
              <CurrencyInput
                value={draftAmount}
                onChange={setDraftAmount}
              />
            </div>
            <Button type="button" onClick={addEntry} className="gap-1.5">
              <Plus className="size-4" />
              追加
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>項目名</TableHead>
                  <TableHead className="text-right w-[200px]">月額（円）</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      按分経費が未登録です。「＋ 追加」から登録してください。
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Input
                          value={entry.label}
                          onChange={(e) =>
                            updateEntry(entry.id, { label: e.target.value })
                          }
                          placeholder="項目名"
                        />
                      </TableCell>
                      <TableCell>
                        <CurrencyInput
                          value={entry.amount}
                          onChange={(amount) =>
                            updateEntry(entry.id, {
                              amount: Math.round(amount),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeEntry(entry.id)}
                          aria-label={`${entry.label || "項目"}を削除`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <span className="font-medium">月次集計への反映合計</span>
            <span className="text-lg font-bold tabular-nums">
              {formatYen(total)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
