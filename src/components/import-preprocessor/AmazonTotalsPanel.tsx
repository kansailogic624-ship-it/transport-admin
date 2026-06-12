"use client";

import { formatYen } from "@/lib/currency-format";
import type { AmazonAmountTotals, AmazonTotalsComparison } from "@/lib/import-preprocessor/types";

type AmazonTotalsPanelProps = {
  totals: AmazonTotalsComparison;
};

export function AmazonTotalsPanel({ totals }: AmazonTotalsPanelProps) {
  const { excel, imported, byOperation, matches } = totals;
  const mismatch = matches.allMatch === false;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CountCard label="件数" value={imported.count} />
        <CountCard label="自社件数" value={imported.ownCount} accent="own" />
        <CountCard label="傭車件数" value={imported.partnerCount} accent="partner" />
        <CountCard label="判定不明" value={imported.unknownCount} accent="unknown" />
      </div>

      {excel.found && (
        <div
          className={`rounded-lg border p-4 ${
            mismatch
              ? "border-red-300 bg-red-50/50"
              : "border-emerald-300 bg-emerald-50/40"
          }`}
        >
          <p className="mb-3 text-sm font-medium">
            Excel合計との照合
            <span
              className={`ml-2 rounded px-2 py-0.5 text-xs ${
                mismatch
                  ? "bg-red-200 text-red-900"
                  : matches.allMatch
                    ? "bg-emerald-200 text-emerald-900"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {mismatch ? "不一致" : matches.allMatch ? "一致" : "一部未読取"}
            </span>
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <TotalsBlock title="Excel合計" totals={excel} isExcel />
            <TotalsBlock title="取込合計" totals={imported} />
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <TotalsSection title="全体" totals={byOperation.all} variant="all" />
        <TotalsSection title="自社" totals={byOperation.own} variant="own" />
        <TotalsSection
          title="傭車"
          totals={byOperation.partner}
          variant="partner"
        />
      </div>
    </div>
  );
}

function CountCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "own" | "partner" | "unknown";
}) {
  const color =
    accent === "own"
      ? "text-sky-700"
      : accent === "partner"
        ? "text-violet-700"
        : accent === "unknown"
          ? "text-orange-700"
          : "";
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function TotalsSection({
  title,
  totals,
  variant,
}: {
  title: string;
  totals: AmazonAmountTotals;
  variant: "all" | "own" | "partner";
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <AmountRow label="売上合計" value={totals.sales} />
        {variant !== "own" && (
          <AmountRow label="支払合計" value={totals.payment} />
        )}
        {variant !== "partner" && (
          <AmountRow label="人件費合計" value={totals.laborCost} />
        )}
        <AmountRow label="Excel差異" value={totals.difference} />
        <AmountRow label="粗利（計算）" value={totals.grossProfit} />
      </dl>
    </div>
  );
}

function TotalsBlock({
  title,
  totals,
  isExcel = false,
}: {
  title: string;
  totals: AmazonAmountTotals | AmazonTotalsComparison["excel"];
  isExcel?: boolean;
}) {
  const sales = isExcel
    ? (totals as AmazonTotalsComparison["excel"]).sales
    : (totals as AmazonAmountTotals).sales;
  const payment = isExcel
    ? (totals as AmazonTotalsComparison["excel"]).payment
    : (totals as AmazonAmountTotals).payment;
  const difference = isExcel
    ? (totals as AmazonTotalsComparison["excel"]).difference
    : (totals as AmazonAmountTotals).difference;
  const laborCost = isExcel
    ? (totals as AmazonTotalsComparison["excel"]).laborCost
    : (totals as AmazonAmountTotals).laborCost;

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <dl className="space-y-1 text-sm">
        <AmountRow label="売上" value={sales} nullable={isExcel} />
        <AmountRow label="支払" value={payment} nullable={isExcel} />
        <AmountRow label="Excel差異" value={difference} nullable={isExcel} />
        {laborCost != null && laborCost > 0 && (
          <AmountRow label="人件費" value={laborCost} nullable={isExcel} />
        )}
      </dl>
    </div>
  );
}

function AmountRow({
  label,
  value,
  nullable = false,
}: {
  label: string;
  value: number | null;
  nullable?: boolean;
}) {
  const display =
    nullable && value == null
      ? "—"
      : formatYen(value ?? 0);
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium">{display}</dd>
    </div>
  );
}
