"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Calculator, Plus } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatYen } from "@/lib/currency-format";
import { SHIGA_DELIVERY_COURSES } from "@/lib/import-preprocessor/shiga-delivery/course-definitions";
import {
  EMPTY_SHIPPER_BILLING_CONTRACT_FORM,
  contractToBillingForm,
  courseLabel,
  filterShipperBillingContracts,
  formToShipperBillingContractDraft,
  type ShipperBillingContractFormState,
} from "@/lib/shipper-billing-form-utils";
import { calcShipperBillingAmounts } from "@/lib/shiga-fm/billing-calc";
import { withShipperBillingLedgerShigaFmNote } from "@/lib/shiga-fm/fm-shortage-ui-messages";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import type { MasterData } from "@/lib/types";
import {
  createShipperBillingContractId,
  deleteShipperBillingContract,
  saveShipperBillingContracts,
  upsertShipperBillingContract,
} from "@/services/shipper-billing-contract-storage";
import { cn } from "@/lib/utils";

type ShipperBillingContractSectionProps = {
  shipperId: string;
  shipperName: string;
  masters: MasterData;
  contracts: ShipperBillingContract[];
  jobOptions: string[];
  onContractsChange: (contracts: ShipperBillingContract[]) => void;
  onFeedback: (
    message: string,
    detail?: string,
    tone?: "success" | "warn" | "info",
  ) => void;
  highlight?: boolean;
};

function scopeLabel(contract: ShipperBillingContract): string {
  const parts: string[] = [];
  if (contract.jobName) parts.push(contract.jobName);
  else parts.push("全業務");
  if (contract.courseId) parts.push(courseLabel(contract.courseId));
  else parts.push("全コース");
  return parts.join(" / ");
}

export function ShipperBillingContractSection({
  shipperId,
  shipperName,
  masters,
  contracts,
  jobOptions,
  onContractsChange,
  onFeedback,
  highlight = false,
}: ShipperBillingContractSectionProps) {
  const [form, setForm] = useState<ShipperBillingContractFormState>({
    ...EMPTY_SHIPPER_BILLING_CONTRACT_FORM,
    shipperId,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviseFromId, setReviseFromId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewBasePlusOvertime, setPreviewBasePlusOvertime] = useState(50_000);
  const [previewToll, setPreviewToll] = useState(0);

  const currentContracts = useMemo(
    () =>
      filterShipperBillingContracts(contracts, shipperId, { currentOnly: true }),
    [contracts, shipperId],
  );

  const previewContract = useMemo(() => {
    const now = new Date().toISOString();
    return {
      id: "preview",
      ...formToShipperBillingContractDraft({ ...form, shipperId }, masters),
      createdAt: now,
      updatedAt: now,
    } satisfies ShipperBillingContract;
  }, [form, masters, shipperId]);

  const previewResult = useMemo(() => {
    return calcShipperBillingAmounts(previewContract, {
      basePlusOvertime: previewBasePlusOvertime,
      tollAmount: previewToll,
    });
  }, [previewContract, previewBasePlusOvertime, previewToll]);

  const resetForm = () => {
    setForm({ ...EMPTY_SHIPPER_BILLING_CONTRACT_FORM, shipperId });
    setEditingId(null);
    setReviseFromId(null);
  };

  const refreshLocal = (rows: ShipperBillingContract[]) => {
    onContractsChange(rows);
  };

  const handleSave = async () => {
    if (form.freightInvoiceRatePercent <= 0) {
      onFeedback("運賃請求率を入力してください", undefined, "warn");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const draft = formToShipperBillingContractDraft(
        { ...form, shipperId },
        masters,
      );

      if (reviseFromId) {
        const prev = contracts.find((c) => c.id === reviseFromId);
        if (!prev) throw new Error("改定元の契約が見つかりません");
        const confirmed = window.confirm(
          `${scopeLabel(prev)} の請求契約を改定しますか？\n旧契約の適用終了日を設定し、新しい契約レコードを作成します。`,
        );
        if (!confirmed) {
          onFeedback("改定をキャンセルしました", undefined, "info");
          return;
        }
        const prevEnd = new Date(form.effectiveFrom);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const closedPrev: ShipperBillingContract = {
          ...prev,
          effectiveTo: prevEnd.toISOString().slice(0, 10),
          updatedAt: now,
        };
        const next: ShipperBillingContract = {
          id: createShipperBillingContractId(),
          ...draft,
          effectiveTo: null,
          createdAt: now,
          updatedAt: now,
        };
        const nextList = contracts.map((c) =>
          c.id === prev.id ? closedPrev : c,
        );
        await saveShipperBillingContracts([...nextList, next]);
        refreshLocal([...nextList, next]);
        onFeedback(
          "請求契約を改定しました（履歴を保持）",
          withShipperBillingLedgerShigaFmNote(
            `${shipperName} / ${scopeLabel(next)}`,
          ),
          "success",
        );
      } else if (editingId) {
        const updated: ShipperBillingContract = {
          ...contracts.find((c) => c.id === editingId)!,
          ...draft,
          updatedAt: now,
        };
        await upsertShipperBillingContract(updated);
        refreshLocal(
          contracts.map((c) => (c.id === editingId ? updated : c)),
        );
        onFeedback(
          "請求契約を更新しました",
          withShipperBillingLedgerShigaFmNote(
            `${shipperName} / ${scopeLabel(updated)}`,
          ),
          "success",
        );
      } else {
        const created: ShipperBillingContract = {
          id: createShipperBillingContractId(),
          ...draft,
          effectiveTo: draft.effectiveTo,
          createdAt: now,
          updatedAt: now,
        };
        await upsertShipperBillingContract(created);
        refreshLocal([...contracts, created]);
        onFeedback(
          "請求契約を登録しました",
          withShipperBillingLedgerShigaFmNote(
            `${shipperName} / 運賃${form.freightInvoiceRatePercent}%・高速${form.tollInvoiceRatePercent}%`,
          ),
          "success",
        );
      }
      resetForm();
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "保存に失敗しました",
        undefined,
        "warn",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (contract: ShipperBillingContract) => {
    setBusy(true);
    try {
      const updated: ShipperBillingContract = {
        ...contract,
        activeFlag: !contract.activeFlag,
        updatedAt: new Date().toISOString(),
      };
      await upsertShipperBillingContract(updated);
      refreshLocal(contracts.map((c) => (c.id === contract.id ? updated : c)));
      onFeedback(
        updated.activeFlag ? "契約を有効化しました" : "契約を無効化しました",
        scopeLabel(contract),
        "info",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (contract: ShipperBillingContract) => {
    if (!window.confirm(`${scopeLabel(contract)} の請求契約を削除しますか？`)) {
      onFeedback("削除をキャンセルしました", undefined, "info");
      return;
    }
    setBusy(true);
    try {
      await deleteShipperBillingContract(contract.id);
      refreshLocal(contracts.filter((c) => c.id !== contract.id));
      onFeedback("請求契約を削除しました", scopeLabel(contract), "warn");
      if (editingId === contract.id || reviseFromId === contract.id) resetForm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="shipper-section-billing"
      className={cn(
        "space-y-4 rounded-lg border p-4",
        highlight && "border-amber-400 bg-amber-50/30 ring-2 ring-amber-200",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">3. 請求契約</h3>
          <p className="text-xs text-muted-foreground">
            エフエートラックへ請求できる金額のルール
          </p>
        </div>
        {currentContracts.length === 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            請求契約未登録
          </span>
        )}
      </div>

      {currentContracts.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>適用範囲</TableHead>
              <TableHead className="text-right">運賃請求率</TableHead>
              <TableHead className="text-right">高速請求率</TableHead>
              <TableHead>適用期間</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentContracts.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">{scopeLabel(c)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {Math.round(c.freightInvoiceRate * 10_000) / 100}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Math.round(c.tollInvoiceRate * 10_000) / 100}%
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {c.effectiveFrom} 〜 {c.effectiveTo ?? "現行"}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      c.activeFlag
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {c.activeFlag ? "有効" : "無効"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(c.id);
                        setReviseFromId(null);
                        setForm(contractToBillingForm(c));
                        onFeedback(
                          "編集フォームに読み込みました",
                          scopeLabel(c),
                          "info",
                        );
                      }}
                    >
                      編集
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setReviseFromId(c.id);
                        setEditingId(null);
                        setForm({
                          ...contractToBillingForm(c),
                          effectiveFrom: new Date().toISOString().slice(0, 10),
                          effectiveTo: "",
                        });
                        onFeedback("改定モードです", scopeLabel(c), "info");
                      }}
                    >
                      改定
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void handleToggleActive(c)}
                    >
                      {c.activeFlag ? "無効化" : "有効化"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => void handleDelete(c)}
                    >
                      削除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-amber-900">
          現在有効な請求契約がありません。下のフォームから登録してください。
        </p>
      )}

      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <p className="text-sm font-medium">
          {reviseFromId
            ? "契約改定（新レコード追加）"
            : editingId
              ? "契約編集"
              : "新規契約登録"}
        </p>
        <p className="text-xs text-muted-foreground">
          荷主: {shipperName}（shipperId 固定）
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="対象コース">
            <Select
              value={form.courseId || "__all__"}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  courseId: v === "__all__" || !v ? "" : v,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全コース</SelectItem>
                {SHIGA_DELIVERY_COURSES.map((c) => (
                  <SelectItem key={c.courseId} value={c.courseId}>
                    {c.courseName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="対象業務">
            <Select
              value={form.jobName || "__all__"}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  jobName: v === "__all__" || !v ? "" : v,
                  jobId: "",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全業務</SelectItem>
                {jobOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="適用開始日">
            <Input
              type="date"
              value={form.effectiveFrom}
              onChange={(e) =>
                setForm((f) => ({ ...f, effectiveFrom: e.target.value }))
              }
            />
          </Field>
          <Field label="適用終了日（任意）">
            <Input
              type="date"
              value={form.effectiveTo}
              onChange={(e) =>
                setForm((f) => ({ ...f, effectiveTo: e.target.value }))
              }
            />
          </Field>
          <Field label="運賃請求率（%）">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.freightInvoiceRatePercent}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  freightInvoiceRatePercent: Number(e.target.value) || 0,
                }))
              }
            />
          </Field>
          <Field label="高速請求率（%）">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.tollInvoiceRatePercent}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  tollInvoiceRatePercent: Number(e.target.value) || 0,
                }))
              }
            />
          </Field>
          <Field label="備考">
            <Input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </Field>
          <Field label="有効フラグ">
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-xs",
                  form.activeFlag
                    ? "border-emerald-500 bg-emerald-100"
                    : "border-border",
                )}
                onClick={() => setForm((f) => ({ ...f, activeFlag: true }))}
              >
                有効
              </button>
              <button
                type="button"
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-xs",
                  !form.activeFlag
                    ? "border-slate-500 bg-slate-200"
                    : "border-border",
                )}
                onClick={() => setForm((f) => ({ ...f, activeFlag: false }))}
              >
                無効
              </button>
            </div>
          </Field>
        </div>

        <div className="rounded-lg border bg-background p-3 text-sm">
          <p className="mb-2 flex items-center gap-1 font-medium">
            <Calculator className="size-4" />
            試算
          </p>
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <Field label="運賃+残業（円）">
              <CurrencyInput
                value={previewBasePlusOvertime}
                onChange={setPreviewBasePlusOvertime}
              />
            </Field>
            <Field label="高速代（円）">
              <CurrencyInput value={previewToll} onChange={setPreviewToll} />
            </Field>
          </div>
          <p>
            請求額 {formatYen(previewResult.invoiceAmount)}
            （運賃 {formatYen(previewResult.breakdown.freightInvoice)} / 高速{" "}
            {formatYen(previewResult.breakdown.tollInvoice)}）
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void handleSave()}>
            <Plus className="mr-1 size-4" />
            {reviseFromId ? "改定を保存" : editingId ? "更新する" : "登録する"}
          </Button>
          {(editingId || reviseFromId) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onFeedback("入力をキャンセルしました", undefined, "info");
              }}
            >
              キャンセル
            </Button>
          )}
        </div>
      </div>
    </section>
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
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
