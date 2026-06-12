"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatYen } from "@/lib/currency-format";
import {
  addPriceRevision,
  formatPriceHistoryDate,
  JOB_PRICE_ORIGIN_DATE,
  mergeNotesIntoPriceHistory,
  normalizeJobDetail,
  sortPriceHistory,
  syncRevenueFromHistory,
} from "@/lib/job-price-history";
import { isJobIdTaken } from "@/lib/job-ledger-utils";
import type { JobDetail, JobPriceHistoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export type JobFormDraft = {
  jobId: string;
  shipperName: string;
  jobName: string;
  revenue: string;
  notes: string;
};

type JobFormModalProps = {
  mode: "create" | "edit";
  job: JobDetail | null;
  suggestedJobId: string;
  jobs: JobDetail[];
  saving?: boolean;
  onSave: (job: JobDetail) => Promise<void>;
  onClose: () => void;
};

function toDraft(job: JobDetail | null, suggestedJobId: string): JobFormDraft {
  if (!job) {
    return {
      jobId: suggestedJobId,
      shipperName: "",
      jobName: "",
      revenue: "",
      notes: "",
    };
  }
  const normalized = normalizeJobDetail(job);
  return {
    jobId: normalized.jobId,
    shipperName: normalized.shipperName,
    jobName: normalized.jobName,
    revenue: normalized.revenue ? String(normalized.revenue) : "",
    notes: normalized.notes,
  };
}

function parseRevenue(value: string): number {
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function buildJobFromState(
  draft: JobFormDraft,
  existing: JobDetail | null,
  priceHistory: JobPriceHistoryEntry[],
): JobDetail {
  const jobId = draft.jobId.trim();
  const sortedHistory = sortPriceHistory(priceHistory);
  const revenue = syncRevenueFromHistory(
    sortedHistory,
    parseRevenue(draft.revenue),
  );

  const base: JobDetail = {
    id: existing?.id ?? jobId,
    jobId,
    shipperName: draft.shipperName.trim(),
    jobName: draft.jobName.trim(),
    revenue,
    priceHistory: sortedHistory,
    notes: draft.notes.trim(),
    updatedAt: new Date().toISOString(),
  };

  return mergeNotesIntoPriceHistory(base);
}

export function JobFormModal({
  mode,
  job,
  suggestedJobId,
  jobs,
  saving = false,
  onSave,
  onClose,
}: JobFormModalProps) {
  const [draft, setDraft] = useState<JobFormDraft>(() =>
    toDraft(job, suggestedJobId),
  );
  const [priceHistory, setPriceHistory] = useState<JobPriceHistoryEntry[]>(() =>
    job ? normalizeJobDetail(job).priceHistory : [],
  );
  const [newRevisionPrice, setNewRevisionPrice] = useState("");
  const [newRevisionDate, setNewRevisionDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = job ? normalizeJobDetail(job) : null;
    setDraft(toDraft(job, suggestedJobId));
    setPriceHistory(normalized?.priceHistory ?? []);
    setNewRevisionPrice("");
    setNewRevisionDate("");
    setError(null);
  }, [job, suggestedJobId, mode]);

  const title = useMemo(
    () =>
      mode === "create" ? "新規業務登録" : `${job?.jobName ?? "業務"} の編集`,
    [mode, job?.jobName],
  );

  const displayHistory = useMemo(
    () =>
      [...priceHistory].sort((a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom),
      ),
    [priceHistory],
  );

  const currentRevenue = useMemo(() => {
    if (priceHistory.length > 0) {
      return syncRevenueFromHistory(priceHistory, parseRevenue(draft.revenue));
    }
    return parseRevenue(draft.revenue);
  }, [priceHistory, draft.revenue]);

  const handleAddRevision = () => {
    const price = parseRevenue(newRevisionPrice);
    if (price <= 0) {
      setError("新単価を入力してください。");
      return;
    }
    if (!newRevisionDate) {
      setError("適用開始日を選択してください。");
      return;
    }

    const tempJob: JobDetail = {
      id: job?.id ?? draft.jobId,
      jobId: draft.jobId,
      shipperName: draft.shipperName,
      jobName: draft.jobName,
      revenue: currentRevenue,
      priceHistory,
      notes: draft.notes,
      updatedAt: new Date().toISOString(),
    };

    const updated = addPriceRevision(tempJob, price, newRevisionDate);
    setPriceHistory(updated.priceHistory);
    setDraft((d) => ({ ...d, revenue: String(updated.revenue) }));
    setNewRevisionPrice("");
    setNewRevisionDate("");
    setError(null);
  };

  const handleSubmit = async () => {
    const jobId = draft.jobId.trim();
    if (!jobId) {
      setError("業務IDを入力してください。");
      return;
    }
    if (!draft.jobName.trim()) {
      setError("業務名を入力してください。");
      return;
    }
    if (isJobIdTaken(jobs, jobId, mode === "edit" ? job?.id : undefined)) {
      setError(`業務ID「${jobId}」は既に使用されています。`);
      return;
    }

    let history = [...priceHistory];
    if (mode === "create") {
      const initialPrice = parseRevenue(draft.revenue);
      if (initialPrice > 0 && history.length === 0) {
        history = [
          { price: initialPrice, effectiveFrom: JOB_PRICE_ORIGIN_DATE },
        ];
      }
    }

    setError(null);
    try {
      await onSave(buildJobFromState(draft, job, history));
    } catch (err) {
      console.error(err);
      setError("保存に失敗しました。");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "modalIn 0.18s ease-out both" }}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              単価改定は履歴として保存され、過去の実績日付には当時の単価が適用されます。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="閉じる"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="job-id">業務ID</Label>
              <Input
                id="job-id"
                value={draft.jobId}
                disabled={mode === "edit" || saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, jobId: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shipper-name">荷主名</Label>
              <Input
                id="shipper-name"
                value={draft.shipperName}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, shipperName: e.target.value }))
                }
                placeholder="例: ニトリ"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="job-name">業務名</Label>
              <Input
                id="job-name"
                value={draft.jobName}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, jobName: e.target.value }))
                }
                placeholder="例: ニトリ京都①"
              />
            </div>

            {mode === "create" ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="job-revenue">初期単価（円）</Label>
                <Input
                  id="job-revenue"
                  type="number"
                  value={draft.revenue}
                  disabled={saving}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, revenue: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
            ) : (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>現在の契約単価</Label>
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium tabular-nums">
                  {formatYen(currentRevenue)}
                </p>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="job-notes">備考</Label>
              <Input
                id="job-notes"
                value={draft.notes}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, notes: e.target.value }))
                }
                placeholder="例: 2023.05.01より改定 28000→28800"
              />
              <p className="text-xs text-muted-foreground">
                備考の改定表記は保存時に単価履歴へ自動整理されます。
              </p>
            </div>
          </div>

          {(mode === "edit" || priceHistory.length > 0) && (
            <section className="mt-6 space-y-3 rounded-lg border bg-muted/20 p-4">
              <h3 className="text-sm font-semibold">単価の改定履歴</h3>

              {displayHistory.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {displayHistory.map((entry) => (
                    <li
                      key={`${entry.effectiveFrom}-${entry.price}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border bg-background px-3 py-2"
                    >
                      <div>
                        <span className="font-medium tabular-nums">
                          {formatYen(entry.price)}
                        </span>
                        <span className="ml-2 text-muted-foreground">
                          適用開始: {formatPriceHistoryDate(entry.effectiveFrom)}
                        </span>
                      </div>
                      {entry.note && (
                        <span className="text-xs text-muted-foreground">
                          {entry.note}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  まだ改定履歴がありません。
                </p>
              )}

              {mode === "edit" && (
                <div className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-revision-price">新単価（円）</Label>
                    <Input
                      id="new-revision-price"
                      type="number"
                      value={newRevisionPrice}
                      disabled={saving}
                      onChange={(e) => setNewRevisionPrice(e.target.value)}
                      placeholder="例: 28800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-revision-date">適用開始日</Label>
                    <Input
                      id="new-revision-date"
                      type="date"
                      value={newRevisionDate}
                      disabled={saving}
                      onChange={(e) => setNewRevisionDate(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    onClick={handleAddRevision}
                  >
                    単価を改定
                  </Button>
                </div>
              )}
            </section>
          )}

          {error && (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            閉じる
          </Button>
          <Button
            type="button"
            disabled={saving}
            className={cn(mode === "create" && "bg-blue-600 hover:bg-blue-700")}
            onClick={() => handleSubmit().catch(console.error)}
          >
            {saving ? "保存中…" : mode === "create" ? "登録" : "保存"}
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
}
