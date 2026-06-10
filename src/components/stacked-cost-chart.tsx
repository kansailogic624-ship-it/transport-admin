"use client";

import { formatYen } from "@/lib/currency-format";
import type { StackedCostChartRow } from "@/lib/dashboard-analytics";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SEGMENTS: {
  key: keyof Omit<StackedCostChartRow, "name" | "fullName">;
  color: string;
}[] = [
  { key: "人件費", color: "hsl(0 72% 51%)" },
  { key: "燃料代", color: "hsl(38 92% 50%)" },
  { key: "高速代", color: "hsl(262 83% 58%)" },
  { key: "修繕費", color: "hsl(25 95% 53%)" },
  { key: "純利益", color: "hsl(142 71% 45%)" },
];

type StackedCostChartProps = {
  data: StackedCostChartRow[];
};

export function StackedCostChart({ data }: StackedCostChartProps) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        表示するデータがありません
      </p>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 48 }}>
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
            formatter={(value, name) => [formatYen(Number(value)), String(name)]}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.fullName ?? ""
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {SEGMENTS.map((seg) => (
            <Bar
              key={seg.key}
              dataKey={seg.key}
              stackId="cost"
              fill={seg.color}
              radius={seg.key === "純利益" ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
