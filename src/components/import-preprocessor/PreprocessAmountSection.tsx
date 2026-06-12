"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatYen } from "@/lib/currency-format";
import type { PreprocessResult } from "@/lib/import-preprocessor";
import { AmazonTotalsPanel } from "./AmazonTotalsPanel";

type PreprocessAmountSectionProps = {
  result: PreprocessResult | null;
};

export function PreprocessAmountSection({
  result,
}: PreprocessAmountSectionProps) {
  if (!result) return null;

  if (result.sourceType === "filemaker_dispatch" && result.fmTotals) {
    const t = result.fmTotals;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">3. 金額サマリー（FM配車）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AmountStat label="売上合計" value={formatYen(t.sales)} />
            <AmountStat label="高速代合計" value={formatYen(t.tollFee)} />
            <AmountStat label="自社件数" value={String(t.ownCount)} />
            <AmountStat label="傭車件数" value={String(t.partnerCount)} />
            <AmountStat label="判定不明" value={String(t.unknownCount)} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result.amazonTotals) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">3. 金額サマリー</CardTitle>
      </CardHeader>
      <CardContent>
        <AmazonTotalsPanel totals={result.amazonTotals} />
      </CardContent>
    </Card>
  );
}

function AmountStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
