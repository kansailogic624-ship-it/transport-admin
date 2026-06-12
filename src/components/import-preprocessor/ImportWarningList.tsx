"use client";

import type { ReactNode } from "react";
import { AlertTriangle, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  PreprocessResult,
  PreprocessWarningStatus,
} from "@/lib/import-preprocessor";
import { WarningDetailTable } from "./WarningDetailTable";

type ImportWarningListProps = {
  result: PreprocessResult | null;
  onSetWarningStatus: (
    recordIds: string[],
    status: PreprocessWarningStatus,
  ) => void;
};

export function ImportWarningList({
  result,
  onSetWarningStatus,
}: ImportWarningListProps) {
  if (!result) return null;

  const warningDetails = result.warningDetails ?? [];
  const statusSummary = result.warningStatusSummary ?? {
    pending: 0,
    confirmedDuplicate: 0,
    confirmedValid: 0,
    ignored: 0,
  };

  const hasContent =
    result.errors.length > 0 || warningDetails.length > 0 || statusSummary.confirmedDuplicate > 0 || statusSummary.confirmedValid > 0;

  if (!hasContent) return null;

  return (
    <Card id="warning-details">
      <CardHeader>
        <CardTitle className="text-base">5. エラー・警告一覧</CardTitle>
        <CardDescription>
          エラー {result.errors.length} 件
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <StatusChip label="未確認" value={statusSummary.pending} accent="pending" />
          <StatusChip
            label="確認済み重複"
            value={statusSummary.confirmedDuplicate}
            accent="duplicate"
          />
          <StatusChip
            label="確認済み正常"
            value={statusSummary.confirmedValid}
            accent="valid"
          />
        </div>

        {result.errors.length > 0 && (
          <IssueBlock
            title="エラー"
            icon={<XCircle className="size-4 text-red-600" />}
            items={result.errors.map((e) =>
              formatIssue(e.message, e.sourceRowNumber),
            )}
            className="border-red-200 bg-red-50/50 text-red-900"
          />
        )}
        {warningDetails.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-medium text-amber-900">
              <AlertTriangle className="size-4 text-amber-600" />
              警告詳細（確認待ち）
            </p>
            <WarningDetailTable
              rows={warningDetails}
              onSetStatus={onSetWarningStatus}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "pending" | "duplicate" | "valid";
}) {
  const color =
    accent === "pending"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : accent === "duplicate"
        ? "border-slate-300 bg-slate-50 text-slate-800"
        : "border-emerald-300 bg-emerald-50 text-emerald-900";

  return (
    <div className={`rounded-md border px-3 py-2 ${color}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatIssue(message: string, row?: number): string {
  return row != null ? `行${row}: ${message}` : message;
}

function IssueBlock({
  title,
  icon,
  items,
  className,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  className: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${className}`}>
      <p className="mb-2 flex items-center gap-2 font-medium">
        {icon}
        {title}
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
        {items.map((item, i) => (
          <li key={`${i}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
