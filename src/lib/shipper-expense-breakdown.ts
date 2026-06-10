export type ExpenseBreakdownLine = {
  key: "labor" | "fuel" | "toll" | "partner" | "other";
  label: string;
  amount: number;
};

export type ShipperExpenseBreakdown = {
  lines: ExpenseBreakdownLine[];
  total: number;
};

export function buildShipperExpenseBreakdown(parts: {
  labor: number;
  fuel: number;
  toll: number;
  partner?: number;
  other?: number;
}): ShipperExpenseBreakdown {
  const lines: ExpenseBreakdownLine[] = [
    {
      key: "labor",
      label: "人件費（ドライバー給与・運行手当等）",
      amount: parts.labor,
    },
    {
      key: "fuel",
      label: "燃料代（ガソリン・軽油）",
      amount: parts.fuel,
    },
    {
      key: "toll",
      label: "高速道路利用代",
      amount: parts.toll,
    },
    {
      key: "partner",
      label: "傭車費（協力会社への支払運賃）",
      amount: parts.partner ?? 0,
    },
  ];

  const other = parts.other ?? 0;
  if (other > 0) {
    lines.push({
      key: "other",
      label: "その他経費（修繕費按分など）",
      amount: other,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { lines, total };
}

export function formatYearMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  if (!y || !m) return yearMonth;
  return `${y}年${m}月`;
}

export function expenseSharePct(amount: number, total: number): number {
  if (total <= 0 || amount <= 0) return 0;
  return (amount / total) * 100;
}
