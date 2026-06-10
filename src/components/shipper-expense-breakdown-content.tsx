"use client";

import { formatYen } from "@/lib/currency-format";
import {
  expenseSharePct,
  formatYearMonthLabel,
  type ShipperExpenseBreakdown,
} from "@/lib/shipper-expense-breakdown";

type Props = {
  shipperName: string;
  yearMonth: string;
  jobName?: string;
  breakdown: ShipperExpenseBreakdown;
};

export function ShipperExpenseBreakdownContent({
  shipperName,
  yearMonth,
  jobName,
  breakdown,
}: Props) {
  const period = formatYearMonthLabel(yearMonth);
  const title = jobName
    ? `${shipperName} / ${jobName}`
    : shipperName;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold leading-snug">{title}</p>
        <p className="text-[10px] text-muted-foreground">経費内訳（{period}）</p>
      </div>
      <table className="w-full table-fixed text-[11px]">
        <colgroup>
          <col />
          <col className="w-[4.75rem]" />
          <col className="w-[2.75rem]" />
        </colgroup>
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-1 pr-1.5 text-left font-medium">項目</th>
            <th className="pb-1 text-right font-medium">金額</th>
            <th className="pb-1 pl-0.5 text-right font-medium">比率</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.lines.map((line) => (
            <tr key={line.key} className="border-b border-border/50">
              <td className="py-1 pr-1.5 align-top leading-snug whitespace-normal">
                {line.label}
              </td>
              <td className="py-1 text-right align-top tabular-nums">
                {formatYen(line.amount)}
              </td>
              <td className="py-1 pl-0.5 text-right align-top tabular-nums text-muted-foreground">
                {breakdown.total > 0
                  ? `${expenseSharePct(line.amount, breakdown.total).toFixed(1)}%`
                  : "—"}
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="pt-1 pr-1.5">合計</td>
            <td className="pt-1 text-right tabular-nums">
              {formatYen(breakdown.total)}
            </td>
            <td className="pt-1 pl-0.5 text-right tabular-nums">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
