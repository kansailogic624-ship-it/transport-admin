"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatYen } from "@/lib/currency-format";
import { formatDisplayDate } from "@/lib/excel-date";
import type { ShigaDeliveryManualEditInput } from "@/lib/import-preprocessor";
import {
  SHIGA_DELIVERY_WARNING_LABELS,
  type ShigaDeliveryStagingRecord,
} from "@/lib/import-preprocessor/shiga-delivery/types";

type ShigaDeliveryDetailDialogProps = {
  record: ShigaDeliveryStagingRecord | null;
  open: boolean;
  saveFeedback?: string | null;
  onClose: () => void;
  onSave?: (recordId: string, edit: ShigaDeliveryManualEditInput) => void;
  onRevert?: (recordId: string) => void;
};

export function ShigaDeliveryDetailDialog({
  record,
  open,
  saveFeedback,
  onClose,
  onSave,
  onRevert,
}: ShigaDeliveryDetailDialogProps) {
  const [unitCount, setUnitCount] = useState("");
  const [freightAmount, setFreightAmount] = useState("");
  const [overtimeHours, setOvertimeHours] = useState("");
  const [overtimePayAmount, setOvertimePayAmount] = useState("");
  const [tollAmount, setTollAmount] = useState("");
  const [coursePayTotal, setCoursePayTotal] = useState("");

  useEffect(() => {
    if (!record) return;
    setUnitCount(String(record.unitCount));
    setFreightAmount(String(record.freightAmount));
    setOvertimeHours(String(record.overtimeHours));
    setOvertimePayAmount(String(record.overtimePayAmount));
    setTollAmount(String(record.tollAmount));
    setCoursePayTotal(String(record.coursePayTotal));
  }, [record]);

  if (!open || !record) return null;

  const handleSave = () => {
    onSave?.(record.id, {
      unitCount: Number(unitCount) || 0,
      freightAmount: Number(freightAmount) || 0,
      overtimeHours: Number(overtimeHours) || 0,
      overtimePayAmount: Number(overtimePayAmount) || 0,
      tollAmount: Number(tollAmount) || 0,
      coursePayTotal: Number(coursePayTotal) || 0,
      freightPlusOvertimeAmount:
        (Number(freightAmount) || 0) + (Number(overtimePayAmount) || 0),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shiga-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b bg-indigo-50/80 px-5 py-4">
          <h2
            id="shiga-detail-title"
            className="text-xl font-semibold text-indigo-950"
          >
            明細確認
          </h2>
          <p className="mt-1 text-sm text-indigo-900/80">
            {formatDisplayDate(record.businessDate)}（{record.weekday}）/{" "}
            {record.courseName} / 行 {record.sourceRowNumber}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="業者コード" value={record.vendorCode} />
            <Info label="業者名" value={record.vendorName} />
            <Info label="車種" value={record.vehicleType} />
            <Info label="コースID" value={record.courseId} />
            <Info label="コース名" value={record.courseName} />
            <Info label="経由地" value={record.routeName} />
            <Info label="月度" value={record.monthPeriod} />
            <Info label="締め月" value={record.closingMonth} />
            <Info
              label="結合キー"
              value={record.joinKey}
              className="sm:col-span-2"
            />
          </div>

          {record.warningFlags.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
              <p className="font-medium text-amber-950">警告</p>
              <ul className="mt-1 list-inside list-disc text-amber-900">
                {record.warningFlags.map((flag) => (
                  <li key={flag}>
                    {SHIGA_DELIVERY_WARNING_LABELS[flag]}
                    {record.warningMessages.length > 0 && (
                      <span className="block text-xs opacity-80">
                        {record.warningMessages.join(" / ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="台数" value={unitCount} onChange={setUnitCount} />
            <Field
              label="運賃"
              value={freightAmount}
              onChange={setFreightAmount}
            />
            <Field
              label="残業時間"
              value={overtimeHours}
              onChange={setOvertimeHours}
            />
            <Field
              label="残業代"
              value={overtimePayAmount}
              onChange={setOvertimePayAmount}
            />
            <Field label="高速代" value={tollAmount} onChange={setTollAmount} />
            <Field
              label="支払合計"
              value={coursePayTotal}
              onChange={setCoursePayTotal}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">日次検算（Excel行）</p>
            <p className="mt-1">
              車格金額合計: {formatYen(record.dailyVehicleAmountTotal ?? 0)} /
              高速代合計: {formatYen(record.dailyTollTotal ?? 0)} / 日次支払合計:{" "}
              {formatYen(record.dailyPayTotal ?? 0)}
            </p>
          </div>

          {saveFeedback && (
            <p
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
              role="status"
              aria-live="polite"
            >
              {saveFeedback}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 border-t bg-muted/20 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="h-11 min-h-[44px] flex-1 text-base"
            onClick={() => onRevert?.(record.id)}
          >
            取込直後に戻す
          </Button>
          <Button
            type="button"
            className="h-11 min-h-[44px] flex-1 text-base"
            onClick={handleSave}
          >
            保存（画面を開いたまま）
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 min-h-[44px] flex-1 text-base"
            onClick={onClose}
          >
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
