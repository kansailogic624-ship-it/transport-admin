import { sumAllocationExpenses } from "./allocation-expense-utils";
import { getRecordAlerts } from "./alerts";
import { reportStatusLabel } from "./report-status";
import {
  allocateExpenseByVehicleDays,
  allocateShipperNetProfit,
  buildMonthlySummary,
  type MonthlySummary,
  type ShipperProfitRow,
  type VehicleAllocationRow,
} from "./monthly-aggregate";
import { calculateTripLaborCost, formatCrewSummary } from "./labor-cost";
import { isPartnerTrip } from "./run-type";
import {
  parsePartnerFee,
  parseRevenue,
  parseTollFee,
  tripDistanceKm,
} from "./trip-utils";
import type { DailyRecord, MasterData } from "./types";

function escapeCsvCell(value: string | number | boolean): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: (string | number | boolean)[][]): string {
  return rows
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}

export function downloadCsv(filename: string, content: string): void {
  const bom = "\uFEFF";
  const blob = new Blob([bom + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportDailyRecordsCsv(
  records: DailyRecord[],
  yearMonth?: string,
  masters?: MasterData,
): void {
  const filtered = yearMonth
    ? records.filter((r) => r.date.startsWith(yearMonth))
    : records;

  const header = [
    "日付",
    "ドライバー",
    "出勤",
    "退勤",
    "点呼",
    "日報提出",
    "業務番号",
    "運行区分",
    "協力会社",
    "傭車料金",
    "車両番号",
    "荷主名",
    "業務名",
    "売上",
    "高速代",
    "乗務員",
    "業務人件費",
    "開始メーター",
    "終了メーター",
    "走行km",
    "警告",
  ];

  const rows: (string | number | boolean)[][] = [header];

  for (const record of filtered) {
    const alerts = getRecordAlerts(record)
      .map((a) => a.message)
      .join(" / ");

    if (record.trips.length === 0) {
      rows.push([
        record.date,
        record.driverName,
        record.clockIn,
        record.clockOut,
        record.rollCallTime,
        reportStatusLabel(record.reportStatus),
        "",
        "",
        "",
        "",
        0,
        0,
        "",
        0,
        "",
        "",
        0,
        alerts,
      ]);
      continue;
    }

    record.trips.forEach((trip, index) => {
      const ym = record.date.slice(0, 7);
      const labor =
        masters && yearMonth
          ? calculateTripLaborCost(trip, records, ym, masters).total
          : masters
            ? calculateTripLaborCost(trip, records, ym, masters).total
            : 0;

      rows.push([
        record.date,
        record.driverName,
        record.clockIn,
        record.clockOut,
        record.rollCallTime,
        reportStatusLabel(record.reportStatus),
        index + 1,
        isPartnerTrip(trip) ? "傭車" : "自社",
        trip.partnerName ?? "",
        parsePartnerFee(trip.partnerFee),
        trip.vehicleNumber,
        trip.shipperName,
        trip.jobName ?? "",
        parseRevenue(trip.revenue),
        parseTollFee(trip.tollFee),
        formatCrewSummary(trip.crew ?? []),
        labor,
        trip.startMeter,
        trip.endMeter,
        tripDistanceKm(trip),
        alerts,
      ]);
    });
  }

  const suffix = yearMonth ? `_${yearMonth}` : "_all";
  downloadCsv(`運行実績一覧${suffix}.csv`, rowsToCsv(rows));
}

export function exportMonthlySummaryCsv(summary: MonthlySummary): void {
  const ym = summary.yearMonth;
  const sections: (string | number | boolean)[][] = [
    ["月次サマリー", ym],
    ["記録件数", summary.recordCount],
    ["総売上", summary.totalRevenue],
    ["総走行km", summary.totalKm],
    [],
    ["【ドライバー別】"],
    ["ドライバー", "総売上", "総走行km", "稼働日数"],
    ...summary.drivers.map((d) => [
      d.driverName,
      d.totalRevenue,
      d.totalKm,
      d.operatingDays,
    ]),
    [],
    ["【車両別】"],
    ["車両番号", "総売上", "総走行km", "稼働日数"],
    ...summary.vehicles.map((v) => [
      v.vehicleNumber,
      v.totalRevenue,
      v.totalKm,
      v.operatingDays,
    ]),
    [],
    ["【荷主別】"],
    ["荷主名", "総売上", "総高速代", "総人件費", "総傭車料", "運行回数"],
    ...summary.shippers.map((s) => [
      s.shipperName,
      s.totalRevenue,
      s.totalToll,
      s.totalLabor,
      s.totalPartnerFee,
      s.tripCount,
    ]),
    [],
    ["【協力会社（傭車）別】"],
    ["協力会社", "総売上", "総傭車料", "粗利益", "運行回数"],
    ...summary.partners.map((p) => [
      p.partnerName,
      p.totalRevenue,
      p.totalPartnerFee,
      p.grossProfit,
      p.tripCount,
    ]),
  ];

  downloadCsv(`月次集計_${ym}.csv`, rowsToCsv(sections));
}

export function exportAllocationCsv(
  yearMonth: string,
  expenseLabel: string,
  totalExpense: number,
  allocation: VehicleAllocationRow[],
): void {
  const rows: (string | number | boolean)[][] = [
    ["月次経費按分", yearMonth],
    ["経費名目", expenseLabel],
    ["総請求額", totalExpense],
    ["按分基準", "車両稼働日数"],
    [],
    [
      "車両番号",
      "稼働日数",
      "按分比率",
      "総売上",
      "按分経費",
      "粗利益",
      "総走行km",
    ],
    ...allocation.map((v) => [
      v.vehicleNumber,
      v.operatingDays,
      `${(v.allocationRatio * 100).toFixed(1)}%`,
      v.totalRevenue,
      v.allocatedExpense,
      v.grossProfit,
      v.totalKm,
    ]),
  ];

  downloadCsv(`月次按分_${yearMonth}.csv`, rowsToCsv(rows));
}

export function exportShipperProfitCsv(
  yearMonth: string,
  expenseLabel: string,
  totalExpense: number,
  rows: ShipperProfitRow[],
): void {
  const sections: (string | number | boolean)[][] = [
    ["荷主別真の粗利益", yearMonth],
    ["経費名目", expenseLabel],
    ["月次経費総額", totalExpense],
    ["按分基準", "荷主売上比率"],
    [],
    [
      "荷主名",
      "運行回数",
      "売上比率",
      "総売上",
      "総高速代",
      "総人件費",
      "総傭車料",
      "按分経費",
      "差引粗利益",
    ],
    ...rows.map((r) => [
      r.shipperName,
      r.tripCount,
      `${(r.revenueRatio * 100).toFixed(1)}%`,
      r.totalRevenue,
      r.totalToll,
      r.totalLabor,
      r.totalPartnerFee,
      r.allocatedExpense,
      r.netGrossProfit,
    ]),
  ];
  downloadCsv(`荷主別粗利益_${yearMonth}.csv`, rowsToCsv(sections));
}

export function exportPartnerSummaryCsv(summary: MonthlySummary): void {
  const ym = summary.yearMonth;
  const sections: (string | number | boolean)[][] = [
    ["協力会社（傭車）別集計", ym],
    [],
    ["協力会社", "総売上", "総傭車料", "粗利益", "運行回数"],
    ...summary.partners.map((p) => [
      p.partnerName,
      p.totalRevenue,
      p.totalPartnerFee,
      p.grossProfit,
      p.tripCount,
    ]),
  ];
  downloadCsv(`協力会社別_${ym}.csv`, rowsToCsv(sections));
}

export function exportFullMonthlyPack(
  records: DailyRecord[],
  yearMonth: string,
  masters: MasterData,
): void {
  const summary = buildMonthlySummary(records, yearMonth, masters);
  exportDailyRecordsCsv(records, yearMonth, masters);
  exportMonthlySummaryCsv(summary);
  exportPartnerSummaryCsv(summary);
  const totalExpense = sumAllocationExpenses(masters);
  if (totalExpense > 0) {
    const allocation = allocateExpenseByVehicleDays(
      summary.vehicles,
      totalExpense,
    );
    exportAllocationCsv(yearMonth, "按分費合計", totalExpense, allocation);
    const shipperProfit = allocateShipperNetProfit(
      summary.shippers,
      totalExpense,
    );
    exportShipperProfitCsv(
      yearMonth,
      "按分費合計",
      totalExpense,
      shipperProfit,
    );
  }
}
