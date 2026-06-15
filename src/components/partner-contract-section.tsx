"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Calculator, Plus } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  EMPTY_PARTNER_CONTRACT_FORM,
  contractToForm,
  filterPartnerContracts,
  formToPartnerContractDraft,
  type PartnerContractFormState,
} from "@/lib/partner-contract-form-utils";
import {
  calcPaymentOnly,
  type PartnerPaymentContract,
  TOLL_BILLING_METHOD_LABELS,
  type TollBillingMethod,
} from "@/lib/shiga-fm";
import type { MasterData } from "@/lib/types";
import {
  createPartnerContractId,
  deletePartnerPaymentContract,
  savePartnerPaymentContracts,
  upsertPartnerPaymentContract,
} from "@/services/partner-contract-storage";
import { withPartnerLedgerShigaFmNote } from "@/lib/shiga-fm/fm-shortage-ui-messages";
import { cn } from "@/lib/utils";

type PartnerContractSectionProps = {
  partnerId: string;
  partnerName: string;
  masters: MasterData;
  contracts: PartnerPaymentContract[];
  onContractsChange: (contracts: PartnerPaymentContract[]) => void;
  onFeedback: (message: string, detail?: string, tone?: "success" | "warn" | "info") => void;
  highlight?: boolean;
};

export function PartnerContractSection({
  partnerId,
  partnerName,
  masters,
  contracts,
  onContractsChange,
  onFeedback,
  highlight = false,
}: PartnerContractSectionProps) {
  const [form, setForm] = useState<PartnerContractFormState>({
    ...EMPTY_PARTNER_CONTRACT_FORM,
    partnerId,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviseFromId, setReviseFromId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewOvertimeHours, setPreviewOvertimeHours] = useState(0);
  const [previewToll, setPreviewToll] = useState(0);

  const currentContracts = useMemo(
    () =>
      filterPartnerContracts(contracts, partnerId, { currentOnly: true }),
    [contracts, partnerId],
  );

  const previewContract = useMemo(() => {
    if (form.baseUnitPrice <= 0) return null;
    const now = new Date().toISOString();
    return {
      id: "preview",
      ...formToPartnerContractDraft({ ...form, partnerId }, masters),
      createdAt: now,
      updatedAt: now,
    } satisfies PartnerPaymentContract;
  }, [form, masters, partnerId]);

  const previewResult = useMemo(() => {
    if (!previewContract) return null;
    return calcPaymentOnly(previewContract, {
      overtimeHours: previewOvertimeHours,
      tollAmount: previewToll,
    });
  }, [previewContract, previewOvertimeHours, previewToll]);

  const resetForm = () => {
    setForm({ ...EMPTY_PARTNER_CONTRACT_FORM, partnerId });
    setEditingId(null);
    setReviseFromId(null);
  };

  const refreshLocal = (rows: PartnerPaymentContract[]) => {
    onContractsChange(rows);
  };

  const handleSave = async () => {
    if (form.baseUnitPrice <= 0) {
      onFeedback("基本単価を入力してください", undefined, "warn");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const draft = formToPartnerContractDraft({ ...form, partnerId }, masters);

      if (reviseFromId) {
        const prev = contracts.find((c) => c.id === reviseFromId);
        if (!prev) throw new Error("改定元の契約が見つかりません");
        const prevEnd = new Date(form.effectiveFrom);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const closedPrev: PartnerPaymentContract = {
          ...prev,
          effectiveTo: prevEnd.toISOString().slice(0, 10),
          updatedAt: now,
        };
        const next: PartnerPaymentContract = {
          id: createPartnerContractId(),
          ...draft,
          effectiveTo: null,
          createdAt: now,
          updatedAt: now,
        };
        const nextList = contracts.map((c) =>
          c.id === prev.id ? closedPrev : c,
        );
        await savePartnerPaymentContracts([...nextList, next]);
        refreshLocal([...nextList, next]);
        onFeedback(
          "支払契約を改定しました（履歴を保持）",
          withPartnerLedgerShigaFmNote(`${partnerName} / ${draft.courseName}`),
          "success",
        );
      } else if (editingId) {
        const updated: PartnerPaymentContract = {
          ...contracts.find((c) => c.id === editingId)!,
          ...draft,
          updatedAt: now,
        };
        await upsertPartnerPaymentContract(updated);
        refreshLocal(
          contracts.map((c) => (c.id === editingId ? updated : c)),
        );
        onFeedback(
          "支払契約を更新しました",
          withPartnerLedgerShigaFmNote(`${partnerName} / ${draft.courseName}`),
          "success",
        );
      } else {
        const created: PartnerPaymentContract = {
          id: createPartnerContractId(),
          ...draft,
          effectiveTo: draft.effectiveTo,
          createdAt: now,
          updatedAt: now,
        };
        await upsertPartnerPaymentContract(created);
        refreshLocal([...contracts, created]);
        onFeedback(
          "支払契約を登録しました",
          withPartnerLedgerShigaFmNote(
            `${partnerName} / 基本${draft.baseUnitPrice.toLocaleString()}円`,
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

  const handleToggleActive = async (contract: PartnerPaymentContract) => {
    setBusy(true);
    try {
      const updated: PartnerPaymentContract = {
        ...contract,
        activeFlag: !contract.activeFlag,
        updatedAt: new Date().toISOString(),
      };
      await upsertPartnerPaymentContract(updated);
      refreshLocal(contracts.map((c) => (c.id === contract.id ? updated : c)));
      onFeedback(
        updated.activeFlag ? "契約を有効化しました" : "契約を無効化しました",
        contract.courseName,
        "info",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (contract: PartnerPaymentContract) => {
    if (!window.confirm(`${contract.courseName} の契約を削除しますか？`)) return;
    setBusy(true);
    try {
      await deletePartnerPaymentContract(contract.id);
      refreshLocal(contracts.filter((c) => c.id !== contract.id));
      onFeedback("契約を削除しました", contract.courseName, "warn");
      if (editingId === contract.id) resetForm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="partner-section-contracts"
      className={cn(
        "space-y-4 rounded-lg border p-4",
        highlight && "border-amber-400 bg-amber-50/30 ring-2 ring-amber-200",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">4. 協力会社支払契約</h3>
          <p className="text-xs text-muted-foreground">
            {partnerName}へ支払う単価を登録します
          </p>
        </div>
        {currentContracts.length === 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            支払契約未登録
          </span>
        )}
      </div>

      {currentContracts.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>コース</TableHead>
              <TableHead className="text-right">基本</TableHead>
              <TableHead className="text-right">残業/h</TableHead>
              <TableHead>適用期間</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentContracts.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.courseName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatYen(c.baseUnitPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatYen(c.overtimeUnitPrice)}
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
                        setForm(contractToForm(c));
                        onFeedback("編集フォームに読み込みました", c.courseName, "info");
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
                          ...contractToForm(c),
                          effectiveFrom: new Date().toISOString().slice(0, 10),
                          effectiveTo: "",
                        });
                        onFeedback("改定モードです", c.courseName, "info");
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
          現在有効な契約がありません。下のフォームから登録してください。
        </p>
      )}

      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <p className="text-sm font-medium">
          {reviseFromId
            ? "契約改定（新レコード追加）"
            : editingId
              ? "契約編集"
              : "新規契約登録"}
        </p>
        <p className="text-xs text-muted-foreground">
          協力会社: {partnerName}（partnerId 固定）
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="対象コース">
            <Select
              value={form.courseId}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  courseId: v as PartnerPaymentContract["courseId"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHIGA_DELIVERY_COURSES.map((c) => (
                  <SelectItem key={c.courseId} value={c.courseId}>
                    {c.courseName}
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
          <Field label="基本単価（円）">
            <CurrencyInput
              value={form.baseUnitPrice}
              onChange={(v) => setForm((f) => ({ ...f, baseUnitPrice: v }))}
            />
          </Field>
          <Field label="残業単価（円/時間）">
            <CurrencyInput
              value={form.overtimeUnitPrice}
              onChange={(v) =>
                setForm((f) => ({ ...f, overtimeUnitPrice: v }))
              }
            />
          </Field>
          <Field label="高速代請求方法">
            <Select
              value={form.tollBillingMethod}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  tollBillingMethod: v as TollBillingMethod,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(TOLL_BILLING_METHOD_LABELS) as [
                    TollBillingMethod,
                    string,
                  ][]
                ).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        {previewResult && (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="mb-2 flex items-center gap-1 font-medium">
              <Calculator className="size-4" />
              試算
            </p>
            <p>
              支払額 {formatYen(previewResult.paymentAmount)}
              （基本 {formatYen(previewResult.breakdown.baseUnitPrice)} / 残業{" "}
              {formatYen(previewResult.breakdown.overtimeAmount)} / 高速{" "}
              {formatYen(previewResult.breakdown.tollPayment)}）
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void handleSave()}>
            <Plus className="mr-1 size-4" />
            {reviseFromId ? "改定を保存" : editingId ? "更新する" : "登録する"}
          </Button>
          {(editingId || reviseFromId) && (
            <Button type="button" variant="outline" onClick={resetForm}>
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
