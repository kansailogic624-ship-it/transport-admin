"use client";

import { formatYen } from "@/lib/currency-format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyFinancialSnapshot } from "@/lib/monthly-overview-metrics";

type SummaryChartProps = {
  data: { name: string; value: number }[];
  valueLabel?: string;
  color?: string;
  formatValue?: (n: number) => string;
};

const DEFAULT_COLOR = "hsl(var(--primary))";

const PIE_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(280 65% 55%)",
  "hsl(0 72% 51%)",
  "hsl(199 89% 48%)",
  "hsl(160 60% 40%)",
  "hsl(24 95% 53%)",
  "hsl(262 52% 47%)",
  "hsl(173 58% 39%)",
];

export function SummaryPieChart({
  data,
  valueLabel = "金額",
  formatValue = (n) => formatYen(n),
}: Omit<SummaryChartProps, "color">) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        表示するデータがありません
      </p>
    );
  }

  const chartData = data.map((d) => ({
    name: d.name,
    value: d.value,
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={56}
            outerRadius={108}
            paddingAngle={2}
          >
            {chartData.map((_, index) => (
              <Cell
                key={index}
                fill={PIE_COLORS[index % PIE_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [formatValue(Number(value)), valueLabel]}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            formatter={(value) =>
              String(value).length > 14
                ? `${String(value).slice(0, 13)}…`
                : String(value)
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyTrendComboChart({
  snapshots,
}: {
  snapshots: MonthlyFinancialSnapshot[];
}) {
  if (snapshots.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        表示するデータがありません
      </p>
    );
  }

  const chartData = snapshots.map((s) => ({
    month: s.yearMonth.replace("-", "/"),
    revenue: s.totalRevenue,
    totalExpenses: s.totalExpenses,
    netProfit: s.netProfit,
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) =>
              Number(v) >= 10000
                ? `${Math.round(Number(v) / 10000)}万`
                : String(v)
            }
          />
          <Tooltip
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                revenue: "売上",
                totalExpenses: "総経費",
                netProfit: "純利益",
              };
              return [formatYen(Number(value)), labels[String(name)] ?? name];
            }}
          />
          <Legend />
          <Bar
            dataKey="revenue"
            name="売上"
            fill="hsl(221 83% 53%)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="totalExpenses"
            name="総経費"
            fill="hsl(25 95% 53%)"
            radius={[4, 4, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="netProfit"
            name="純利益"
            stroke="hsl(142 71% 35%)"
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

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
