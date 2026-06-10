"use client";

import { useState } from "react";
import { MasterSearchInput } from "@/components/master-search-input";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cleanupImportedJobMasterNoise } from "@/lib/job-master-cleanup";
import { filterShipperJobGroups } from "@/lib/master-search";
import { addJobToShipper, removeJobFromShipper } from "@/lib/masters";
import type { DailyRecord, MasterData } from "@/lib/types";

type Props = {
  masters: MasterData;
  records?: DailyRecord[];
  onMastersChange: (masters: MasterData) => void;
};

export function ShipperJobMasterCard({
  masters,
  records = [],
  onMastersChange,
}: Props) {
  const [selectedShipper, setSelectedShipper] = useState(
    masters.shippers[0] ?? "",
  );
  const [jobInput, setJobInput] = useState("");
  const [search, setSearch] = useState("");

  const activeShipper =
    selectedShipper && masters.shippers.includes(selectedShipper)
      ? selectedShipper
      : (masters.shippers[0] ?? "");

  const filteredJobGroups = filterShipperJobGroups(
    masters.shippers,
    masters.shipperJobs,
    search,
  );

  function handleAdd() {
    const job = jobInput.trim();
    if (!activeShipper || !job) return;
    onMastersChange(addJobToShipper(masters, activeShipper, job));
    setJobInput("");
  }

  function handleCleanupImportedNoise() {
    const { masters: cleaned, removed } = cleanupImportedJobMasterNoise(
      masters,
      { records },
    );
    if (removed.length === 0) {
      alert("削除対象の誤登録業務名は見つかりませんでした。");
      return;
    }
    const preview = removed
      .slice(0, 8)
      .map((r) => `・${r.shipper} / ${r.job}`)
      .join("\n");
    const more =
      removed.length > 8 ? `\n…他 ${removed.length - 8} 件` : "";
    if (
      confirm(
        `日報取込で誤って登録された業務名を ${removed.length} 件削除します。\n\n${preview}${more}\n\n実行しますか？`,
      )
    ) {
      onMastersChange(cleaned);
    }
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-lg">業務名（案件名）マスタ</CardTitle>
        <CardDescription>
          荷主を選択して業務名を登録します。FileMaker配車データの取込時のみ荷主・業務名が自動登録され、運転日報からはマスタを更新しません。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <MasterSearchInput
          value={search}
          onChange={setSearch}
          placeholder="業務名で検索..."
        />
        {masters.shippers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            先に荷主名を登録してください。
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
              <div className="space-y-2">
                <Label>荷主名</Label>
                <Select
                  value={activeShipper}
                  onValueChange={(v) => setSelectedShipper(v ?? "")}
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
              </div>
              <div className="space-y-2">
                <Label>業務名（案件名）</Label>
                <Input
                  value={jobInput}
                  placeholder="例: 常温配送・午前便"
                  onChange={(e) => setJobInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-9 shrink-0"
                onClick={handleAdd}
                disabled={!jobInput.trim()}
              >
                <Plus className="size-4" />
                <span className="sr-only">業務名を追加</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCleanupImportedNoise}
              >
                日報取込の誤登録を一括削除
              </Button>
              <p className="text-xs text-muted-foreground">
                FileMaker に無い配送先・個人名などを除去します
              </p>
            </div>

            {filteredJobGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {search.trim()
                  ? `「${search}」に一致する業務名はありません`
                  : "まだ業務名が登録されていません。"}
              </p>
            ) : (
              <div className="space-y-4">
                {filteredJobGroups.map(({ shipper, jobs }) => (
                    <div
                      key={shipper}
                      className="rounded-lg border bg-muted/20 p-3"
                    >
                      <p className="mb-2 text-sm font-semibold">{shipper}</p>
                      <ul className="space-y-1">
                        {jobs.map((job) => (
                          <li
                            key={`${shipper}-${job}`}
                            className="flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm"
                          >
                            <span>{job}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-destructive"
                              onClick={() => {
                                if (
                                  confirm(
                                    `「${shipper}」の業務「${job}」を削除しますか？`,
                                  )
                                ) {
                                  onMastersChange(
                                    removeJobFromShipper(
                                      masters,
                                      shipper,
                                      job,
                                    ),
                                  );
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                              削除
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
