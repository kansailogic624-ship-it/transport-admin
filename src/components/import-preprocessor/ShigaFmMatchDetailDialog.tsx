"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatYen } from "@/lib/currency-format";
import { formatDisplayDate } from "@/lib/excel-date";
import {
  SHIGA_FM_MATCH_STATUS_LABELS,
  type ShigaFmInputMode,
  type ShigaFmReconciliationRow,
} from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import { SHIGA_FM_COST_CATEGORY_LABELS } from "@/lib/import-preprocessor/shiga-fm-reconciliation/cost-classifier";
import { findPartnerProfileByName } from "@/lib/partner-company-utils";
import { resolveShipperIdFromBillingGapRows } from "@/lib/shipper-billing-gap-utils";
import type { PartnerDetailSectionId } from "@/lib/partner-ledger-navigation";
import type { ShipperDetailSectionId } from "@/lib/shipper-ledger-navigation";
import type { MasterData } from "@/lib/types";
import { DEFAULT_MASTERS } from "@/lib/types";
import {
  CONTRACT_REGISTERED_VS_CONFIRMED,
  FM_SHORTAGE_EXPLANATION,
} from "@/lib/shiga-fm/fm-shortage-ui-messages";
import {
  buildDetailDialogIssueView,
  RECONCILE_ISSUE_CODE_LABELS,
  type ReconcileIssue,
  type ReconcileIssueSeverity,
} from "@/lib/reconcile-core";
import type { FmActionFeedback } from "./FmActionFeedbackBanner";
import { cn } from "@/lib/utils";

type ShigaFmMatchDetailDialogProps = {
  row: ShigaFmReconciliationRow | null;
  inputMode?: ShigaFmInputMode;
  masters?: MasterData | null;
  open: boolean;
  onClose: () => void;
  onOpenAssignment?: (slotKey: string) => void;
  onNavigateToPartnerDetail?: (
    partnerId: string,
    section?: PartnerDetailSectionId,
  ) => void;
  onNavigateToShipperDetail?: (
    shipperId: string,
    section?: ShipperDetailSectionId,
  ) => void;
  onActionFeedback?: (feedback: FmActionFeedback) => void;
};

function formatDetailAmount(
  amount: number,
  inputMode: ShigaFmInputMode | undefined,
  column: "sales" | "payment" | "profit",
): string {
  if (!inputMode || inputMode === "both") return formatYen(amount);
  if (inputMode === "shiga_only" && (column === "sales" || column === "profit")) {
    return "—";
  }
  if (inputMode === "fm_only" && (column === "payment" || column === "profit")) {
    return "—";
  }
  return formatYen(amount);
}

function formatDetailRate(
  rate: number | null,
  inputMode: ShigaFmInputMode | undefined,
): string {
  if (!inputMode || inputMode !== "both") return "—";
  return rate != null ? `${rate.toFixed(2)}%` : "—";
}

function issueSeverityClass(severity: ReconcileIssueSeverity): string {
  switch (severity) {
    case "needs_action":
      return "border-orange-300 bg-orange-50";
    case "error":
      return "border-red-300 bg-red-50";
    case "warning":
      return "border-amber-300 bg-amber-50";
    default:
      return "border-muted bg-muted/30";
  }
}

export function ShigaFmMatchDetailDialog({
  row,
  inputMode,
  masters,
  open,
  onClose,
  onOpenAssignment,
  onNavigateToPartnerDetail,
  onNavigateToShipperDetail,
  onActionFeedback,
}: ShigaFmMatchDetailDialogProps) {
  const [actionNotice, setActionNotice] = useState<FmActionFeedback | null>(
    null,
  );

  useEffect(() => {
    if (open) {
      setActionNotice(null);
    }
  }, [open, row?.id]);

  if (!open || !row) return null;

  const detailRow = row;
  const masterData = masters ?? DEFAULT_MASTERS;
  const paymentPartnerId =
    detailRow.paymentPartyId ??
    (detailRow.paymentParty
      ? (findPartnerProfileByName(masterData, detailRow.paymentParty)?.id ?? null)
      : null);
  const billingShipperId =
    detailRow.billingPartyId ??
    resolveShipperIdFromBillingGapRows(masterData, [detailRow]);

  const issueView = buildDetailDialogIssueView(detailRow);
  const showContractActions =
    inputMode === "both" && detailRow.status === "mapping_failed";

  const showContractSection =
    inputMode === "both" &&
    (detailRow.paymentContractLabel ||
      detailRow.billingContractLabel ||
      detailRow.costCategory === "partner");

  const modeNotice =
    inputMode === "shiga_only"
      ? "FMスケジュール未取込のため、支払データのみ表示しています"
      : inputMode === "fm_only"
        ? "滋賀店配未取込のため、FM売上データのみ表示しています"
        : null;

  function emitFeedback(feedback: FmActionFeedback): void {
    setActionNotice(feedback);
    onActionFeedback?.(feedback);
  }

  function handleOpenAssignment(): void {
    if (!onOpenAssignment) return;
    emitFeedback({
      message: "傭車・アルバイト入力を開きます",
      detail: `${formatDisplayDate(detailRow.businessDate)} / ${detailRow.jobName}（スロット ${detailRow.slotIndex}）`,
      tone: "info",
    });
    onOpenAssignment(detailRow.slotKey);
    onClose();
  }

  function handleNavigateToPaymentContract(): void {
    if (!paymentPartnerId || !onNavigateToPartnerDetail) return;
    emitFeedback({
      message: "協力会社台帳へ移動します",
      detail: `${detailRow.paymentParty} / 支払契約`,
      tone: "info",
    });
    onNavigateToPartnerDetail(paymentPartnerId, "contracts");
    onClose();
  }

  function handleNavigateToBillingContract(): void {
    if (!billingShipperId || !onNavigateToShipperDetail) return;
    emitFeedback({
      message: "荷主台帳へ移動します",
      detail: `${detailRow.billingParty} / 請求契約`,
      tone: "info",
    });
    onNavigateToShipperDetail(billingShipperId, "billing");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shiga-fm-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b bg-violet-50/80 px-5 py-4">
          <h2
            id="shiga-fm-detail-title"
            className="text-xl font-semibold text-violet-950"
          >
            突合詳細
          </h2>
          <p className="mt-1 text-sm text-violet-900/80">
            {formatDisplayDate(detailRow.businessDate)} / {detailRow.courseName ?? "—"} /{" "}
            {detailRow.unitCount > 1
              ? `スロット ${detailRow.slotIndex}/${detailRow.unitCount}（${detailRow.jobName}）`
              : detailRow.jobName}{" "}
            / {SHIGA_FM_MATCH_STATUS_LABELS[detailRow.status]}
          </p>
          {modeNotice && (
            <p className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              {modeNotice}
            </p>
          )}
          {detailRow.status === "fm_shortage" && (
            <div className="mt-2 space-y-1 rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-xs text-orange-950">
              <p>{FM_SHORTAGE_EXPLANATION}</p>
              <p className="text-orange-900/90">{CONTRACT_REGISTERED_VS_CONFIRMED}</p>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <Section title="突合キー">
            <p className="font-mono text-xs break-all">{detailRow.matchKey || "—"}</p>
          </Section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="請求先" value={detailRow.billingParty} />
            <Info label="支払先" value={detailRow.paymentParty} />
            <Info
              label="原価区分"
              value={SHIGA_FM_COST_CATEGORY_LABELS[detailRow.costCategory]}
            />
            <Info label="契約種別" value={detailRow.contractTypeLabel ?? "—"} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info
              label="売上(FM)"
              value={formatDetailAmount(detailRow.salesAmount, inputMode, "sales")}
            />
            <Info
              label="支払原価"
              value={
                detailRow.costCategory === "employee" && detailRow.paymentAmount === 0
                  ? "¥0（自社社員）"
                  : formatDetailAmount(detailRow.paymentAmount, inputMode, "payment")
              }
            />
            <Info
              label="利益額"
              value={formatDetailAmount(
                detailRow.grossProfitAmount,
                inputMode,
                "profit",
              )}
            />
            <Info
              label="利益率"
              value={formatDetailRate(detailRow.grossProfitRate, inputMode)}
            />
          </div>

          {showContractSection && (
            <Section title="契約・計算">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Info
                  label="支払契約"
                  value={detailRow.paymentContractLabel ?? "—"}
                />
                <Info
                  label="請求契約"
                  value={detailRow.billingContractLabel ?? "—"}
                />
                <Info
                  label="契約請求額"
                  value={formatDetailAmount(detailRow.salesAmount, inputMode, "sales")}
                />
                <Info
                  label="契約支払額"
                  value={formatDetailAmount(
                    detailRow.paymentAmount,
                    inputMode,
                    "payment",
                  )}
                />
              </div>
            </Section>
          )}

          {detailRow.notes.length > 0 && (
            <Section title="備考">
              <ul className="list-inside list-disc text-muted-foreground">
                {detailRow.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Section>
          )}

          {detailRow.matchNotes.length > 0 && (
            <Section title="突合根拠">
              <ul className="list-inside list-disc text-emerald-900">
                {detailRow.matchNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Section>
          )}

          {issueView.showIssueSection && (
            <Section title="確認事項">
              <div className="space-y-2">
                {issueView.displayIssues.map((issue, index) => (
                  <IssueCard
                    key={`${issue.code}-${issue.message}-${index}`}
                    issue={issue}
                  />
                ))}
              </div>

              {issueView.fallbackReasons.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    その他の不一致理由
                  </p>
                  <ul className="list-inside list-disc text-red-800">
                    {issueView.fallbackReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {showContractActions && issueView.paymentContractGap && (
                <div className="mt-3">
                  {paymentPartnerId && onNavigateToPartnerDetail ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 border-amber-400 text-amber-900"
                      onClick={handleNavigateToPaymentContract}
                    >
                      <ExternalLink className="size-3.5" />
                      {detailRow.paymentParty} の支払契約を登録
                    </Button>
                  ) : (
                    <p className="text-xs text-amber-900">
                      協力会社をマスタで特定できません。{detailRow.paymentParty}{" "}
                      の台帳を確認してください。
                    </p>
                  )}
                </div>
              )}

              {showContractActions && issueView.billingContractGap && (
                <div className="mt-3">
                  {billingShipperId && onNavigateToShipperDetail ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 border-sky-400 text-sky-900"
                      onClick={handleNavigateToBillingContract}
                    >
                      <ExternalLink className="size-3.5" />
                      {detailRow.billingParty} の請求契約を登録
                    </Button>
                  ) : (
                    <p className="text-xs text-sky-900">
                      荷主をマスタで特定できません。{detailRow.billingParty}{" "}
                      の台帳を確認してください。
                    </p>
                  )}
                </div>
              )}
            </Section>
          )}

          {detailRow.shigaRecord && (
            <Section title="滋賀店配側">
              <div className="grid gap-2 sm:grid-cols-2">
                <Info label="行番号" value={String(detailRow.shigaRecord.sourceRowNumber)} />
                <Info label="コースID" value={detailRow.shigaRecord.courseId} />
                <Info label="業者コード" value={detailRow.shigaRecord.vendorCode} />
                <Info label="業者名" value={detailRow.shigaRecord.vendorName} />
                <Info label="台数" value={String(detailRow.shigaRecord.unitCount)} />
                <Info
                  label="支払合計"
                  value={formatYen(detailRow.shigaRecord.coursePayTotal)}
                />
              </div>
            </Section>
          )}

          {detailRow.fmRecords.length > 0 && (
            <Section title="FMスケジュール側">
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2 py-1">行</th>
                      <th className="px-2 py-1">荷主</th>
                      <th className="px-2 py-1">業務</th>
                      <th className="px-2 py-1">社員</th>
                      <th className="px-2 py-1">車番</th>
                      <th className="px-2 py-1 text-right">売上</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRow.fmRecords.map((fm) => (
                      <tr key={fm.recordId} className="border-t">
                        <td className="px-2 py-1">{fm.sourceRowNumber}</td>
                        <td className="px-2 py-1">{fm.shipperNameOriginal}</td>
                        <td className="px-2 py-1">{fm.jobNameOriginal}</td>
                        <td className="px-2 py-1">{fm.employeeNameOriginal}</td>
                        <td className="px-2 py-1">{fm.vehicleNumber}</td>
                        <td className="px-2 py-1 text-right">
                          {formatYen(fm.revenueAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>

        {actionNotice && (
          <div
            className="border-t border-sky-200 bg-sky-50 px-5 py-2 text-sm text-sky-950"
            role="status"
            aria-live="polite"
          >
            <p className="font-medium">{actionNotice.message}</p>
            {actionNotice.detail && (
              <p className="text-xs opacity-90">{actionNotice.detail}</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t bg-muted/20 px-5 py-4 sm:flex-detailRow sm:justify-between">
          {detailRow.status === "fm_shortage" && onOpenAssignment && (
            <Button
              type="button"
              className="gap-1 bg-orange-600 hover:bg-orange-700"
              onClick={handleOpenAssignment}
            >
              <ExternalLink className="size-4" />
              傭車・アルバイト入力を開く
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:ml-auto sm:w-auto"
            onClick={onClose}
          >
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: ReconcileIssue }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        issueSeverityClass(issue.severity),
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-background/80 px-2 py-0.5 text-xs font-medium">
          {RECONCILE_ISSUE_CODE_LABELS[issue.code]}
        </span>
      </div>
      <p className="mt-1 text-sm">{issue.message}</p>
      {issue.code === "requires_manual_input" && (
        <p className="mt-1 text-xs text-orange-900">
          手入力が必要です。画面下部のボタンから入力できます。
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="mb-2 font-medium">{title}</p>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
