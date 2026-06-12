"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatYen } from "@/lib/currency-format";
import {
  FM_SCHEDULE_FILTER_LABELS,
  type FmScheduleViewFilter,
} from "@/lib/import-preprocessor/fm-employee-schedule/filters";
import { FM_SCHEDULE_SUMMARY_CARDS } from "@/lib/import-preprocessor/fm-employee-schedule/summary-filter-registry";
import type { PreprocessResult } from "@/lib/import-preprocessor";
import { cn } from "@/lib/utils";

type PreprocessSummarySectionProps = {
  result: PreprocessResult | null;
  fmActiveFilter?: FmScheduleViewFilter;
  onFmFilterChange?: (filter: FmScheduleViewFilter) => void;
};

export function PreprocessSummarySection({
  result,
  fmActiveFilter = "all",
  onFmFilterChange,
}: PreprocessSummarySectionProps) {
  if (!result) return null;

  if (result.sourceType === "filemaker_employee_schedule") {
    const totals = result.fmScheduleTotals;
    const filterable = Boolean(onFmFilterChange);

    const overviewCards = FM_SCHEDULE_SUMMARY_CARDS.filter(
      (c) => c.group === "overview" || c.group === "joint",
    );
    const warningCards = FM_SCHEDULE_SUMMARY_CARDS.filter(
      (c) => c.group === "warnings",
    );
    const manualCards = FM_SCHEDULE_SUMMARY_CARDS.filter(
      (c) => c.group === "manual",
    );
    const unresolvedCards = FM_SCHEDULE_SUMMARY_CARDS.filter(
      (c) => c.group === "unresolved",
    );

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">2. サマリー（FM社員スケジュール）</CardTitle>
          <CardDescription>
            {result.sourceFileName}
            {filterable && (
              <span className="mt-1 block text-xs">
                カードをクリックすると確認表をフィルタします
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {overviewCards.map((card) => (
              <Stat
                key={card.id}
                label={card.label}
                value={
                  totals
                    ? card.getValue(totals, { totalRows: result.totalRows })
                    : 0
                }
                accent={card.accent}
                isText={card.isText}
                filterKey={card.filterKey ?? undefined}
                activeFilter={fmActiveFilter}
                onFilter={onFmFilterChange}
                filterable={filterable && card.filterable}
              />
            ))}
            <Stat
              label="会社売上合計"
              value={formatYen(totals?.sales ?? 0)}
              accent="ok"
              isText
            />
          </div>

          <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {warningCards.map((card) => (
              <Stat
                key={card.id}
                label={card.label}
                value={
                  totals
                    ? card.getValue(totals, { totalRows: result.totalRows })
                    : 0
                }
                accent={card.accent}
                isText={card.isText}
                filterKey={card.filterKey ?? undefined}
                activeFilter={fmActiveFilter}
                onFilter={onFmFilterChange}
                filterable={filterable && card.filterable}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {manualCards.map((card) => (
              <Stat
                key={card.id}
                label={card.label}
                value={
                  totals
                    ? card.getValue(totals, { totalRows: result.totalRows })
                    : 0
                }
                filterKey={card.filterKey ?? undefined}
                activeFilter={fmActiveFilter}
                onFilter={onFmFilterChange}
                filterable={filterable && card.filterable}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {unresolvedCards.map((card) => (
              <Stat
                key={card.id}
                label={card.label}
                value={
                  totals
                    ? card.getValue(totals, { totalRows: result.totalRows })
                    : 0
                }
                accent={card.accent}
                filterKey={card.filterKey ?? undefined}
                activeFilter={fmActiveFilter}
                onFilter={onFmFilterChange}
                filterable={filterable && card.filterable}
              />
            ))}
          </div>

          {totals?.revenueReconciliation && (
            <div className="mt-4 space-y-3 border-t pt-4">
              <p className="text-sm font-medium">売上検算</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Stat
                  label="Excel原文売上合計"
                  value={formatYen(totals.revenueReconciliation.excelOriginalTotal)}
                  isText
                />
                <Stat
                  label="会社売上合計"
                  value={formatYen(totals.revenueReconciliation.companyTotal)}
                  accent="ok"
                  isText
                />
                <Stat
                  label="社員別売上合計"
                  value={formatYen(totals.revenueReconciliation.employeeShareTotal)}
                  isText
                />
                <Stat
                  label="検算結果"
                  value={
                    totals.revenueReconciliation.isBalanced ? "一致" : "不一致"
                  }
                  accent={
                    totals.revenueReconciliation.isBalanced ? "ok" : "warn"
                  }
                  isText
                  filterKey="revenue_reconciliation"
                  activeFilter={fmActiveFilter}
                  onFilter={onFmFilterChange}
                  filterable={filterable}
                />
              </div>
              {!totals.revenueReconciliation.isBalanced && (
                <p className="text-sm text-amber-800">
                  REVENUE_RECONCILIATION_MISMATCH:{" "}
                  {totals.revenueReconciliation.mismatchReasons.join(" / ")}
                </p>
              )}
            </div>
          )}
          {filterable && fmActiveFilter !== "all" && (
            <p className="mt-3 text-xs text-muted-foreground">
              フィルタ中:{" "}
              {fmActiveFilter === "attendance_holiday"
                ? "勤怠・休み行のみ"
                : FM_SCHEDULE_FILTER_LABELS[fmActiveFilter]}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const own = result.records.filter((r) => r.operationType === "own").length;
  const partner = result.records.filter((r) => r.operationType === "partner").length;
  const unknown = result.records.filter((r) => r.operationType === "unknown").length;
  const statusSummary = result.warningStatusSummary ?? {
    pending: 0,
    confirmedDuplicate: 0,
    confirmedValid: 0,
    ignored: 0,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">2. サマリー</CardTitle>
        <CardDescription>{result.sourceFileName}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="読込行数" value={result.totalRows} />
          <Stat label="正常行数" value={result.successRows} accent="ok" />
          <Stat
            label="警告行数"
            value={statusSummary.pending}
            accent="warn"
          />
          <Stat label="エラー行数" value={result.errorRows} accent="err" />
          <Stat label="自社件数" value={own} accent="own" />
          <Stat label="傭車件数" value={partner} accent="partner" />
          <Stat label="判定不明" value={unknown} accent="unknown" />
          <Stat label="重複候補" value={result.duplicateRows} accent="warn" />
        </div>
        {result.sourceType === "filemaker_dispatch" && result.fmTotals && (
          <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label="売上合計"
              value={formatYen(result.fmTotals.sales)}
              accent="ok"
              isText
            />
            <Stat
              label="高速代合計"
              value={formatYen(result.fmTotals.tollFee)}
              isText
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  accent,
  isText,
  filterKey,
  activeFilter,
  onFilter,
  filterable,
}: {
  label: string;
  value: number | string;
  accent?: "ok" | "warn" | "err" | "own" | "partner" | "unknown";
  isText?: boolean;
  filterKey?: FmScheduleViewFilter;
  activeFilter?: FmScheduleViewFilter;
  onFilter?: (filter: FmScheduleViewFilter) => void;
  filterable?: boolean;
}) {
  const color =
    accent === "ok"
      ? "text-emerald-700"
      : accent === "warn"
        ? "text-amber-700"
        : accent === "err"
          ? "text-red-700"
          : accent === "own"
            ? "text-sky-700"
            : accent === "partner"
              ? "text-violet-700"
              : accent === "unknown"
                ? "text-orange-700"
                : "";

  const isSelected =
    filterable && filterKey != null && activeFilter === filterKey;
  const isClickable = filterable && filterKey != null && onFilter != null;

  const className = cn(
    "rounded-md border px-3 py-2 text-left transition-colors",
    isClickable && "cursor-pointer hover:border-sky-400 hover:bg-sky-50/60",
    isSelected
      ? "border-sky-500 bg-sky-100/80 ring-2 ring-sky-400/40"
      : "border bg-muted/30",
  );

  const content = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`${isText ? "text-lg" : "text-xl"} font-semibold tabular-nums ${color}`}
      >
        {value}
      </p>
    </>
  );

  if (!isClickable) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onFilter(filterKey)}
      aria-pressed={isSelected}
    >
      {content}
    </button>
  );
}
