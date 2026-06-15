"use client";

import { useMemo, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MasterSearchInput } from "@/components/master-search-input";
import { matchesTextSearch } from "@/lib/master-search";
import type { PartnerJobOption } from "@/lib/partner-company-job-options";
import { cn } from "@/lib/utils";

type PartnerJobMultiSelectProps = {
  options: PartnerJobOption[];
  selected: string[];
  loading?: boolean;
  orphanNames?: string[];
  onAdd: (jobName: string) => void;
  onRemove: (jobName: string) => void;
  onNavigateToJobLedger?: () => void;
};

export function PartnerJobMultiSelect({
  options,
  selected,
  loading = false,
  orphanNames = [],
  onAdd,
  onRemove,
  onNavigateToJobLedger,
}: PartnerJobMultiSelectProps) {
  const [search, setSearch] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const ledgerCount = useMemo(
    () => options.filter((o) => o.source === "job_ledger").length,
    [options],
  );

  const filtered = useMemo(() => {
    const selectedSet = new Set(selected);
    return options.filter((opt) => {
      if (selectedSet.has(opt.jobName)) return false;
      if (!search.trim()) return true;
      return (
        matchesTextSearch(search, opt.jobName) ||
        (opt.shipperName != null && matchesTextSearch(search, opt.shipperName))
      );
    });
  }, [options, selected, search]);

  const handleAdd = (jobName: string) => {
    onAdd(jobName);
    setActionMessage(`「${jobName}」を追加しました`);
  };

  const handleRemove = (jobName: string) => {
    onRemove(jobName);
    setActionMessage(`「${jobName}」を解除しました`);
  };

  const handleNavigate = () => {
    onNavigateToJobLedger?.();
    setActionMessage("業務台帳タブへ移動します");
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">業務台帳を読み込み中…</p>
    );
  }

  return (
    <div className="space-y-3">
      {ledgerCount === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">業務台帳で先に登録してください</p>
          <p className="mt-1 text-xs text-amber-900/80">
            依頼業務は業務台帳（JobDetail）を正として選択します。Joshin①〜⑥
            は滋賀店配突合の互換候補として表示されます。
          </p>
          {onNavigateToJobLedger && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 gap-1 border-amber-400"
              onClick={handleNavigate}
            >
              <ExternalLink className="size-3.5" />
              業務台帳へ移動
            </Button>
          )}
        </div>
      )}

      {(selected.length > 0 || orphanNames.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {selected.map((jobName) => {
            const opt = options.find((o) => o.jobName === jobName);
            return (
              <Badge
                key={jobName}
                variant="secondary"
                className="gap-1 bg-emerald-100 pr-1 text-emerald-950"
              >
                {jobName}
                {opt?.courseId && (
                  <span className="text-[10px] text-emerald-700">滋賀突合</span>
                )}
                <button
                  type="button"
                  className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-200"
                  aria-label={`${jobName} を解除`}
                  onClick={() => handleRemove(jobName)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
          {orphanNames.map((jobName) => (
            <Badge
              key={`orphan-${jobName}`}
              variant="outline"
              className="gap-1 border-dashed pr-1"
            >
              {jobName}
              <span className="text-[10px] text-muted-foreground">
                台帳外
              </span>
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                aria-label={`${jobName} を解除`}
                onClick={() => handleRemove(jobName)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <MasterSearchInput
        value={search}
        onChange={setSearch}
        placeholder="業務名・荷主名で検索..."
      />

      {actionMessage && (
        <p className="text-xs text-indigo-800">{actionMessage}</p>
      )}

      <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 p-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {search.trim()
              ? "検索に一致する業務がありません"
              : "追加できる業務がありません"}
          </p>
        ) : (
          filtered.map((opt) => (
            <button
              key={`${opt.source}-${opt.jobName}`}
              type="button"
              className={cn(
                "flex w-full cursor-pointer items-start justify-between gap-2 rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors",
                "hover:border-indigo-200 hover:bg-indigo-50",
              )}
              onClick={() => handleAdd(opt.jobName)}
            >
              <span>
                <span className="font-medium">{opt.jobName}</span>
                {opt.shipperName && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    荷主: {opt.shipperName}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {opt.source === "shiga_compat" ? "滋賀互換" : "業務台帳"}
              </span>
            </button>
          ))
        )}
      </div>

      {ledgerCount > 0 && onNavigateToJobLedger && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1 text-muted-foreground"
          onClick={handleNavigate}
        >
          <ExternalLink className="size-3.5" />
          業務台帳で業務を追加・編集
        </Button>
      )}
    </div>
  );
}
