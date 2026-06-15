"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatYen } from "@/lib/currency-format";
import type { PreprocessResult } from "@/lib/import-preprocessor";
import { cn } from "@/lib/utils";

type ShigaDeliverySummaryPanelProps = {
  result: PreprocessResult | null;
};

export function ShigaDeliverySummaryPanel({
  result,
}: ShigaDeliverySummaryPanelProps) {
  if (!result || result.sourceType !== "shiga_store_delivery") return null;

  const totals = result.shigaDeliveryTotals;
  if (!totals) return null;

  const monthlyMatch = totals.reconciliation.matches.allMatch;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">2. 取込結果サマリー（滋賀店配）</CardTitle>
        <CardDescription>{result.sourceFileName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Stat
            label="取込対象日数"
            value={`${totals.importedDayCount}（稼働${totals.importedActiveDayCount}日）`}
            isText
          />
          <Stat label="取込明細件数" value={String(totals.importedDetailCount)} />
          <Stat label="台数合計" value={String(totals.unitCountTotal)} />
          <Stat label="運賃合計" value={formatYen(totals.freightTotal)} isText />
          <Stat
            label="残業代合計"
            value={formatYen(totals.overtimePayTotal)}
            isText
          />
          <Stat label="高速代合計" value={formatYen(totals.tollTotal)} isText />
          <Stat label="支払合計" value={formatYen(totals.payTotal)} isText />
          <Stat
            label="不一致件数"
            value={String(
              totals.dailyMismatchCount + totals.monthlyMismatchCount,
            )}
            accent={totals.dailyMismatchCount + totals.monthlyMismatchCount > 0 ? "warn" : "ok"}
          />
          <Stat label="スキップ行数" value={String(totals.skippedRowCount)} />
        </div>

        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            コース別件数
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {totals.courseCounts.map((course) => (
              <Stat
                key={course.courseId}
                label={course.courseName}
                value={`${course.count} 件`}
                isText
              />
            ))}
          </div>
        </div>

        {totals.excelMonthlyTotals.found && (
          <div
            className={cn(
              "rounded-lg border p-4",
              monthlyMatch === false
                ? "border-red-300 bg-red-50/50"
                : monthlyMatch === true
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-muted bg-muted/20",
            )}
          >
            <p className="mb-2 text-sm font-medium">
              Excel月次合計との照合
              <span
                className={cn(
                  "ml-2 rounded px-2 py-0.5 text-xs",
                  monthlyMatch === false
                    ? "bg-red-200 text-red-900"
                    : monthlyMatch === true
                      ? "bg-emerald-200 text-emerald-900"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {monthlyMatch === false
                  ? "不一致"
                  : monthlyMatch === true
                    ? "一致"
                    : "一部未読取"}
              </span>
            </p>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <span>
                車格金額: Excel {formatYen(totals.excelMonthlyTotals.vehicleAmount ?? 0)}
              </span>
              <span>
                高速代: Excel {formatYen(totals.excelMonthlyTotals.toll ?? 0)}
              </span>
              <span>
                台数: Excel {totals.excelMonthlyTotals.unitCount ?? "—"}
              </span>
              <span>
                支払合計: Excel {formatYen(totals.excelMonthlyTotals.payTotal ?? 0)}
              </span>
            </div>
            {totals.reconciliation.mismatchReasons.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm text-red-800">
                {totals.reconciliation.mismatchReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  isText,
  accent,
}: {
  label: string;
  value: string;
  isText?: boolean;
  accent?: "ok" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-3 py-2",
        accent === "warn" && "border-amber-300 bg-amber-50/40",
        accent === "ok" && "border-emerald-200",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-semibold",
          isText ? "text-sm" : "text-lg tabular-nums",
          accent === "warn" && "text-amber-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}
