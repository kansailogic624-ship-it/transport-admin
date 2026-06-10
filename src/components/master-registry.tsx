"use client";

import { useEffect, useRef, useState } from "react";
import { cleanupImportedJobMasterNoise } from "@/lib/job-master-cleanup";
import { MasterSearchInput } from "@/components/master-search-input";
import { Plus, Trash2 } from "lucide-react";
import { BackupControls } from "@/components/backup-controls";
import { ShipperJobMasterCard } from "@/components/shipper-job-master-card";
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
  addShipperWithEmptyJobs,
  addUniqueToList,
  removeFromList,
  removeShipper,
  vehicleExistsInList,
} from "@/lib/masters";
import { displayVehicleNumber } from "@/lib/import-match-keys";
import {
  loadVehicleExpenses,
  saveVehicleExpenses,
} from "@/services/firestore-storage";
import {
  planVehicleMasterEdit,
  rewriteVehicleNumberInExpenses,
  rewriteVehicleNumberInRecords,
  sanitizeVehicleInput,
} from "@/lib/vehicle-master-merge";
import { upsertVehicleMappingRule } from "@/lib/vehicle-mapping-rules";
import { matchesTextSearch, matchesVehicleSearch } from "@/lib/master-search";
import { PAGE_GRID_2COL_CLASS } from "@/lib/page-layout";
import type { DailyRecord, MasterData } from "@/lib/types";

type MasterRegistryProps = {
  records: DailyRecord[];
  masters: MasterData;
  onRecordsChange: (records: DailyRecord[]) => void;
  onMastersChange: (masters: MasterData) => void;
  onRestore: (records: DailyRecord[], masters: MasterData) => void;
};

export function MasterRegistry({
  records,
  masters,
  onRecordsChange,
  onMastersChange,
  onRestore,
}: MasterRegistryProps) {
  const cleanupRan = useRef(false);

  useEffect(() => {
    if (cleanupRan.current) return;
    const { masters: cleaned, removed } = cleanupImportedJobMasterNoise(
      masters,
      { records },
    );
    if (removed.length === 0) return;
    cleanupRan.current = true;
    onMastersChange(cleaned);
  }, [masters, onMastersChange]);

  return (
    <div className="space-y-6">
      <BackupControls
        records={records}
        masters={masters}
        onRestore={onRestore}
      />

      <p className="text-sm text-muted-foreground">
        ここで登録した内容が、日次入力・管理チェックのプルダウンに反映されます。業務名は荷主ごとに登録し、入力時は荷主を選んでから業務名を選びます。
      </p>

      <div className={PAGE_GRID_2COL_CLASS}>
        <MasterListCard
          title="協力会社（傭車先）"
          description="傭車運行で選択する協力会社名"
          placeholder="例: 〇〇運輸"
          searchPlaceholder="協力会社で検索..."
          items={masters.partners}
          onAdd={(name) =>
            onMastersChange({
              ...masters,
              partners: addUniqueToList(masters.partners, name),
            })
          }
          onRemove={(name) =>
            onMastersChange({
              ...masters,
              partners: removeFromList(masters.partners, name),
            })
          }
        />

        <MasterListCard
          title="社員名（ドライバー）"
          description="自社便のドライバー・乗務員選択肢"
          placeholder="例: 山田 太郎"
          searchPlaceholder="社員名で検索..."
          items={masters.drivers}
          onAdd={(name) =>
            onMastersChange({
              ...masters,
              drivers: addUniqueToList(masters.drivers, name),
            })
          }
          onRemove={(name) => {
            const { [name]: _, ...employeeSalaries } = masters.employeeSalaries;
            onMastersChange({
              ...masters,
              drivers: removeFromList(masters.drivers, name),
              employeeSalaries,
            });
          }}
        />

        <VehicleMasterListCard
          vehicles={masters.vehicles}
          records={records}
          onRecordsChange={onRecordsChange}
          onMastersChange={(vehicles) =>
            onMastersChange({ ...masters, vehicles })
          }
        />

        <MasterListCard
          title="荷主名"
          description="運行業務の荷主選択肢（業務名の親）"
          placeholder="例: 株式会社ABC物流"
          searchPlaceholder="荷主名で検索..."
          items={masters.shippers}
          onAdd={(name) =>
            onMastersChange(addShipperWithEmptyJobs(masters, name))
          }
          onRemove={(name) => onMastersChange(removeShipper(masters, name))}
        />

        <ShipperJobMasterCard
          masters={masters}
          records={records}
          onMastersChange={onMastersChange}
        />
      </div>
    </div>
  );
}

function VehicleMasterListCard({
  vehicles,
  records,
  onRecordsChange,
  onMastersChange,
}: {
  vehicles: string[];
  records: DailyRecord[];
  onRecordsChange: (records: DailyRecord[]) => void;
  onMastersChange: (vehicles: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const filteredVehicles = vehicles.filter((item) =>
    matchesVehicleSearch(search, item),
  );

  function draftFor(item: string): string {
    return drafts[item] ?? item;
  }

  function clearDraft(original: string) {
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[original];
      return copy;
    });
  }

  function handleAdd() {
    const name = sanitizeVehicleInput(input);
    if (!name) return;
    if (vehicleExistsInList(vehicles, name)) {
      alert("同じ車両番号（表記ゆれ含む）が既に登録されています。");
      return;
    }
    onMastersChange(addUniqueToList(vehicles, name));
    setInput("");
  }

  async function commitEdit(original: string) {
    if (saving) return;
    const plan = planVehicleMasterEdit(vehicles, original, draftFor(original));
    if (!plan) {
      clearDraft(original);
      return;
    }

    if (plan.mode === "merge") {
      const ok = confirm(
        `「${original}」の売上・経費データを、既存の「${plan.mergeTo}」に統合します。\n重複するマスタ行「${original}」は削除されます。よろしいですか？`,
      );
      if (!ok) {
        clearDraft(original);
        return;
      }
    }

    setSaving(true);
    try {
      const { records: nextRecords, updatedTripCount } =
        rewriteVehicleNumberInRecords(records, plan.mergeFrom, plan.mergeTo);

      const expenses = await loadVehicleExpenses();
      const { expenses: nextExpenses, updatedCount: expenseCount } =
        rewriteVehicleNumberInExpenses(
          expenses,
          plan.mergeFrom,
          plan.mergeTo,
        );
      if (expenseCount > 0) {
        await saveVehicleExpenses(nextExpenses);
      }

      upsertVehicleMappingRule(plan.mergeFrom, plan.mergeTo);
      onMastersChange(plan.vehicles);
      if (updatedTripCount > 0) {
        onRecordsChange(nextRecords);
      }

      if (plan.mode === "merge") {
        alert(
          `統合完了: 日次実績 ${updatedTripCount} 件 / 車両経費 ${expenseCount} 件を「${plan.mergeTo}」へ移行しました。`,
        );
      }
      clearDraft(original);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">車両番号</CardTitle>
        <CardDescription>
          運行業務の車両選択肢。各行を直接編集できます。既存車両と同名になった場合は売上・経費を自動統合します。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MasterSearchInput
          value={search}
          onChange={setSearch}
          placeholder="車両番号で検索..."
        />
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例: 京都100い84-73"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" onClick={handleAdd} size="icon" variant="secondary">
            <Plus className="size-4" />
            <span className="sr-only">追加</span>
          </Button>
        </div>
        {vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだ登録がありません</p>
        ) : filteredVehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            「{search}」に一致する車両番号はありません
          </p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {filteredVehicles.map((item) => (
              <li
                key={item}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted/50"
              >
                <Input
                  className="h-8 min-w-0 flex-1 text-sm"
                  value={draftFor(item)}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [item]: e.target.value,
                    }))
                  }
                  onBlur={() => commitEdit(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-destructive"
                  onClick={() => {
                    if (confirm(`「${item}」をマスタから削除しますか？`)) {
                      onMastersChange(removeFromList(vehicles, item));
                      setDrafts((prev) => {
                        const copy = { ...prev };
                        delete copy[item];
                        return copy;
                      });
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                  削除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MasterListCard({
  title,
  description,
  placeholder,
  searchPlaceholder,
  items,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  placeholder: string;
  searchPlaceholder: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const filteredItems = items.filter((item) => matchesTextSearch(search, item));

  const handleAdd = () => {
    if (!input.trim()) return;
    onAdd(input);
    setInput("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MasterSearchInput
          value={search}
          onChange={setSearch}
          placeholder={searchPlaceholder}
        />
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" onClick={handleAdd} size="icon" variant="secondary">
            <Plus className="size-4" />
            <span className="sr-only">追加</span>
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだ登録がありません</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            「{search}」に一致する項目はありません
          </p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {filteredItems.map((item) => (
              <li
                key={item}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <span>{item}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive"
                  onClick={() => {
                    if (confirm(`「${item}」をマスタから削除しますか？`)) {
                      onRemove(item);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                  削除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
