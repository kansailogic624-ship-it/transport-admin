"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatYen } from "@/lib/currency-format";
import { formatDisplayDate } from "@/lib/excel-date";
import type { PreprocessResult } from "@/lib/import-preprocessor";
import {
  SHIGA_DELIVERY_STATUS_LABELS,
  SHIGA_DELIVERY_WARNING_LABELS,
  type ShigaDeliveryStagingRecord,
  type ShigaDeliveryWarningCode,
} from "@/lib/import-preprocessor/shiga-delivery/types";
import { cn } from "@/lib/utils";

type ShigaDeliveryReviewTableProps = {
  result: PreprocessResult | null;
  lastOpenedRecordId?: string | null;
  onOpenDetail?: (recordId: string) => void;
  onWarningClick?: (record: ShigaDeliveryStagingRecord) => void;
};

export function ShigaDeliveryReviewTable({
  result,
  lastOpenedRecordId,
  onOpenDetail,
  onWarningClick,
}: ShigaDeliveryReviewTableProps) {
  const [warningFilter, setWarningFilter] =
    useState<ShigaDeliveryWarningCode | null>(null);

  const records = useMemo(() => {
    const all = result?.shigaDeliveryRecords ?? [];
    if (!warningFilter) return all;
    return all.filter((r) => r.warningFlags.includes(warningFilter));
  }, [result?.shigaDeliveryRecords, warningFilter]);

  if (!result || result.sourceType !== "shiga_store_delivery") return null;

  const warningRecords = (result.shigaDeliveryRecords ?? []).filter(
    (r) => r.warningFlags.length > 0,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">3. 取込明細一覧</CardTitle>
        <CardDescription>
          行をクリックすると明細確認画面を開きます（{records.length} 件
          {warningFilter ? "・フィルタ中" : ""}）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {warningRecords.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <p className="mb-2 text-sm font-medium text-amber-950">
              警告一覧（{warningRecords.length} 件）
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "DAILY_TOTAL_MISMATCH",
                  "MONTHLY_TOTAL_MISMATCH",
                  "MISSING_BUSINESS_DATE",
                  "MANUAL_EDITED",
                ] as ShigaDeliveryWarningCode[]
              ).map((code) => {
                const count = (result.shigaDeliveryRecords ?? []).filter((r) =>
                  r.warningFlags.includes(code),
                ).length;
                if (count === 0) return null;
                return (
                  <button
                    key={code}
                    type="button"
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-amber-100",
                      warningFilter === code
                        ? "border-amber-500 bg-amber-200 text-amber-950"
                        : "border-amber-300 bg-white text-amber-900",
                    )}
                    onClick={() => {
                      setWarningFilter((prev) => (prev === code ? null : code));
                      const first = (result.shigaDeliveryRecords ?? []).find(
                        (r) => r.warningFlags.includes(code),
                      );
                      if (first) onWarningClick?.(first);
                    }}
                  >
                    {SHIGA_DELIVERY_WARNING_LABELS[code]} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th className="px-2 py-2">日付</th>
                <th className="px-2 py-2">曜日</th>
                <th className="px-2 py-2">業者名</th>
                <th className="px-2 py-2">車種</th>
                <th className="px-2 py-2">コース名</th>
                <th className="px-2 py-2">経由地</th>
                <th className="px-2 py-2 text-right">台数</th>
                <th className="px-2 py-2 text-right">運賃</th>
                <th className="px-2 py-2 text-right">残業時間</th>
                <th className="px-2 py-2 text-right">残業代</th>
                <th className="px-2 py-2 text-right">高速代</th>
                <th className="px-2 py-2 text-right">支払合計</th>
                <th className="px-2 py-2">状態</th>
                <th className="px-2 py-2">警告</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className={cn(
                    "cursor-pointer border-t transition-colors hover:bg-indigo-50/60",
                    lastOpenedRecordId === record.id && "bg-indigo-50",
                  )}
                  onClick={() => onOpenDetail?.(record.id)}
                >
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatDisplayDate(record.businessDate)}
                  </td>
                  <td className="px-2 py-2">{record.weekday || "—"}</td>
                  <td className="px-2 py-2">{record.vendorName}</td>
                  <td className="px-2 py-2">{record.vehicleType}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {record.courseName}
                  </td>
                  <td className="px-2 py-2 max-w-[180px] truncate">
                    {record.routeName}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {record.unitCount}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatYen(record.freightAmount)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {record.overtimeHours}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatYen(record.overtimePayAmount)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatYen(record.tollAmount)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatYen(record.coursePayTotal)}
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-2 py-2">
                    <WarningCell record={record} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  status,
}: {
  status: ShigaDeliveryStagingRecord["status"];
}) {
  const variant =
    status === "warning"
      ? "destructive"
      : status === "skipped"
        ? "secondary"
        : "outline";
  return (
    <Badge variant={variant} className="text-xs">
      {SHIGA_DELIVERY_STATUS_LABELS[status]}
    </Badge>
  );
}

function WarningCell({ record }: { record: ShigaDeliveryStagingRecord }) {
  if (record.warningFlags.length === 0) {
    return <span className="text-emerald-700">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {record.warningFlags.map((flag) => (
        <Badge key={flag} variant="outline" className="text-xs text-amber-900">
          {SHIGA_DELIVERY_WARNING_LABELS[flag]}
        </Badge>
      ))}
    </div>
  );
}
