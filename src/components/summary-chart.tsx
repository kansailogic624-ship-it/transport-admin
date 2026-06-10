"use client";

import { formatYen } from "@/lib/currency-format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SummaryChartProps = {
  data: { name: string; value: number }[];
  valueLabel?: string;
  color?: string;
  formatValue?: (n: number) => string;
};

const DEFAULT_COLOR = "hsl(var(--primary))";

export function SummaryBarChart({
  data,
  valueLabel = "金額",
  color = DEFAULT_COLOR,
  formatValue = (n) => formatYen(n),
}: SummaryChartProps) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        表示するデータがありません
      </p>
    );
  }

  const chartData = data.map((d) => ({
    name:
      d.name.length > 12 ? `${d.name.slice(0, 11)}…` : d.name,
    fullName: d.name,
    value: d.value,
  }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            angle={-25}
            textAnchor="end"
            height={56}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) =>
              Number(v) >= 10000
                ? `${Math.round(Number(v) / 10000)}万`
                : String(v)
            }
          />
          <Tooltip
            formatter={(value) => [
              formatValue(Number(value)),
              valueLabel,
            ]}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.fullName ?? ""
            }
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
