"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDisplayDate } from "@/lib/excel-date";
import {
  ensurePartnerProfiles,
  findPartnerProfileById,
  getPartnerProfiles,
} from "@/lib/partner-company-utils";
import type { PartnerDetailSectionId } from "@/lib/partner-ledger-navigation";
import {
  classifyPartnerOptionsForSlot,
  needsCourseMismatchConfirm,
  partnerJobMismatchNote,
} from "@/lib/partner-slot-partner-options";
import {
  SHIGA_FM_SLOT_ASSIGNMENT_TYPE_LABELS,
  type ShigaFmSlotAssignment,
  type ShigaFmSlotAssignmentType,
} from "@/lib/import-preprocessor/shiga-fm-reconciliation/slot-assignment-types";
import type { ShigaFmReconciliationRow } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import type { PartnerPaymentContract } from "@/lib/shiga-fm/partner-payment-types";
import { resolvePartnerPaymentContract } from "@/lib/shiga-fm/contract-resolve";
import {
  CONTRACT_REGISTERED_VS_CONFIRMED,
  FM_SHORTAGE_EXPLANATION,
  formatRecommendedPartnersHint,
} from "@/lib/shiga-fm/fm-shortage-ui-messages";
import type { MasterData } from "@/lib/types";
import { DEFAULT_MASTERS } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ShigaFmSlotAssignmentFormValues = {
  assignmentType: ShigaFmSlotAssignmentType;
  partnerId: string;
  partnerName: string;
  partTimePaymentAmount: number;
  salesAmount: number;
  workerName: string;
  note: string;
};

type ShigaFmSlotAssignmentDialogProps = {
  row: ShigaFmReconciliationRow | null;
  existing: ShigaFmSlotAssignment | null;
  contracts: PartnerPaymentContract[];
  masters?: MasterData | null;
  monthPeriod: string | null;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSave: (values: ShigaFmSlotAssignmentFormValues) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onNavigateToPartnerDetail?: (
    partnerId: string,
    section?: PartnerDetailSectionId,
  ) => void;
  onNavigateToPartnerLedger?: () => void;
};

const TYPE_OPTIONS: ShigaFmSlotAssignmentType[] = [
  "partner",
  "part_time",
  "employee",
];

function defaultFormValues(
  row: ShigaFmReconciliationRow,
  existing: ShigaFmSlotAssignment | null,
): ShigaFmSlotAssignmentFormValues {
  return {
    assignmentType: existing?.assignmentType ?? "partner",
    partnerId: existing?.partnerId ?? "",
    partnerName: existing?.partnerName ?? "",
    partTimePaymentAmount: existing?.partTimePaymentAmount ?? 0,
    salesAmount: existing?.salesAmount ?? row.salesAmount,
    workerName: existing?.workerName ?? "",
    note: existing?.note ?? "",
  };
}

function partnerSelectLabel(
  profile: { name: string; assignedJobNames: string[] },
  suffix?: string | null,
): string {
  const jobs =
    profile.assignedJobNames.length > 0
      ? `（${profile.assignedJobNames.join("・")}）`
      : "";
  const extra = suffix ? ` — ${suffix}` : "";
  return `${profile.name}${jobs}${extra}`;
}

export function ShigaFmSlotAssignmentDialog({
  row,
  existing,
  contracts,
  masters: mastersProp,
  monthPeriod,
  open,
  busy = false,
  onClose,
  onSave,
  onDelete,
  onNavigateToPartnerDetail,
  onNavigateToPartnerLedger,
}: ShigaFmSlotAssignmentDialogProps) {
  const [form, setForm] = useState<ShigaFmSlotAssignmentFormValues | null>(null);
  const [showCourseConfirm, setShowCourseConfirm] = useState(false);

  const masters = useMemo(
    () => ensurePartnerProfiles(mastersProp ?? { ...DEFAULT_MASTERS }),
    [mastersProp],
  );

  const partnerGroups = useMemo(() => {
    const profiles = getPartnerProfiles(masters);
    return classifyPartnerOptionsForSlot(
      profiles,
      row?.courseId ?? null,
      row?.jobName ?? null,
    );
  }, [masters, row?.courseId, row?.jobName]);

  const selectedProfile = useMemo(() => {
    if (!form?.partnerId) return null;
    return findPartnerProfileById(masters, form.partnerId);
  }, [form?.partnerId, masters]);

  const selectedJobNote = useMemo(() => {
    if (!selectedProfile || !row) return null;
    return partnerJobMismatchNote(
      selectedProfile,
      row.courseId,
      row.jobName,
    );
  }, [selectedProfile, row]);

  useEffect(() => {
    if (open && row) {
      setForm(defaultFormValues(row, existing));
      setShowCourseConfirm(false);
    }
  }, [open, row, existing]);

  const courseDefaultHint = useMemo(() => {
    if (!row?.courseId || row.courseId !== "SHIGA_04") return null;
    const def = resolvePartnerPaymentContract(contracts, {
      courseId: "SHIGA_04",
      businessDate: row.businessDate,
    });
    if (!def) return null;
    return `契約未登録時はコース別デフォルト単価（基本 ${def.baseUnitPrice.toLocaleString()}円）で計算します`;
  }, [contracts, row?.courseId, row?.businessDate]);

  if (!open || !row || !form) return null;

  const slotLabel =
    row.unitCount > 1
      ? `${row.slotIndex}/${row.unitCount}（${row.jobName}）`
      : row.jobName;

  const hasSelectablePartners =
    partnerGroups.recommended.length > 0 || partnerGroups.other.length > 0;

  const isFmShortageRow = row.status === "fm_shortage";

  const recommendedHint = formatRecommendedPartnersHint(
    partnerGroups.recommended.map((p) => p.name),
    partnerGroups.other.length > 0,
  );

  const proceedSave = () => {
    void onSave(form);
    setShowCourseConfirm(false);
  };

  const handleSave = () => {
    if (form.assignmentType === "partner" && !form.partnerId.trim()) {
      window.alert("協力会社台帳に登録された協力会社を選択してください");
      return;
    }
    if (form.assignmentType === "part_time" && form.partTimePaymentAmount <= 0) {
      window.alert("アルバイトの支払額を入力してください");
      return;
    }
    if (
      form.assignmentType === "partner" &&
      selectedProfile &&
      needsCourseMismatchConfirm(selectedProfile, row.courseId)
    ) {
      setShowCourseConfirm(true);
      return;
    }
    proceedSave();
  };

  const handleNavigateAddCourse = () => {
    if (!form.partnerId || !onNavigateToPartnerDetail) return;
    onNavigateToPartnerDetail(form.partnerId, "courses");
    setShowCourseConfirm(false);
    onClose();
  };

  const renderPartnerEmptyState = () => {
    if (partnerGroups.emptyReason === "no_profiles") {
      return (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <p>協力会社台帳で協力会社を登録してください</p>
          {onNavigateToPartnerLedger && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-amber-400 bg-white hover:bg-amber-100"
              onClick={() => {
                onNavigateToPartnerLedger();
                onClose();
              }}
            >
              協力会社台帳へ移動
            </Button>
          )}
        </div>
      );
    }
    if (partnerGroups.emptyReason === "all_inactive") {
      return (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <p>有効な協力会社がありません。協力会社台帳で有効化してください</p>
          {onNavigateToPartnerLedger && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-amber-400 bg-white hover:bg-amber-100"
              onClick={() => {
                onNavigateToPartnerLedger();
                onClose();
              }}
            >
              協力会社台帳へ移動
            </Button>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-assignment-title"
        onClick={(e) => e.stopPropagation()}
      >
        {showCourseConfirm && selectedProfile && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
            <div
              className="w-full max-w-md space-y-4 rounded-xl border bg-background p-5 shadow-xl"
              role="alertdialog"
              aria-labelledby="course-mismatch-title"
            >
              <h3
                id="course-mismatch-title"
                className="text-base font-semibold text-orange-950"
              >
                コース未登録の協力会社
              </h3>
              <p className="text-sm text-muted-foreground">
                この協力会社はこのコース（{row.courseName ?? row.courseId}）に登録されていません。
                <br />
                今回だけ使用しますか？
                <br />
                それとも協力会社台帳で対象コースを追加しますか？
              </p>
              <p className="text-sm font-medium text-foreground">
                選択中: {selectedProfile.name}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  className="bg-orange-600 hover:bg-orange-700"
                  disabled={busy}
                  onClick={proceedSave}
                >
                  今回だけ使用する
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !onNavigateToPartnerDetail}
                  onClick={handleNavigateAddCourse}
                >
                  協力会社台帳で対象コースを追加する
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setShowCourseConfirm(false)}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="border-b bg-orange-50/80 px-5 py-4">
          <h2
            id="slot-assignment-title"
            className="text-xl font-semibold text-orange-950"
          >
            未登録スロット入力
          </h2>
          <p className="mt-1 text-sm text-orange-900/80">
            {formatDisplayDate(row.businessDate)} / {row.courseName ?? "—"} /{" "}
            {slotLabel}
            {monthPeriod ? ` / ${monthPeriod}` : ""}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {isFmShortageRow && (
            <div className="space-y-2 rounded-lg border border-orange-300 bg-orange-50/90 px-3 py-3 text-sm text-orange-950">
              <p>{FM_SHORTAGE_EXPLANATION}</p>
              <p className="text-xs text-orange-900/90">
                {CONTRACT_REGISTERED_VS_CONFIRMED}
              </p>
              <p className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-900">
                {recommendedHint}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>入力種別</Label>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={busy}
                  className={cn(
                    "cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                    form.assignmentType === type
                      ? "border-orange-500 bg-orange-100 text-orange-950"
                      : "border-border bg-background hover:bg-orange-50",
                  )}
                  onClick={() =>
                    setForm((prev) =>
                      prev ? { ...prev, assignmentType: type } : prev,
                    )
                  }
                >
                  {SHIGA_FM_SLOT_ASSIGNMENT_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {form.assignmentType === "partner" && (
            <div className="space-y-2">
              <Label htmlFor="partner-select">協力会社（協力会社台帳）</Label>
              {!hasSelectablePartners ? (
                renderPartnerEmptyState()
              ) : (
                <>
                  {partnerGroups.recommended.length === 0 &&
                    partnerGroups.other.length > 0 && (
                      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                        推奨候補はありません。その他の協力会社から選択できます
                      </p>
                    )}
                  <Select
                    value={form.partnerId}
                    onValueChange={(v) => {
                      const profile = findPartnerProfileById(masters, v ?? "");
                      setForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              partnerId: v ?? "",
                              partnerName: profile?.name ?? "",
                            }
                          : prev,
                      );
                    }}
                  >
                    <SelectTrigger id="partner-select">
                      <SelectValue placeholder="協力会社を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {partnerGroups.recommended.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-emerald-800">
                            推奨（対象コース・依頼業務が一致）
                          </SelectLabel>
                          {partnerGroups.recommended.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {partnerSelectLabel(p)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {partnerGroups.other.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-muted-foreground">
                            その他（登録済みの協力会社）
                          </SelectLabel>
                          {partnerGroups.other.map((p) => {
                            const jobNote = partnerJobMismatchNote(
                              p,
                              row.courseId,
                              row.jobName,
                            );
                            const courseOff = needsCourseMismatchConfirm(
                              p,
                              row.courseId,
                            );
                            const suffix = courseOff
                              ? "対象コース外"
                              : jobNote;
                            return (
                              <SelectItem key={p.id} value={p.id}>
                                {partnerSelectLabel(p, suffix)}
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                </>
              )}
              {selectedJobNote && (
                <p className="text-xs text-sky-800">{selectedJobNote}</p>
              )}
              {selectedProfile &&
                needsCourseMismatchConfirm(selectedProfile, row.courseId) && (
                  <p className="text-xs text-amber-800">
                    対象コース外の協力会社です。保存時に確認が表示されます
                  </p>
                )}
              <p className="text-xs text-muted-foreground">
                支払先は選択した協力会社名で表示されます。支払契約の単価で請求・支払を自動計算します。
              </p>
              {courseDefaultHint && (
                <p className="text-xs text-sky-800">{courseDefaultHint}</p>
              )}
            </div>
          )}

          {form.assignmentType === "part_time" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>請求額（売上）</Label>
                <CurrencyInput
                  value={form.salesAmount}
                  disabled={busy}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, salesAmount: v } : prev,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>支払額（必須）</Label>
                <CurrencyInput
                  value={form.partTimePaymentAmount}
                  disabled={busy}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, partTimePaymentAmount: v } : prev,
                    )
                  }
                />
              </div>
            </div>
          )}

          {form.assignmentType === "employee" && (
            <div className="space-y-2">
              <Label>請求額（売上）</Label>
              <CurrencyInput
                value={form.salesAmount}
                disabled={busy}
                onChange={(v) =>
                  setForm((prev) =>
                    prev ? { ...prev, salesAmount: v } : prev,
                  )
                }
              />
              <p className="text-xs text-emerald-800">
                支払は ¥0（自社業務のため支払なし）、粗利＝請求額
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="worker-name">
              {form.assignmentType === "employee"
                ? "社員名（任意）"
                : form.assignmentType === "part_time"
                  ? "アルバイト名（任意）"
                  : "担当者メモ（任意）"}
            </Label>
            <Input
              id="worker-name"
              value={form.workerName}
              disabled={busy}
              onChange={(e) =>
                setForm((prev) =>
                  prev ? { ...prev, workerName: e.target.value } : prev,
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignment-note">備考（任意）</Label>
            <Input
              id="assignment-note"
              value={form.note}
              disabled={busy}
              onChange={(e) =>
                setForm((prev) =>
                  prev ? { ...prev, note: e.target.value } : prev,
                )
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            {existing && (
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void onDelete()}
              >
                削除
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              キャンセル
            </Button>
            <Button type="button" disabled={busy} onClick={handleSave}>
              {busy ? "保存中…" : "保存して再計算"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
