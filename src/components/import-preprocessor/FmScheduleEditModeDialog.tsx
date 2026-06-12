"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatYen } from "@/lib/currency-format";
import {
  findJointPartnerCandidates,
  type JointPartnerCandidate,
} from "@/lib/import-preprocessor/fm-employee-schedule/joint-partner-candidates";
import { buildJointDetectionReasons } from "@/lib/import-preprocessor/fm-employee-schedule/joint-detection-reasons";
import { formatManualEditHistoryAt } from "@/lib/import-preprocessor/fm-employee-schedule/manual-edit-history";
import { findManualVehicleFillCandidates } from "@/lib/import-preprocessor/fm-employee-schedule/manual-vehicle-fill";
import { getEmployeeDayRecords } from "@/lib/import-preprocessor/fm-employee-schedule/manual-record-edit";
import { formatJointPartnerDisplay } from "@/lib/import-preprocessor/fm-employee-schedule/partner-display";
import type { FmManualRecordEditInput } from "@/lib/import-preprocessor/fm-employee-schedule/manual-record-edit";
import {
  FM_REVIEW_DECISION_LABELS,
  type FmReviewDecisionType,
} from "@/lib/import-preprocessor/fm-employee-schedule/review-decision";
import {
  FM_SCHEDULE_WARNING_LABELS,
  FM_WARNING_DISPOSITION_LABELS,
  type FmEmployeeScheduleStagingRecord,
  type FmScheduleWarningCode,
  type FmWarningDispositionStatus,
} from "@/lib/import-preprocessor/fm-employee-schedule/types";
import {
  canRevertToImport,
  canRevertToPreviousSave,
} from "@/lib/import-preprocessor/fm-employee-schedule/record-revert";
import type { FmWarningEditTarget } from "@/lib/import-preprocessor/fm-employee-schedule/warning-edit-queue";
import {
  getAllWarningDispositions,
  getWarningDisposition,
} from "@/lib/import-preprocessor/fm-employee-schedule/warning-tracking";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type FmEditModeContext = {
  focusWarning?: FmScheduleWarningCode;
};

type FmScheduleEditScreenProps = {
  record: FmEmployeeScheduleStagingRecord | null;
  allRecords: FmEmployeeScheduleStagingRecord[];
  open: boolean;
  context?: FmEditModeContext | null;
  onClose: () => void;
  onSave: (recordId: string, edit: FmManualRecordEditInput) => void;
  onSelectSibling?: (recordId: string) => void;
  onDismissWarning?: (recordId: string, flag: FmScheduleWarningCode) => void;
  onHoldWarning?: (recordId: string, flag: FmScheduleWarningCode) => void;
  onReopenWarning?: (recordId: string, flag: FmScheduleWarningCode) => void;
  onApplyReviewDecision?: (input: {
    jointJobKey: string;
    decisionType: FmReviewDecisionType;
  }) => void;
  warningQueue?: FmWarningEditTarget[];
  warningQueueIndex?: number;
  onNavigateWarning?: (target: FmWarningEditTarget) => void;
  onRevertToImport?: (recordId: string) => void;
  onRevertToPreviousSave?: (recordId: string) => void;
  onRevertHistoryEntry?: (recordId: string, historyEntryId: string) => void;
  saveFeedback?: string | null;
};

function effectiveVehicle(record: FmEmployeeScheduleStagingRecord): string {
  return (
    record.vehicleNumberOriginal.trim() || record.vehicleNumberFilled?.trim() || ""
  );
}

function recordStateLabel(record: FmEmployeeScheduleStagingRecord): string {
  if (record.jointOperationReviewDecision) {
    return FM_REVIEW_DECISION_LABELS[record.jointOperationReviewDecision];
  }
  if (record.requiresHumanReview) return "要確認";
  if (record.vehicleNumberFilled?.trim()) return "補完済み";
  return "原文";
}

function collectVehicleOptions(
  record: FmEmployeeScheduleStagingRecord,
  allRecords: FmEmployeeScheduleStagingRecord[],
): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  const push = (v: string) => {
    const t = v.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    options.push(t);
  };

  push(effectiveVehicle(record));
  for (const c of findManualVehicleFillCandidates(record, allRecords)) {
    push(c.vehicle);
  }
  for (const dayRow of getEmployeeDayRecords(record, allRecords)) {
    push(effectiveVehicle(dayRow));
  }

  return options;
}

function findCurrentPartnerId(
  record: FmEmployeeScheduleStagingRecord,
  candidates: JointPartnerCandidate[],
): string {
  const others = (record.jointOperationMembers ?? []).filter(
    (m) =>
      m.employeeNameOriginal.trim() !== record.employeeNameOriginal.trim() &&
      m.employeeNameCanonical?.trim() !== record.employeeNameCanonical?.trim(),
  );
  const partner = others[0];
  if (!partner) return candidates[0]?.id ?? "";

  const match = candidates.find(
    (c) =>
      c.name === partner.employeeNameOriginal ||
      c.label === partner.displayLabel,
  );
  return match?.id ?? candidates[0]?.id ?? "";
}

function dispositionBadgeClass(status: FmWarningDispositionStatus): string {
  switch (status) {
    case "needs_action":
      return "border-rose-300 bg-rose-50 text-rose-950";
    case "dismissed_ok":
      return "border-emerald-300 bg-emerald-50 text-emerald-950";
    case "on_hold":
      return "border-amber-300 bg-amber-50 text-amber-950";
  }
}

function WarningDispositionRow({
  recordId,
  flag,
  status,
  onDismiss,
  onHold,
  onReopen,
}: {
  recordId: string;
  flag: FmScheduleWarningCode;
  status: FmWarningDispositionStatus;
  onDismiss?: (recordId: string, flag: FmScheduleWarningCode) => void;
  onHold?: (recordId: string, flag: FmScheduleWarningCode) => void;
  onReopen?: (recordId: string, flag: FmScheduleWarningCode) => void;
}) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{FM_SCHEDULE_WARNING_LABELS[flag]}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            状態: {FM_WARNING_DISPOSITION_LABELS[status]}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm ${dispositionBadgeClass(status)}`}
        >
          {FM_WARNING_DISPOSITION_LABELS[status]}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {status === "needs_action" && (
          <>
            {onDismiss && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 text-sm"
                onClick={() => onDismiss(recordId, flag)}
              >
                問題なし
              </Button>
            )}
            {onHold && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 text-sm"
                onClick={() => onHold(recordId, flag)}
              >
                保留
              </Button>
            )}
          </>
        )}
        {status === "on_hold" && (
          <>
            {onDismiss && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 text-sm"
                onClick={() => onDismiss(recordId, flag)}
              >
                問題なし
              </Button>
            )}
            {onReopen && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 text-sm"
                onClick={() => onReopen(recordId, flag)}
              >
                要修正に戻す
              </Button>
            )}
          </>
        )}
        {status === "dismissed_ok" && onReopen && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 text-sm"
            onClick={() => onReopen(recordId, flag)}
          >
            要修正に戻す
          </Button>
        )}
      </div>
    </div>
  );
}

export function FmScheduleEditScreen({
  record,
  allRecords,
  open,
  context,
  onClose,
  onSave,
  onSelectSibling,
  onDismissWarning,
  onHoldWarning,
  onReopenWarning,
  onApplyReviewDecision,
  warningQueue = [],
  warningQueueIndex = -1,
  onNavigateWarning,
  onRevertToImport,
  onRevertToPreviousSave,
  onRevertHistoryEntry,
  saveFeedback,
}: FmScheduleEditScreenProps) {
  const [vehicle, setVehicle] = useState("");
  const [jointMode, setJointMode] = useState<"solo" | "two_man">("solo");
  const [partnerId, setPartnerId] = useState("");

  useEffect(() => {
    if (!record) return;
    setVehicle(effectiveVehicle(record));
    setJointMode(
      record.isJointOperation && record.jointOperationMemberCount >= 2
        ? "two_man"
        : "solo",
    );
    const candidates = findJointPartnerCandidates(
      record,
      allRecords,
      effectiveVehicle(record),
    );
    setPartnerId(findCurrentPartnerId(record, candidates));
  }, [record, allRecords]);

  const vehicleOptions = useMemo(
    () => (record ? collectVehicleOptions(record, allRecords) : []),
    [record, allRecords],
  );

  const partnerCandidates = useMemo(
    () =>
      record ? findJointPartnerCandidates(record, allRecords, vehicle) : [],
    [record, allRecords, vehicle],
  );

  const dayRecords = useMemo(
    () => (record ? getEmployeeDayRecords(record, allRecords) : []),
    [record, allRecords],
  );

  const detectionReasons = useMemo(
    () => (record ? buildJointDetectionReasons(record, allRecords) : []),
    [record, allRecords],
  );

  const warningDispositions = useMemo(
    () => (record ? getAllWarningDispositions(record) : []),
    [record],
  );

  const selectedPartner = partnerCandidates.find((c) => c.id === partnerId) ?? null;

  useEffect(() => {
    if (jointMode === "two_man" && !partnerId && partnerCandidates[0]) {
      setPartnerId(partnerCandidates[0].id);
    }
  }, [jointMode, partnerId, partnerCandidates]);

  if (!open || !record) return null;

  const employeeName =
    record.employeeNameCanonical?.trim() || record.employeeNameOriginal;
  const jobName = record.jobNameCanonical?.trim() || record.jobNameOriginal;
  const shipperName =
    record.shipperNameCanonical?.trim() || record.shipperNameOriginal;
  const focusWarning = context?.focusWarning;
  const focusStatus = focusWarning
    ? getWarningDisposition(record, focusWarning)
    : null;

  const handleSave = () => {
    onSave(record.id, {
      vehicle: vehicle.trim() || undefined,
      jointMode,
      partner: jointMode === "two_man" ? selectedPartner : null,
      editedBy: "管理者",
    });
  };

  const prevTarget =
    warningQueueIndex > 0 ? warningQueue[warningQueueIndex - 1] : null;
  const nextTarget =
    warningQueueIndex >= 0 && warningQueueIndex < warningQueue.length - 1
      ? warningQueue[warningQueueIndex + 1]
      : null;

  const showJointDecisionButtons =
    record.isJointOperation ||
    record.requiresHumanReview ||
    detectionReasons.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fm-edit-mode-title"
      >
        <div className="border-b bg-sky-50/80 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="fm-edit-mode-title" className="text-xl font-semibold text-sky-950">
                業務修正画面
              </h2>
              <p className="mt-1 text-base text-sky-900/80">
                行 {record.sourceRowNumber} / {employeeName} / {jobName}
              </p>
            </div>
            {warningQueue.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1 px-3 text-sm"
                  disabled={!prevTarget}
                  onClick={() => prevTarget && onNavigateWarning?.(prevTarget)}
                >
                  <ChevronLeft className="size-4" />
                  前の警告
                </Button>
                <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-sky-900">
                  {warningQueueIndex >= 0
                    ? `${warningQueueIndex + 1} / ${warningQueue.length}`
                    : `— / ${warningQueue.length}`}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1 px-3 text-sm"
                  disabled={!nextTarget}
                  onClick={() => nextTarget && onNavigateWarning?.(nextTarget)}
                >
                  次の警告
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
          {saveFeedback && (
            <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {saveFeedback}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {focusWarning && focusStatus && (
            <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-950">
              対象警告: {FM_SCHEDULE_WARNING_LABELS[focusWarning]}（
              {FM_WARNING_DISPOSITION_LABELS[focusStatus]}）
            </div>
          )}

          {detectionReasons.length > 0 && (
            <section className="mb-6 rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-4">
              <h3 className="mb-3 text-base font-semibold text-fuchsia-950">
                判定理由（共同作業）
              </h3>
              <ul className="space-y-2">
                {detectionReasons.map((reason) => (
                  <li
                    key={reason.code}
                    className="flex items-start gap-2 text-base text-fuchsia-950"
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fuchsia-500" />
                    <span>
                      {reason.label}
                      {reason.detail ? (
                        <span className="text-muted-foreground">
                          {" "}
                          — {reason.detail}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {warningDispositions.length > 0 && (
            <section className="mb-6 space-y-3 rounded-lg border border-rose-200 bg-rose-50/30 p-4">
              <h3 className="text-base font-semibold text-rose-950">警告対応</h3>
              {warningDispositions.map(({ flag, status }) => (
                <WarningDispositionRow
                  key={flag}
                  recordId={record.id}
                  flag={flag}
                  status={status}
                  onDismiss={onDismissWarning}
                  onHold={onHoldWarning}
                  onReopen={onReopenWarning}
                />
              ))}
            </section>
          )}

          <section className="mb-6 rounded-lg border bg-muted/20 p-4">
            <h3 className="mb-3 text-base font-semibold">
              同日の業務（{employeeName}）
            </h3>
            <ul className="space-y-2">
              {dayRecords.map((dayRow) => {
                const isTarget = dayRow.id === record.id;
                const dayVehicle = effectiveVehicle(dayRow) || "—";
                return (
                  <li key={dayRow.id}>
                    <button
                      type="button"
                      className={`flex w-full items-start justify-between gap-3 rounded-lg border px-4 py-3 text-left text-base transition-colors ${
                        isTarget
                          ? "border-sky-400 bg-sky-50 ring-2 ring-sky-300"
                          : "border-transparent bg-background hover:bg-muted/40"
                      }`}
                      onClick={() => {
                        if (!isTarget) onSelectSibling?.(dayRow.id);
                      }}
                    >
                      <div>
                        <span className="font-medium">
                          {dayRow.jobNameCanonical ?? dayRow.jobNameOriginal}
                        </span>
                        <span className="mt-0.5 block text-muted-foreground">
                          {dayRow.shipperNameCanonical ?? dayRow.shipperNameOriginal}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="block font-medium">{dayVehicle}</span>
                        <span className="text-muted-foreground">
                          {formatYen(dayRow.employeeRevenueShareAmount)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="space-y-5 text-base">
            <div>
              <p className="text-lg font-semibold">{record.businessDate}</p>
              <p className="text-lg">{employeeName}</p>
              <p className="mt-1 text-muted-foreground">
                業務：{jobName} / 荷主：{shipperName}
              </p>
            </div>

            <div>
              <Label className="text-base font-medium">社員売上</Label>
              <p className="mt-1 text-lg font-semibold text-emerald-800">
                {formatYen(record.employeeRevenueShareAmount)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fm-edit-vehicle" className="text-base font-medium">
                車番
              </Label>
              <Select
                value={vehicle ?? ""}
                onValueChange={(v) => {
                  setVehicle(v ?? "");
                }}
              >
                <SelectTrigger
                  id="fm-edit-vehicle"
                  className="h-14 min-h-[56px] w-full text-lg"
                >
                  <SelectValue placeholder="車番を選択" />
                </SelectTrigger>
                <SelectContent>
                  {vehicleOptions.map((v) => (
                    <SelectItem key={v} value={v} className="text-base py-2">
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vehicleOptions.length === 0 && (
                <input
                  className="h-14 w-full rounded-md border px-4 text-lg"
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="車番を入力（例: 24-90）"
                />
              )}
            </div>

            <fieldset className="space-y-3">
              <legend className="text-base font-medium">共同作業</legend>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50">
                <input
                  type="radio"
                  name="joint-mode"
                  className="size-5"
                  checked={jointMode === "solo"}
                  onChange={() => setJointMode("solo")}
                />
                <span className="text-base">単独</span>
              </label>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50">
                <input
                  type="radio"
                  name="joint-mode"
                  className="size-5"
                  checked={jointMode === "two_man"}
                  onChange={() => setJointMode("two_man")}
                />
                <span className="text-base">2名作業</span>
              </label>
            </fieldset>

            {jointMode === "two_man" && (
              <div className="space-y-3 rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-4">
                <Label className="text-base font-medium">共同作業相手</Label>
                {partnerCandidates.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {partnerCandidates.map((candidate) => (
                      <Button
                        key={candidate.id}
                        type="button"
                        variant={partnerId === candidate.id ? "default" : "outline"}
                        className="h-12 min-h-[48px] px-5 text-base font-medium"
                        onClick={() => setPartnerId(candidate.id)}
                      >
                        {candidate.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-base text-muted-foreground">
                    同日・同時間帯・同車番の候補が見つかりません。車番を先に選択してください。
                  </p>
                )}
                {selectedPartner && (
                  <p className="text-base text-fuchsia-900">
                    選択中: {selectedPartner.label}
                  </p>
                )}
              </div>
            )}

            {showJointDecisionButtons && onApplyReviewDecision && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <h3 className="text-base font-semibold text-amber-950">
                  共同作業の判断
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "separate_operations",
                      "joint_operation",
                      "ride_along_training",
                      "needs_review",
                    ] as FmReviewDecisionType[]
                  ).map((decisionType) => (
                    <Button
                      key={decisionType}
                      type="button"
                      variant={
                        record.jointOperationReviewDecision === decisionType
                          ? "default"
                          : "outline"
                      }
                      className="h-10 text-sm"
                      onClick={() =>
                        onApplyReviewDecision({
                          jointJobKey: record.jointJobKey,
                          decisionType,
                        })
                      }
                    >
                      {FM_REVIEW_DECISION_LABELS[decisionType]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-base font-medium">状態</Label>
              <p className="mt-1 inline-flex min-h-[44px] items-center rounded-md border bg-muted/30 px-4 text-base">
                {recordStateLabel(record)}
              </p>
              <p className="mt-1 text-base text-muted-foreground">
                現在: {formatJointPartnerDisplay(record)}
              </p>
            </div>

            {record.personalNote.trim() && (
              <div>
                <Label className="text-base font-medium">備考</Label>
                <p className="mt-1 rounded-md border bg-muted/20 px-4 py-3 text-base">
                  {record.personalNote}
                </p>
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <h3 className="text-base font-semibold text-slate-900">元に戻す</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 text-sm"
                  disabled={!canRevertToImport(record)}
                  onClick={() => onRevertToImport?.(record.id)}
                >
                  取込直後へ戻す
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 text-sm"
                  disabled={!canRevertToPreviousSave(record)}
                  onClick={() => onRevertToPreviousSave?.(record.id)}
                >
                  前回保存前へ戻す
                </Button>
              </div>
            </div>

            {(record.manualEditHistory?.length ?? 0) > 0 && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <h3 className="text-base font-semibold text-amber-950">修正履歴</h3>
                <ul className="space-y-3">
                  {record.manualEditHistory.map((entry) => (
                    <li
                      key={entry.id}
                      className={`rounded-md border bg-white px-4 py-3 text-base ${
                        entry.revertedAt
                          ? "border-slate-200 opacity-60"
                          : "border-amber-200/80"
                      }`}
                    >
                      <p className="font-medium">
                        {entry.fieldLabel}
                        {entry.revertedAt ? "（戻し済み）" : ""}
                      </p>
                      <p>変更前: {entry.beforeLabel}</p>
                      <p>変更後: {entry.afterLabel}</p>
                      {entry.rationale?.basisLines && (
                        <div className="mt-2 rounded border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-sm">
                          <p className="font-medium text-indigo-950">根拠</p>
                          <ul className="mt-1 list-inside list-disc text-indigo-900">
                            {entry.rationale.basisLines.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="mt-2 text-sm text-muted-foreground">
                        修正者: {entry.editedBy} / 修正日時:{" "}
                        {formatManualEditHistoryAt(entry.editedAt)}
                      </p>
                      {!entry.revertedAt && onRevertHistoryEntry && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 h-9 text-sm"
                          onClick={() =>
                            onRevertHistoryEntry(record.id, entry.id)
                          }
                        >
                          この項目だけ戻す
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-t bg-muted/20 px-5 py-4">
          <Button
            type="button"
            className="h-12 min-h-[48px] flex-1 text-base"
            onClick={handleSave}
            disabled={jointMode === "two_man" && !selectedPartner}
          >
            保存（画面を開いたまま）
          </Button>
          {nextTarget && (
            <Button
              type="button"
              variant="secondary"
              className="h-12 min-h-[48px] flex-1 text-base"
              onClick={() => onNavigateWarning?.(nextTarget)}
            >
              次の警告へ
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-12 min-h-[48px] flex-1 text-base"
            onClick={onClose}
          >
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}

/** @deprecated FmScheduleEditScreen を使用 */
export const FmScheduleEditModeDialog = FmScheduleEditScreen;
