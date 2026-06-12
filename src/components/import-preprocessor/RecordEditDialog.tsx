"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RecordEditPatch } from "@/lib/import-preprocessor/record-state";
import {
  OPERATION_TYPE_LABELS,
  type PreprocessedRecord,
  type PreprocessOperationType,
} from "@/lib/import-preprocessor";

type RecordEditDialogProps = {
  record: PreprocessedRecord | null;
  open: boolean;
  onClose: () => void;
  onSave: (recordId: string, patch: RecordEditPatch) => void;
};

export function RecordEditDialog({
  record,
  open,
  onClose,
  onSave,
}: RecordEditDialogProps) {
  const [form, setForm] = useState<RecordEditPatch>({});

  useEffect(() => {
    if (!record) return;
    setForm({
      businessDate: record.businessDate,
      driverNameNormalized: record.driverNameNormalized,
      vehicleNoNormalized: record.vehicleNoNormalized,
      shipperNameNormalized: record.shipperNameNormalized,
      jobNameNormalized: record.jobNameNormalized,
      routeNameNormalized: record.routeNameNormalized,
      amount: record.amount,
      operationType: record.operationType,
      companyNormalized: record.companyNormalized,
    });
  }, [record]);

  if (!open || !record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-background p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-edit-title"
      >
        <h3 id="record-edit-title" className="text-lg font-semibold">
          行 {record.sourceRowNumber} を編集
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          メモリ上のみ更新（Firestore には保存しません）
        </p>

        <div className="mt-4 grid gap-3">
          <Field label="日付">
            <Input
              type="date"
              value={form.businessDate ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, businessDate: e.target.value }))
              }
            />
          </Field>
          <Field label="ドライバー">
            <Input
              value={form.driverNameNormalized ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  driverNameNormalized: e.target.value,
                }))
              }
            />
          </Field>
          <Field label="車両">
            <Input
              value={form.vehicleNoNormalized ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  vehicleNoNormalized: e.target.value,
                }))
              }
            />
          </Field>
          <Field label="区分">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.operationType ?? "unknown"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  operationType: e.target.value as PreprocessOperationType,
                }))
              }
            >
              {(Object.keys(OPERATION_TYPE_LABELS) as PreprocessOperationType[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {OPERATION_TYPE_LABELS[key]}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Field label="荷主">
            <Input
              value="Amazon"
              readOnly
              disabled
              className="bg-muted"
            />
          </Field>
          <Field label="実運送会社">
            <Input
              value={form.companyNormalized ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  companyNormalized: e.target.value,
                }))
              }
            />
          </Field>
          <Field label="業務">
            <Input
              value={form.jobNameNormalized ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  jobNameNormalized: e.target.value,
                }))
              }
            />
          </Field>
          <Field label="便名">
            <Input
              value={form.routeNameNormalized ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  routeNameNormalized: e.target.value,
                }))
              }
            />
          </Field>
          <Field label="金額">
            <CurrencyInput
              value={form.amount ?? 0}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave(record.id, form);
              onClose();
            }}
          >
            保存（メモリ更新）
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
