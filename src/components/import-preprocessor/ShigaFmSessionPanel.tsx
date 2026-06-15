"use client";

import { useMemo, useState } from "react";
import {
  Cloud,
  CloudOff,
  Database,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ShigaFmSessionSummary } from "@/lib/shiga-fm/session-types";
import {
  formatMonthPeriodLabel,
  formatSessionTimestamp,
} from "@/lib/shiga-fm/session-utils";
import { cn } from "@/lib/utils";
import { RECONCILE_CONTRACT_REFRESH_NOTE } from "@/lib/shiga-fm/fm-shortage-ui-messages";

export type ShigaFmSessionPanelProps = {
  busy: boolean;
  sessionDirty: boolean;
  activeMonthPeriod: string | null;
  loadedSessionMeta: ShigaFmSessionSummary | null;
  savedSessions: ShigaFmSessionSummary[];
  canSave: boolean;
  canReconcileFromCache: boolean;
  onSave: () => void;
  onLoad: (monthPeriod: string) => void;
  onReconcile: () => void;
  onDelete: (monthPeriod: string) => void;
  onRefreshList: () => void;
};

export function ShigaFmSessionPanel({
  busy,
  sessionDirty,
  activeMonthPeriod,
  loadedSessionMeta,
  savedSessions,
  canSave,
  canReconcileFromCache,
  onSave,
  onLoad,
  onReconcile,
  onDelete,
  onRefreshList,
}: ShigaFmSessionPanelProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const loadTarget = selectedMonth || savedSessions[0]?.monthPeriod || "";

  const persistenceBadge = useMemo(() => {
    if (loadedSessionMeta && !sessionDirty) {
      return { label: "Firestore保存済み", tone: "saved" as const };
    }
    if (sessionDirty) {
      return { label: "未保存の変更あり", tone: "warn" as const };
    }
    if (activeMonthPeriod) {
      return { label: "一時データ", tone: "temp" as const };
    }
    return { label: "未保存", tone: "muted" as const };
  }, [loadedSessionMeta, sessionDirty, activeMonthPeriod]);

  return (
    <Card className="border-sky-200 bg-sky-50/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="size-4 text-sky-700" />
              月度セッション（Firestore）
            </CardTitle>
            <CardDescription>
              取込データと突合結果を月度単位で保存・復元します
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              persistenceBadge.tone === "saved" &&
                "border-sky-300 bg-sky-100 text-sky-900",
              persistenceBadge.tone === "warn" &&
                "border-amber-300 bg-amber-50 text-amber-900",
              persistenceBadge.tone === "temp" &&
                "border-slate-300 bg-slate-100 text-slate-700",
            )}
          >
            {persistenceBadge.tone === "saved" ? (
              <Cloud className="mr-1 inline size-3" />
            ) : (
              <CloudOff className="mr-1 inline size-3" />
            )}
            {persistenceBadge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="表示中の月度"
            value={
              activeMonthPeriod
                ? formatMonthPeriodLabel(activeMonthPeriod)
                : "—"
            }
          />
          <Stat
            label="最終保存日時"
            value={formatSessionTimestamp(loadedSessionMeta?.savedAt)}
          />
          <Stat
            label="最終突合日時"
            value={formatSessionTimestamp(loadedSessionMeta?.reconciledAt)}
          />
          <Stat
            label="保存済み月度"
            value={
              savedSessions.length > 0
                ? `${savedSessions.length} 件`
                : "なし"
            }
          />
        </div>

        {savedSessions.length > 0 && (
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              保存済み月度一覧
            </p>
            <ul className="max-h-36 space-y-1 overflow-y-auto text-sm">
              {savedSessions.map((s) => (
                <li
                  key={s.monthPeriod}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1",
                    s.monthPeriod === activeMonthPeriod && "bg-sky-50",
                  )}
                >
                  <span className="font-medium">
                    {formatMonthPeriodLabel(s.monthPeriod)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    保存 {formatSessionTimestamp(s.savedAt)} / 突合{" "}
                    {s.reconcileRowCount}件
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-[200px] flex-1 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              読み込む月度
            </p>
            <Select
              value={loadTarget || undefined}
              onValueChange={(v) => setSelectedMonth(v ?? "")}
              disabled={savedSessions.length === 0 || busy}
            >
              <SelectTrigger>
                <SelectValue placeholder="月度を選択" />
              </SelectTrigger>
              <SelectContent>
                {savedSessions.map((s) => (
                  <SelectItem key={s.monthPeriod} value={s.monthPeriod}>
                    {formatMonthPeriodLabel(s.monthPeriod)}（
                    {formatSessionTimestamp(s.savedAt)}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="default"
              className="gap-1"
              disabled={!canSave || busy}
              onClick={onSave}
            >
              <Save className="size-4" />
              この月度を保存
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-1"
              disabled={!loadTarget || busy}
              onClick={() => onLoad(loadTarget)}
            >
              <Cloud className="size-4" />
              保存済みを読み込む
            </Button>
            <Button
              type="button"
              variant={canReconcileFromCache ? "default" : "outline"}
              className={cn(
                "gap-1",
                canReconcileFromCache &&
                  "bg-violet-700 text-white hover:bg-violet-800",
              )}
              disabled={!canReconcileFromCache || busy}
              onClick={onReconcile}
            >
              <RefreshCw className="size-4" />
              再突合する
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={busy}
              onClick={onRefreshList}
              title="一覧を更新"
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-1 text-destructive hover:text-destructive"
              disabled={!loadTarget || busy}
              onClick={() => onDelete(loadTarget)}
            >
              <Trash2 className="size-4" />
              削除
            </Button>
          </div>
        </div>

        {canReconcileFromCache && (
          <p className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-xs text-violet-950">
            {RECONCILE_CONTRACT_REFRESH_NOTE}
          </p>
        )}

        {sessionDirty && (
          <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
            未保存の変更があります。ページを離れる前に「この月度を保存」を実行してください。
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}
