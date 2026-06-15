"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ShigaFmReconciliationResult } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import type { ShigaFmSessionSummary } from "@/lib/shiga-fm/session-types";
import {
  formatMonthPeriodLabel,
  formatSessionTimestamp,
} from "@/lib/shiga-fm/session-utils";
import { cn } from "@/lib/utils";

type ShigaFmDataStatusPanelProps = {
  result: ShigaFmReconciliationResult | null;
  assignmentCount: number;
  contractCount: number;
  hasShigaData: boolean;
  hasFmData: boolean;
  shigaFileName: string | null;
  fmFileName: string | null;
  activeMonthPeriod: string | null;
  loadedSessionMeta: ShigaFmSessionSummary | null;
  sessionDirty: boolean;
  savedSessionCount: number;
};

type StatusRow = {
  label: string;
  value: string;
  badge: string;
  badgeTone: "temp" | "saved" | "warn" | "muted";
};

function toneClass(tone: StatusRow["badgeTone"]): string {
  if (tone === "temp") return "bg-slate-100 text-slate-700 border-slate-300";
  if (tone === "saved") return "bg-sky-100 text-sky-800 border-sky-300";
  if (tone === "warn") return "bg-orange-100 text-orange-900 border-orange-300";
  return "bg-muted text-muted-foreground";
}

export function ShigaFmDataStatusPanel({
  result,
  assignmentCount,
  contractCount,
  hasShigaData,
  hasFmData,
  shigaFileName,
  fmFileName,
  activeMonthPeriod,
  loadedSessionMeta,
  sessionDirty,
  savedSessionCount,
}: ShigaFmDataStatusPanelProps) {
  const rows: StatusRow[] = [];

  const sessionBadge = loadedSessionMeta && !sessionDirty ? "saved" : "temp";
  const sessionBadgeLabel =
    loadedSessionMeta && !sessionDirty
      ? "Firestore"
      : sessionDirty
        ? "未保存"
        : "一時データ";

  rows.push({
    label: "表示中の月度",
    value: activeMonthPeriod
      ? formatMonthPeriodLabel(activeMonthPeriod)
      : "—",
    badge: activeMonthPeriod ? sessionBadgeLabel : "—",
    badgeTone:
      loadedSessionMeta && !sessionDirty
        ? "saved"
        : sessionDirty
          ? "warn"
          : "muted",
  });

  rows.push({
    label: "最終保存日時",
    value: formatSessionTimestamp(loadedSessionMeta?.savedAt),
    badge: loadedSessionMeta ? "Firestore" : "—",
    badgeTone: loadedSessionMeta ? "saved" : "muted",
  });

  rows.push({
    label: "最終突合日時",
    value: formatSessionTimestamp(loadedSessionMeta?.reconciledAt),
    badge: loadedSessionMeta?.reconciledAt ? "Firestore" : "—",
    badgeTone: loadedSessionMeta?.reconciledAt ? "saved" : "muted",
  });

  rows.push({
    label: "保存済み月度数",
    value: `${savedSessionCount} 件`,
    badge: savedSessionCount > 0 ? "Firestore" : "—",
    badgeTone: savedSessionCount > 0 ? "saved" : "muted",
  });

  if (hasShigaData) {
    rows.push({
      label: "滋賀店配データ",
      value: `${result?.shigaPreview?.rowCount ?? loadedSessionMeta?.shigaRecordCount ?? "—"}件${shigaFileName ? ` / ${shigaFileName}` : ""}`,
      badge: sessionBadgeLabel,
      badgeTone: sessionBadge,
    });
  } else {
    rows.push({
      label: "滋賀店配データ",
      value: "未取込",
      badge: "—",
      badgeTone: "muted",
    });
  }

  if (hasFmData) {
    rows.push({
      label: "FMスケジュール",
      value: `${result?.fmPreview?.rowCount ?? loadedSessionMeta?.fmRecordCount ?? "—"}件${fmFileName ? ` / ${fmFileName}` : ""}`,
      badge: sessionBadgeLabel,
      badgeTone: sessionBadge,
    });
  } else {
    rows.push({
      label: "FMスケジュール",
      value: "未取込",
      badge: "—",
      badgeTone: "muted",
    });
  }

  if (result) {
    rows.push({
      label: "突合結果",
      value: `${result.rows.length}件`,
      badge: sessionBadgeLabel,
      badgeTone: sessionBadge,
    });
    if (result.inputMode === "both") {
      rows.push({
        label: "FM不足",
        value: `${result.totals.fmShortageCount}件`,
        badge: result.totals.fmShortageCount > 0 ? "要確認" : "なし",
        badgeTone: result.totals.fmShortageCount > 0 ? "warn" : "muted",
      });
      rows.push({
        label: "未登録業務",
        value: `${result.totals.unregisteredCount}件`,
        badge: result.totals.unregisteredCount > 0 ? "要対応" : "なし",
        badgeTone: result.totals.unregisteredCount > 0 ? "warn" : "muted",
      });
      if (result.diagnostics) {
        rows.push({
          label: "自社社員（診断）",
          value: `${result.diagnostics.employeeCount}件`,
          badge: "診断",
          badgeTone: "muted",
        });
        rows.push({
          label: "傭車（診断）",
          value: `${result.diagnostics.partnerCount}件`,
          badge: "診断",
          badgeTone: "muted",
        });
      }
    }
  } else {
    rows.push({
      label: "突合結果",
      value: "未作成",
      badge: "—",
      badgeTone: "muted",
    });
  }

  rows.push({
    label: "手入力データ",
    value:
      assignmentCount > 0
        ? `Firestore保存済み ${assignmentCount}件`
        : "未保存",
    badge: assignmentCount > 0 ? "Firestore" : "—",
    badgeTone: assignmentCount > 0 ? "saved" : "muted",
  });

  rows.push({
    label: "契約単価マスタ",
    value:
      contractCount > 0
        ? `Firestore保存済み ${contractCount}件`
        : "未登録",
    badge: contractCount > 0 ? "Firestore" : "—",
    badgeTone: contractCount > 0 ? "saved" : "muted",
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">取込データの状態</CardTitle>
        <CardDescription>
          一時データ・Firestore保存済み・未保存の区別を表示します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
            >
              <span className="font-medium">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="max-w-[240px] truncate text-muted-foreground">
                  {row.value}
                </span>
                <Badge
                  variant="outline"
                  className={cn("text-xs", toneClass(row.badgeTone))}
                >
                  {row.badge}
                </Badge>
              </div>
            </li>
          ))}
        </ul>

        <p className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-xs leading-relaxed text-sky-950">
          「この月度を保存」で滋賀店配・FM前処理データと突合結果を Firestore
          に保存できます。ページ再読込後は「保存済みを読み込む」で作業を再開できます。手入力・契約単価は従来どおり別途
          Firestore に保存されます。
        </p>
      </CardContent>
    </Card>
  );
}
