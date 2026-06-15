"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Plus, RefreshCw } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  calcContractAmounts,
  TOLL_BILLING_METHOD_LABELS,
  type TollBillingMethod,
} from "@/lib/shiga-fm";
import { buildDefaultShipperBillingDraft } from "@/lib/shiga-fm/contract-migrate";
import type { PartnerPaymentContract } from "@/lib/shiga-fm/partner-payment-types";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import { COURSE_DEFAULT_CONTRACT_LABEL } from "@/lib/shiga-fm/partner-contract-types";
import { SHIGA_FM_BILLING_PARTY } from "@/lib/import-preprocessor/shiga-fm-reconciliation/cost-classifier";
import { buildDefaultPartnerContractDrafts } from "@/lib/shiga-fm/default-contracts";
import {
  ensurePartnerProfiles,
  findPartnerProfileById,
  getPartnerProfiles,
} from "@/lib/partner-company-utils";
import { linkContractsToPartnerProfiles } from "@/lib/partner-contract-migrate";
import type { MasterData } from "@/lib/types";
import { DEFAULT_MASTERS } from "@/lib/types";
import {
  createPartnerContractId,
  deletePartnerPaymentContract,
  loadPartnerPaymentContracts,
  savePartnerPaymentContracts,
  upsertPartnerPaymentContract,
} from "@/services/partner-contract-storage";
import { withPartnerLedgerShigaFmNote } from "@/lib/shiga-fm/fm-shortage-ui-messages";
import { cn } from "@/lib/utils";
import {
  FmActionFeedbackBanner,
  type FmActionFeedback,
} from "./import-preprocessor/FmActionFeedbackBanner";

type PartnerContractMasterViewProps = {
  masters?: MasterData | null;
  initialPartnerId?: string | null;
  onContractsChange?: (contracts: PartnerPaymentContract[]) => void;
};

type FormState = {
  partnerId: string;
  courseId: PartnerPaymentContract["courseId"];
  baseUnitPrice: number;
  overtimeUnitPrice: number;
  tollBillingMethod: TollBillingMethod;
  effectiveFrom: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  partnerId: "",
  courseId: "SHIGA_02",
  baseUnitPrice: 0,
  overtimeUnitPrice: 0,
  tollBillingMethod: "actual_cost",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  note: "",
};

const PREVIEW_BILLING_CONTRACT: ShipperBillingContract = (() => {
  const now = new Date().toISOString();
  return {
    id: "preview-billing",
    ...buildDefaultShipperBillingDraft("preview-shipper", SHIGA_FM_BILLING_PARTY),
    createdAt: now,
    updatedAt: now,
  };
})();

function courseLabel(courseId: string): string {
  return (
    SHIGA_DELIVERY_COURSES.find((c) => c.courseId === courseId)?.courseName ??
    courseId
  );
}

function toForm(contract: PartnerPaymentContract): FormState {
  return {
    partnerId: contract.partnerId ?? "",
    courseId: contract.courseId,
    baseUnitPrice: contract.baseUnitPrice,
    overtimeUnitPrice: contract.overtimeUnitPrice,
    tollBillingMethod: contract.tollBillingMethod,
    effectiveFrom: contract.effectiveFrom,
    note: contract.note ?? "",
  };
}

function formToDraft(
  form: FormState,
  masters: MasterData,
  options?: { isCourseDefault?: boolean },
): Omit<
  PartnerPaymentContract,
  "id" | "createdAt" | "updatedAt" | "effectiveTo" | "activeFlag"
> {
  const profile = findPartnerProfileById(masters, form.partnerId);
  const isCourseDefault = options?.isCourseDefault ?? false;
  return {
    partnerId: isCourseDefault ? null : form.partnerId,
    partnerName: isCourseDefault
      ? COURSE_DEFAULT_CONTRACT_LABEL
      : (profile?.name ?? ""),
    courseId: form.courseId,
    courseName: courseLabel(form.courseId),
    isCourseDefault,
    jobId: null,
    jobName: null,
    baseUnitPrice: Math.round(form.baseUnitPrice),
    overtimeUnitPrice: Math.round(form.overtimeUnitPrice),
    tollBillingMethod: form.tollBillingMethod,
    effectiveFrom: form.effectiveFrom,
    note: form.note.trim() || null,
  };
}

export function PartnerContractMasterView({
  masters: mastersProp,
  initialPartnerId,
  onContractsChange,
}: PartnerContractMasterViewProps) {
  const masters = useMemo(
    () => ensurePartnerProfiles(mastersProp ?? { ...DEFAULT_MASTERS }),
    [mastersProp],
  );
  const partnerOptions = useMemo(() => getPartnerProfiles(masters), [masters]);
  const [contracts, setContracts] = useState<PartnerPaymentContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FmActionFeedback | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviseFromId, setReviseFromId] = useState<string | null>(null);
  const [previewOvertimeHours, setPreviewOvertimeHours] = useState(0);
  const [previewToll, setPreviewToll] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = linkContractsToPartnerProfiles(
        await loadPartnerPaymentContracts(),
        masters,
      );
      setContracts(rows);
      onContractsChange?.(rows);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "契約の読み込みに失敗しました";
      setFeedback({ message: msg, tone: "warn" });
    } finally {
      setLoading(false);
    }
  }, [onContractsChange, masters]);

  useEffect(() => {
    if (initialPartnerId) {
      setForm((f) => ({ ...f, partnerId: initialPartnerId }));
      setFeedback({
        message: "取引先台帳から協力会社を選択しました",
        detail: findPartnerProfileById(masters, initialPartnerId)?.name,
        tone: "info",
      });
    }
  }, [initialPartnerId, masters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const partnerContracts = useMemo(() => {
    if (!form.partnerId) return [];
    return contracts.filter(
      (c) => c.partnerId === form.partnerId && !c.isCourseDefault,
    );
  }, [contracts, form.partnerId]);

  const previewContract = useMemo(() => {
    if (!form.partnerId.trim()) return null;
    const now = new Date().toISOString();
    return {
      id: "preview",
      ...formToDraft(form, masters),
      effectiveTo: null,
      activeFlag: true,
      createdAt: now,
      updatedAt: now,
    } satisfies PartnerPaymentContract;
  }, [form, masters]);

  const previewResult = useMemo(() => {
    if (!previewContract) return null;
    return calcContractAmounts(
      previewContract,
      PREVIEW_BILLING_CONTRACT,
      {
        overtimeHours: previewOvertimeHours,
        tollAmount: previewToll,
      },
    );
  }, [previewContract, previewOvertimeHours, previewToll]);

  const partnerContractRows = useMemo(
    () => contracts.filter((c) => !c.isCourseDefault),
    [contracts],
  );

  const courseDefaultRows = useMemo(
    () => contracts.filter((c) => c.isCourseDefault),
    [contracts],
  );

  const junseiSample = useMemo(() => {
    const sample = contracts.find(
      (c) =>
        c.partnerName === "潤生輸送" &&
        c.courseId === "SHIGA_02" &&
        c.activeFlag &&
        c.effectiveTo == null &&
        !c.isCourseDefault,
    );
    if (!sample) return null;
    return calcContractAmounts(sample, PREVIEW_BILLING_CONTRACT, {
      overtimeHours: 0,
      tollAmount: 0,
    });
  }, [contracts]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setReviseFromId(null);
  };

  const handleSave = async () => {
    const editingContract = editingId
      ? contracts.find((c) => c.id === editingId)
      : null;
    const isCourseDefaultEdit = editingContract?.isCourseDefault ?? false;

    if (!isCourseDefaultEdit && !form.partnerId.trim()) {
      setFeedback({ message: "協力会社を選択してください", tone: "warn" });
      return;
    }
    if (form.baseUnitPrice <= 0) {
      setFeedback({ message: "基本単価を入力してください", tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const draft = formToDraft(form, masters, {
        isCourseDefault: isCourseDefaultEdit,
      });

      if (reviseFromId) {
        const prev = contracts.find((c) => c.id === reviseFromId);
        if (!prev) throw new Error("改定元の契約が見つかりません");
        const prevEnd = new Date(form.effectiveFrom);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevEndStr = prevEnd.toISOString().slice(0, 10);
        const closedPrev: PartnerPaymentContract = {
          ...prev,
          effectiveTo: prevEndStr,
          updatedAt: now,
        };
        const next: PartnerPaymentContract = {
          id: createPartnerContractId(),
          ...draft,
          effectiveTo: null,
          activeFlag: true,
          createdAt: now,
          updatedAt: now,
        };
        const nextList = contracts.map((c) =>
          c.id === prev.id ? closedPrev : c,
        );
        await savePartnerPaymentContracts([...nextList, next]);
        setFeedback({
          message: "契約を改定しました（履歴を保持）",
          detail: withPartnerLedgerShigaFmNote(
            `${prev.partnerName} / ${prev.courseName} → 適用開始 ${form.effectiveFrom}`,
          ),
          tone: "success",
        });
      } else if (editingId) {
        const updated: PartnerPaymentContract = {
          ...contracts.find((c) => c.id === editingId)!,
          ...draft,
          updatedAt: now,
        };
        await upsertPartnerPaymentContract(updated);
        setFeedback({
          message: "契約を更新しました",
          detail: withPartnerLedgerShigaFmNote(
            `${updated.partnerName} / ${updated.courseName}`,
          ),
          tone: "success",
        });
      } else {
        const created: PartnerPaymentContract = {
          id: createPartnerContractId(),
          ...draft,
          effectiveTo: null,
          activeFlag: true,
          createdAt: now,
          updatedAt: now,
        };
        await upsertPartnerPaymentContract(created);
        setFeedback({
          message: "契約を登録しました",
          detail: withPartnerLedgerShigaFmNote(
            `${created.partnerName} / ${created.courseName}`,
          ),
          tone: "success",
        });
      }
      resetForm();
      await refresh();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "保存に失敗しました";
      setFeedback({ message: msg, tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const handleSeedDefaults = async () => {
    setBusy(true);
    try {
      const existing = linkContractsToPartnerProfiles(
        await loadPartnerPaymentContracts(),
        masters,
      );
      const drafts = buildDefaultPartnerContractDrafts();
      const now = new Date().toISOString();
      const toAdd = linkContractsToPartnerProfiles(
        drafts
          .filter(
            (d) =>
              !existing.some(
                (e) =>
                  e.courseId === d.courseId &&
                  e.isCourseDefault === d.isCourseDefault &&
                  (d.isCourseDefault
                    ? e.isCourseDefault
                    : e.partnerName === d.partnerName) &&
                  e.effectiveTo == null,
              ),
          )
          .map((d) => ({
            id: createPartnerContractId(),
            ...d,
            createdAt: now,
            updatedAt: now,
          })),
        masters,
      );
      if (toAdd.length === 0) {
        setFeedback({
          message: "初期契約はすでに登録済みです",
          tone: "info",
        });
        return;
      }
      await savePartnerPaymentContracts([...existing, ...toAdd]);
      setFeedback({
        message: `初期契約を ${toAdd.length} 件登録しました`,
        detail: toAdd.map((c) => `${c.partnerName} / ${c.courseName}`).join(" / "),
        tone: "success",
      });
      await refresh();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "初期登録に失敗しました";
      setFeedback({ message: msg, tone: "warn" });
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
      setFeedback({
        message: updated.activeFlag ? "契約を有効化しました" : "契約を無効化しました",
        detail: `${contract.partnerName} / ${contract.courseName}`,
        tone: updated.activeFlag ? "success" : "info",
      });
      await refresh();
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : "更新に失敗しました",
        tone: "warn",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (contract: PartnerPaymentContract) => {
    if (
      !window.confirm(
        `${contract.partnerName} / ${contract.courseName} の契約を削除しますか？`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deletePartnerPaymentContract(contract.id);
      setFeedback({
        message: "契約を削除しました",
        detail: `${contract.partnerName} / ${contract.courseName}`,
        tone: "warn",
      });
      if (editingId === contract.id) resetForm();
      await refresh();
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : "削除に失敗しました",
        tone: "warn",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">契約単価マスタ</CardTitle>
          <CardDescription>
            傭車単価を登録・履歴管理します。適用開始日ごとに改定でき、過去データの再計算時は対象日の契約を参照します。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw className="mr-1 size-4" />
            再読込
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void handleSeedDefaults()}
          >
            初期契約を登録（潤生輸送②・コース別デフォルト④）
          </Button>
        </CardContent>
      </Card>

      <FmActionFeedbackBanner
        feedback={feedback}
        onDismiss={() => setFeedback(null)}
      />

      {junseiSample && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-950">
          <p className="font-medium">潤生輸送② 検算（基本のみ）</p>
          <p className="mt-1">
            請求 {formatYen(junseiSample.invoiceAmount)} / 支払{" "}
            {formatYen(junseiSample.paymentAmount)} / 粗利{" "}
            {formatYen(junseiSample.grossProfitAmount)}
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {reviseFromId
              ? "契約改定（新レコード追加）"
              : editingId
                ? "契約編集"
                : "新規契約登録"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="協力会社">
              {partnerOptions.length === 0 ? (
                <p className="text-sm text-amber-800">
                  取引先台帳で協力会社を登録してください
                </p>
              ) : (
                <Select
                  value={form.partnerId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, partnerId: v ?? "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="協力会社を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            {partnerContracts.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">選択中の協力会社の既存契約</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {partnerContracts.map((c) => (
                    <li key={c.id}>
                      {c.courseName} / 基本 {formatYen(c.baseUnitPrice)} /{" "}
                      {c.effectiveFrom}〜{c.effectiveTo ?? "現行"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                placeholder="契約メモ"
              />
            </Field>
          </div>

          {previewResult && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="mb-2 flex items-center gap-1 font-medium">
                <Calculator className="size-4" />
                試算（残業 {previewOvertimeHours}h / 高速 {formatYen(previewToll)}）
              </p>
              <div className="mb-2 flex flex-wrap gap-2">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-28"
                  value={previewOvertimeHours}
                  onChange={(e) =>
                    setPreviewOvertimeHours(Number(e.target.value) || 0)
                  }
                />
                <CurrencyInput
                  className="w-36"
                  value={previewToll}
                  onChange={setPreviewToll}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                請求率は荷主台帳の請求契約で管理します（試算は 98% / 高速 100%）
              </p>
              <p>
                請求 {formatYen(previewResult.invoiceAmount)} / 支払{" "}
                {formatYen(previewResult.paymentAmount)} / 粗利{" "}
                {formatYen(previewResult.grossProfitAmount)}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">登録済み契約一覧</CardTitle>
          <CardDescription>
            {loading
              ? "読み込み中…"
              : `協力会社契約 ${partnerContractRows.length} 件`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ContractTable
            contracts={partnerContractRows}
            masters={masters}
            busy={busy}
            editingId={editingId}
            onEdit={(c) => {
              setEditingId(c.id);
              setReviseFromId(null);
              setForm(toForm(c));
              setFeedback({
                message: "編集フォームに読み込みました",
                detail: `${c.partnerName} / ${c.courseName}`,
                tone: "info",
              });
            }}
            onRevise={(c) => {
              setReviseFromId(c.id);
              setEditingId(null);
              setForm({
                ...toForm(c),
                effectiveFrom: new Date().toISOString().slice(0, 10),
              });
              setFeedback({
                message: "改定モードです（旧契約は終了日が設定されます）",
                tone: "info",
              });
            }}
            onToggleActive={(c) => void handleToggleActive(c)}
            onDelete={(c) => void handleDelete(c)}
          />
        </CardContent>
      </Card>

      {courseDefaultRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">コース別デフォルト単価</CardTitle>
            <CardDescription>
              未登録スロットの初期計算・入力補助用。支払先には表示しません。
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <ContractTable
              contracts={courseDefaultRows}
              masters={masters}
              busy={busy}
              editingId={editingId}
              onEdit={(c) => {
                setEditingId(c.id);
                setReviseFromId(null);
                setForm(toForm(c));
              }}
              onRevise={(c) => {
                setReviseFromId(c.id);
                setEditingId(null);
                setForm({
                  ...toForm(c),
                  effectiveFrom: new Date().toISOString().slice(0, 10),
                });
              }}
              onToggleActive={(c) => void handleToggleActive(c)}
              onDelete={(c) => void handleDelete(c)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ContractTable({
  contracts,
  masters,
  busy,
  editingId,
  readOnlyActions = false,
  onEdit,
  onRevise,
  onToggleActive,
  onDelete,
}: {
  contracts: PartnerPaymentContract[];
  masters: MasterData;
  busy: boolean;
  editingId: string | null;
  readOnlyActions?: boolean;
  onEdit: (c: PartnerPaymentContract) => void;
  onRevise: (c: PartnerPaymentContract) => void;
  onToggleActive: (c: PartnerPaymentContract) => void;
  onDelete: (c: PartnerPaymentContract) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>協力会社</TableHead>
          <TableHead>コース</TableHead>
          <TableHead className="text-right">基本</TableHead>
          <TableHead className="text-right">残業/h</TableHead>
          <TableHead>高速請求</TableHead>
          <TableHead>適用期間</TableHead>
          <TableHead>状態</TableHead>
          <TableHead>操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contracts.map((c) => {
          const partnerLabel = c.isCourseDefault
            ? "（コース別デフォルト）"
            : findPartnerProfileById(masters, c.partnerId ?? "")?.name ??
              c.partnerName;
          return (
            <TableRow
              key={c.id}
              className={cn(!c.activeFlag && "opacity-60")}
            >
              <TableCell>{partnerLabel}</TableCell>
              <TableCell>{c.courseName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatYen(c.baseUnitPrice)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatYen(c.overtimeUnitPrice)}
              </TableCell>
              <TableCell>
                {TOLL_BILLING_METHOD_LABELS[c.tollBillingMethod]}
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
                {!readOnlyActions && (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(c)}
                    >
                      編集
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRevise(c)}
                    >
                      改定
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onToggleActive(c)}
                      disabled={busy}
                    >
                      {c.activeFlag ? "無効化" : "有効化"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => onDelete(c)}
                      disabled={busy}
                    >
                      削除
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
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
