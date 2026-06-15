"use client";

import { useCallback, useEffect, useState } from "react";
import { compareImportPipelines } from "@/lib/import-compare";
import { FileSearch, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FmScheduleViewFilter } from "@/lib/import-preprocessor/fm-employee-schedule/filters";
import { FM_SCHEDULE_WARNING_LABELS } from "@/lib/import-preprocessor/fm-employee-schedule/types";
import {
  applyFmRecordEditSession,
  applyFmScheduleReviewDecision,
  applyFmWarningDismiss,
  applyFmWarningHold,
  applyFmWarningReopen,
  applyShigaDeliveryManualEdit,
  bulkUpdateByCompanyOriginal,
  preprocessImportFile,
  revertShigaDeliveryRecordToImport,
  setRecordsWarningStatus,
  updatePreprocessRecord,
  type FmReviewDecisionScope,
  type FmReviewDecisionType,
  type FmScheduleWarningCode,
  type PreprocessLedgerContext,
  type PreprocessResult,
  type PreprocessSourceType,
  type PreprocessWarningStatus,
  type ShigaDeliveryManualEditInput,
} from "@/lib/import-preprocessor";
import type { RecordEditPatch } from "@/lib/import-preprocessor/record-state";
import type { MasterData } from "@/lib/types";
import {
  loadEmployeeDetails,
  loadJobDetails,
  loadVehicleDetails,
} from "@/services/firestore-storage";
import { ExportButtons } from "./ExportButtons";
import { FileUploadPanel } from "./FileUploadPanel";
import { ImportPreviewTable } from "./ImportPreviewTable";
import { NormalizeResultTable } from "./NormalizeResultTable";
import { PreprocessAmountSection } from "./PreprocessAmountSection";
import {
  PreprocessStickyNav,
  type ReviewTabId,
} from "./PreprocessStickyNav";
import { PreprocessSummarySection } from "./PreprocessSummarySection";
import { RecordEditDialog } from "./RecordEditDialog";
import {
  FmActionFeedbackBanner,
  type FmActionFeedback,
} from "./FmActionFeedbackBanner";
import {
  FmScheduleEditModeDialog,
  type FmEditModeContext,
} from "./FmScheduleEditModeDialog";
import { FmScheduleReviewTable } from "./FmScheduleReviewTable";
import {
  buildFmWarningEditQueue,
  findWarningEditIndex,
  type FmWarningEditTarget,
} from "@/lib/import-preprocessor/fm-employee-schedule/warning-edit-queue";
import {
  revertFmRecordHistoryEntry,
  revertFmRecordToImport,
  revertFmRecordToPreviousSave,
} from "@/lib/import-preprocessor/fm-employee-schedule/record-revert";
import type { FmManualRecordEditInput } from "@/lib/import-preprocessor/fm-employee-schedule/manual-record-edit";
import { ReviewFixPanel } from "./ReviewFixPanel";
import { ShigaDeliveryDetailDialog } from "./ShigaDeliveryDetailDialog";
import { ShigaDeliveryReviewTable } from "./ShigaDeliveryReviewTable";
import { ShigaDeliverySummaryPanel } from "./ShigaDeliverySummaryPanel";
import { ShigaFmReconciliationSection } from "./ShigaFmReconciliationSection";
import {
  PENDING_SHIGA_FM_CONTRACT_PARTNER_ID_KEY,
  PENDING_SHIGA_FM_SUB_TAB_KEY,
  PENDING_SHIGA_FM_WORKSPACE_MODE_KEY,
  type ShigaFmPendingSubTab,
} from "@/lib/shiga-fm-navigation";

import type { PartnerDetailSectionId } from "@/lib/partner-ledger-navigation";
import type { ShipperDetailSectionId } from "@/lib/shipper-ledger-navigation";

type PreprocessWorkspaceMode = "single" | "shiga_fm_reconcile";

type ImportPreprocessorTabProps = {
  masters?: MasterData | null;
  initialSourceType?: PreprocessSourceType | null;
  onInitialSourceTypeApplied?: () => void;
  initialWorkspaceMode?: PreprocessWorkspaceMode | null;
  initialShigaFmSubTab?: ShigaFmPendingSubTab | null;
  initialPartnerId?: string | null;
  onInitialShigaFmNavigationApplied?: () => void;
  onNavigateToPartnerDetail?: (
    partnerId: string,
    section?: PartnerDetailSectionId,
  ) => void;
  onNavigateToPartnerLedger?: () => void;
  onNavigateToShipperDetail?: (
    shipperId: string,
    section?: ShipperDetailSectionId,
  ) => void;
};

export function ImportPreprocessorTab({
  masters,
  initialSourceType,
  onInitialSourceTypeApplied,
  initialWorkspaceMode,
  initialShigaFmSubTab,
  initialPartnerId,
  onInitialShigaFmNavigationApplied,
  onNavigateToPartnerDetail,
  onNavigateToPartnerLedger,
  onNavigateToShipperDetail,
}: ImportPreprocessorTabProps) {
  const [sourceType, setSourceType] = useState<PreprocessSourceType>("amazon");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<PreprocessResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviewTab, setReviewTab] = useState<ReviewTabId>("warnings");
  const [fmFilter, setFmFilter] = useState<FmScheduleViewFilter>("all");
  const [fmWarningFlag, setFmWarningFlag] =
    useState<FmScheduleWarningCode | null>(null);
  const [fmLedger, setFmLedger] = useState<PreprocessLedgerContext | null>(null);
  const [lastModifiedRecordId, setLastModifiedRecordId] = useState<string | null>(
    null,
  );
  const [fmEditRecordId, setFmEditRecordId] = useState<string | null>(null);
  const [fmEditContext, setFmEditContext] = useState<FmEditModeContext | null>(
    null,
  );
  const [fmFeedback, setFmFeedback] = useState<FmActionFeedback | null>(null);
  const [fmSaveFeedback, setFmSaveFeedback] = useState<string | null>(null);
  const [shigaEditRecordId, setShigaEditRecordId] = useState<string | null>(null);
  const [shigaFeedback, setShigaFeedback] = useState<FmActionFeedback | null>(
    null,
  );
  const [shigaSaveFeedback, setShigaSaveFeedback] = useState<string | null>(
    null,
  );
  const [workspaceMode, setWorkspaceMode] =
    useState<PreprocessWorkspaceMode>(
      initialWorkspaceMode ?? "single",
    );
  const [shigaFmSubTab, setShigaFmSubTab] = useState<ShigaFmPendingSubTab | null>(
    initialShigaFmSubTab ?? null,
  );
  const [shigaFmPartnerId, setShigaFmPartnerId] = useState<string | null>(
    initialPartnerId ?? null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pendingMode = sessionStorage.getItem(
      PENDING_SHIGA_FM_WORKSPACE_MODE_KEY,
    );
    if (pendingMode === "shiga_fm_reconcile") {
      setWorkspaceMode("shiga_fm_reconcile");
      sessionStorage.removeItem(PENDING_SHIGA_FM_WORKSPACE_MODE_KEY);
    }
    const pendingSubTab = sessionStorage.getItem(PENDING_SHIGA_FM_SUB_TAB_KEY);
    if (pendingSubTab) {
      setShigaFmSubTab(pendingSubTab as ShigaFmPendingSubTab);
      sessionStorage.removeItem(PENDING_SHIGA_FM_SUB_TAB_KEY);
    }
    const pendingPartnerId = sessionStorage.getItem(
      PENDING_SHIGA_FM_CONTRACT_PARTNER_ID_KEY,
    );
    if (pendingPartnerId) {
      setShigaFmPartnerId(pendingPartnerId);
      sessionStorage.removeItem(PENDING_SHIGA_FM_CONTRACT_PARTNER_ID_KEY);
    }
  }, []);

  useEffect(() => {
    if (initialWorkspaceMode) {
      setWorkspaceMode(initialWorkspaceMode);
    }
    if (initialShigaFmSubTab) {
      setShigaFmSubTab(initialShigaFmSubTab);
    }
    if (initialPartnerId) {
      setShigaFmPartnerId(initialPartnerId);
    }
  }, [initialWorkspaceMode, initialShigaFmSubTab, initialPartnerId]);

  const fmWarningQueue =
    result?.sourceType === "filemaker_employee_schedule"
      ? buildFmWarningEditQueue(result.fmScheduleRecords ?? [])
      : [];

  const fmWarningQueueIndex =
    fmEditRecordId != null
      ? findWarningEditIndex(
          fmWarningQueue,
          fmEditRecordId,
          fmEditContext?.focusWarning,
        )
      : -1;

  const editingRecord =
    result?.records.find((r) => r.id === editingId) ?? null;

  const clearState = useCallback(() => {
    setResult(null);
    setStatusMessage("");
    setEditingId(null);
    setReviewTab("warnings");
    setFmFilter("all");
    setFmWarningFlag(null);
    setFmLedger(null);
    setLastModifiedRecordId(null);
    setFmEditRecordId(null);
    setFmEditContext(null);
    setFmFeedback(null);
    setFmSaveFeedback(null);
    setShigaEditRecordId(null);
    setShigaFeedback(null);
    setShigaSaveFeedback(null);
  }, []);

  useEffect(() => {
    if (!initialSourceType) return;
    setSourceType(initialSourceType);
    clearState();
    onInitialSourceTypeApplied?.();
  }, [initialSourceType, onInitialSourceTypeApplied, clearState]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (
      window as Window & {
        __compareImportPipelines?: typeof compareImportPipelines;
      }
    ).__compareImportPipelines = compareImportPipelines;
  }, []);

  const handlePreprocess = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setStatusMessage("");
    try {
      const file = files[0]!;
      let ledger: PreprocessLedgerContext | null = null;
      if (sourceType === "filemaker_employee_schedule") {
        const [employees, vehicles, jobs] = await Promise.all([
          loadEmployeeDetails(),
          loadVehicleDetails(),
          loadJobDetails(),
        ]);
        ledger = { employees, vehicles, jobs };
        setFmLedger(ledger);
      } else {
        setFmLedger(null);
      }
      const processed = await preprocessImportFile(
        sourceType,
        file,
        masters,
        ledger,
      );
      setResult(processed);
      if (processed.sourceType === "filemaker_employee_schedule") {
        const days = processed.fmEmployeeDaySummaries?.length ?? 0;
        const sales = processed.fmScheduleTotals?.sales ?? 0;
        const totals = processed.fmScheduleTotals;
        setStatusMessage(
          `前処理完了: ${processed.totalRows}行 / 社員日${days} / 売上合計¥${sales.toLocaleString()} / 未解決 社員${totals?.unresolvedEmployeeCount ?? 0}・車両${totals?.unresolvedVehicleCount ?? 0}・荷主${totals?.unresolvedShipperCount ?? 0}・業務${totals?.unresolvedJobCount ?? 0} / 警告${processed.warningRows}`,
        );
      } else if (processed.sourceType === "shiga_store_delivery") {
        const totals = processed.shigaDeliveryTotals;
        setStatusMessage(
          `前処理完了: 明細${processed.totalRows}件 / 日数${totals?.importedDayCount ?? 0} / 支払合計¥${(totals?.payTotal ?? 0).toLocaleString()} / 不一致${(totals?.dailyMismatchCount ?? 0) + (totals?.monthlyMismatchCount ?? 0)} / スキップ${totals?.skippedRowCount ?? 0}`,
        );
        setShigaFeedback({
          message: "滋賀店配データの取込が完了しました",
          detail: `${processed.totalRows} 件の明細を読み込みました`,
          tone: "success",
        });
      } else {
        const pending = processed.warningStatusSummary?.pending ?? 0;
        const dup = processed.duplicateRows;
        const unknown = processed.records.filter(
          (r) => r.operationType === "unknown",
        ).length;
        if (pending > 0) setReviewTab("warnings");
        else if (dup > 0) setReviewTab("duplicates");
        else if (unknown > 0) setReviewTab("company");
        setStatusMessage(
          `前処理完了: ${processed.totalRows}行 / 自社${countByType(processed, "own")} / 傭車${countByType(processed, "partner")} / 判定不明${unknown} / 正常${processed.successRows}`,
        );
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "前処理中に不明なエラー";
      setStatusMessage(`エラー: ${msg}`);
      window.alert(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = useCallback(
    (recordId: string, patch: RecordEditPatch) => {
      setResult((prev) =>
        prev ? updatePreprocessRecord(prev, recordId, patch) : prev,
      );
      setStatusMessage("行を更新しました（メモリのみ）");
    },
    [],
  );

  const handleSetWarningStatus = useCallback(
    (recordIds: string[], status: PreprocessWarningStatus) => {
      setResult((prev) =>
        prev ? setRecordsWarningStatus(prev, recordIds, status) : prev,
      );
      setStatusMessage("警告の確認状態を更新しました（メモリのみ）");
    },
    [],
  );

  const handleFmDismissWarning = useCallback(
    (recordId: string, flag: FmScheduleWarningCode) => {
      setResult((prev) => {
        if (!prev || prev.sourceType !== "filemaker_employee_schedule") return prev;
        return applyFmWarningDismiss({ result: prev, recordId, flag });
      });
      setLastModifiedRecordId(recordId);
      const pending = result?.fmScheduleTotals?.pendingWarningCount;
      setFmFeedback({
        message: `警告を「問題なし」にしました`,
        detail: pending != null ? `未対応警告: ${pending} 件` : undefined,
        tone: "success",
      });
      setStatusMessage("警告を「問題なし」にし、件数を再計算しました");
    },
    [result?.fmScheduleTotals?.pendingWarningCount],
  );

  const handleFmHoldWarning = useCallback(
    (recordId: string, flag: FmScheduleWarningCode) => {
      setResult((prev) => {
        if (!prev || prev.sourceType !== "filemaker_employee_schedule") return prev;
        return applyFmWarningHold({ result: prev, recordId, flag });
      });
      setLastModifiedRecordId(recordId);
      setFmFeedback({
        message: "警告を「保留」にしました",
        tone: "info",
      });
      setStatusMessage("警告を「保留」にし、件数を再計算しました");
    },
    [],
  );

  const handleFmReopenWarning = useCallback(
    (recordId: string, flag: FmScheduleWarningCode) => {
      setResult((prev) => {
        if (!prev || prev.sourceType !== "filemaker_employee_schedule") return prev;
        return applyFmWarningReopen({ result: prev, recordId, flag });
      });
      setLastModifiedRecordId(recordId);
      setStatusMessage("警告を「要修正」に戻し、件数を再計算しました");
    },
    [],
  );

  const handleFmWarningFlagFilter = useCallback((flag: FmScheduleWarningCode | null) => {
    setFmWarningFlag((prev) => (flag && prev === flag ? null : flag));
    if (flag) {
      setStatusMessage(
        `警告「${FM_SCHEDULE_WARNING_LABELS[flag]}」で絞り込み中`,
      );
    }
  }, []);

  const handleOpenFmEditMode = useCallback(
    (recordId: string, context?: FmEditModeContext) => {
      setFmEditRecordId(recordId);
      setFmEditContext(context ?? null);
      setFmSaveFeedback(null);
      const row = result?.fmScheduleRecords?.find((r) => r.id === recordId);
      setFmFeedback({
        message: `修正画面を開きました（行 ${row?.sourceRowNumber ?? "—"}）`,
        detail: context?.focusWarning
          ? `対象警告: ${FM_SCHEDULE_WARNING_LABELS[context.focusWarning]}`
          : undefined,
        tone: "info",
      });
    },
    [result?.fmScheduleRecords],
  );

  const handleNavigateWarning = useCallback((target: FmWarningEditTarget) => {
    setFmEditRecordId(target.recordId);
    setFmEditContext({ focusWarning: target.flag });
    setFmSaveFeedback(null);
    setFmFeedback({
      message: `警告 ${target.sourceRowNumber}行目: ${FM_SCHEDULE_WARNING_LABELS[target.flag]}`,
      detail: `${target.employeeName} / ${target.jobName}`,
      tone: "info",
    });
  }, []);

  const handleCloseFmEditMode = useCallback(() => {
    setFmEditRecordId(null);
    setFmEditContext(null);
  }, []);

  const handleFmManualRecordEdit = useCallback(
    (recordId: string, edit: FmManualRecordEditInput) => {
      setResult((prev) => {
        if (!prev || prev.sourceType !== "filemaker_employee_schedule") return prev;
        return applyFmRecordEditSession({
          result: prev,
          recordId,
          edit,
          masters,
          ledger: fmLedger,
        });
      });
      setLastModifiedRecordId(recordId);
      const labels: string[] = [];
      if (edit.vehicle) labels.push(`車番: ${edit.vehicle}`);
      if (edit.jointMode === "solo") labels.push("共同作業: 単独");
      if (edit.jointMode === "two_man") labels.push("共同作業: 2名");
      const detail = labels.length > 0 ? labels.join(" / ") : "変更を保存しました";
      setFmSaveFeedback(`保存しました。${detail}`);
      setFmFeedback({
        message: "保存しました（修正画面は開いたままです）",
        detail,
        tone: "success",
      });
      setStatusMessage("保存しました。警告件数を再計算しました");
    },
    [masters, fmLedger],
  );

  const handleRevertToImport = useCallback(
    (recordId: string) => {
      if (!window.confirm("この行を取込直後の状態に戻しますか？")) return;
      setResult((prev) => {
        if (!prev || prev.sourceType !== "filemaker_employee_schedule") return prev;
        return revertFmRecordToImport({ result: prev, recordId });
      });
      setLastModifiedRecordId(recordId);
      setFmFeedback({ message: "取込直後の状態に戻しました", tone: "warn" });
    },
    [],
  );

  const handleRevertToPreviousSave = useCallback(
    (recordId: string) => {
      if (!window.confirm("前回保存前の状態に戻しますか？")) return;
      setResult((prev) => {
        if (!prev || prev.sourceType !== "filemaker_employee_schedule") return prev;
        return revertFmRecordToPreviousSave({
          result: prev,
          recordId,
          masters,
          ledger: fmLedger,
        });
      });
      setLastModifiedRecordId(recordId);
      setFmFeedback({ message: "前回保存前の状態に戻しました", tone: "warn" });
    },
    [masters, fmLedger],
  );

  const handleRevertHistoryEntry = useCallback(
    (recordId: string, historyEntryId: string) => {
      if (!window.confirm("この項目だけ元に戻しますか？")) return;
      setResult((prev) => {
        if (!prev || prev.sourceType !== "filemaker_employee_schedule") return prev;
        return revertFmRecordHistoryEntry({
          result: prev,
          recordId,
          historyEntryId,
          masters,
          ledger: fmLedger,
        });
      });
      setLastModifiedRecordId(recordId);
      setFmFeedback({ message: "項目単位で元に戻しました", tone: "warn" });
    },
    [masters, fmLedger],
  );

  const handleFmClearFilter = useCallback(() => {
    setFmFilter("all");
    setFmWarningFlag(null);
    setStatusMessage("フィルタを解除しました");
  }, []);

  const handleFmReviewDecision = useCallback(
    (input: {
      jointJobKey: string;
      decisionType: FmReviewDecisionType;
      scope: FmReviewDecisionScope;
      saveRule: boolean;
    }) => {
      setResult((prev) => {
        if (!prev || prev.sourceType !== "filemaker_employee_schedule") return prev;
        return applyFmScheduleReviewDecision({
          result: prev,
          ...input,
        });
      });
      setStatusMessage("共同作業の判断を適用し、売上検算を再計算しました");
      setLastModifiedRecordId(null);
    },
    [],
  );

  const handleOpenShigaDetail = useCallback(
    (recordId: string) => {
      setShigaEditRecordId(recordId);
      setShigaSaveFeedback(null);
      const row = result?.shigaDeliveryRecords?.find((r) => r.id === recordId);
      setLastModifiedRecordId(recordId);
      setShigaFeedback({
        message: "明細を開きました",
        detail: row
          ? `${row.businessDate} / ${row.courseName} / 行 ${row.sourceRowNumber}`
          : undefined,
        tone: "info",
      });
    },
    [result?.shigaDeliveryRecords],
  );

  const handleShigaWarningClick = useCallback(
    (record: NonNullable<PreprocessResult["shigaDeliveryRecords"]>[number]) => {
      setShigaFeedback({
        message: `警告を表示: ${record.courseName}`,
        detail: record.warningMessages.join(" / ") || "詳細は明細を確認してください",
        tone: "warn",
      });
    },
    [],
  );

  const handleShigaManualEdit = useCallback(
    (recordId: string, edit: ShigaDeliveryManualEditInput) => {
      setResult((prev) => {
        if (!prev || prev.sourceType !== "shiga_store_delivery") return prev;
        return applyShigaDeliveryManualEdit({ result: prev, recordId, edit });
      });
      setLastModifiedRecordId(recordId);
      setShigaSaveFeedback("保存しました。サマリーを再計算しました");
      setShigaFeedback({
        message: "保存しました",
        tone: "success",
      });
      setStatusMessage("滋賀店配明細を保存しました（メモリのみ）");
    },
    [],
  );

  const handleRevertShigaRecord = useCallback((recordId: string) => {
    if (!window.confirm("この明細を取込直後の状態に戻しますか？")) return;
    setResult((prev) => {
      if (!prev || prev.sourceType !== "shiga_store_delivery") return prev;
      return revertShigaDeliveryRecordToImport({ result: prev, recordId });
    });
    setShigaSaveFeedback(null);
    setShigaFeedback({
      message: "取込直後の状態に戻しました",
      tone: "warn",
    });
  }, []);

  const handleBulkApply = useCallback(
    (
      companyOriginal: string,
      operationType: Parameters<typeof bulkUpdateByCompanyOriginal>[2],
      companyNormalized: string,
    ) => {
      setResult((prev) =>
        prev
          ? bulkUpdateByCompanyOriginal(
              prev,
              companyOriginal,
              operationType,
              companyNormalized,
            )
          : prev,
      );
      setStatusMessage(`「${companyOriginal || "（空欄）"}」を一括更新しました`);
    },
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50/40 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-indigo-950">
            <FileSearch className="size-5" />
            データ前処理
          </h2>
          <p className="mt-1 text-sm text-indigo-900/80">
            各種ファイルを統一フォーマットに変換し、JSON/CSV で出力します。
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-white px-3 py-1 text-xs font-medium text-indigo-800">
          <ShieldOff className="size-3.5" />
          Firestore 保存なし
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={workspaceMode === "single" ? "default" : "outline"}
          size="sm"
          onClick={() => setWorkspaceMode("single")}
        >
          単一ファイル前処理
        </Button>
        <Button
          type="button"
          variant={workspaceMode === "shiga_fm_reconcile" ? "default" : "outline"}
          size="sm"
          onClick={() => setWorkspaceMode("shiga_fm_reconcile")}
        >
          滋賀店配×FM突合
        </Button>
      </div>

      {workspaceMode === "shiga_fm_reconcile" ? (
        <ShigaFmReconciliationSection
          masters={masters}
          initialSubTab={shigaFmSubTab}
          initialPartnerId={shigaFmPartnerId}
          onInitialNavigationApplied={() => {
            setShigaFmSubTab(null);
            setShigaFmPartnerId(null);
            onInitialShigaFmNavigationApplied?.();
          }}
          onNavigateToPartnerDetail={onNavigateToPartnerDetail}
          onNavigateToPartnerLedger={onNavigateToPartnerLedger}
          onNavigateToShipperDetail={onNavigateToShipperDetail}
        />
      ) : (
      <>
      <section className="space-y-4">
        <FileUploadPanel
          sourceType={sourceType}
          onSourceTypeChange={(t) => {
            setSourceType(t);
            clearState();
          }}
          files={files}
          onAddFiles={(list) => {
            setFiles(Array.from(list).slice(0, 1));
            clearState();
          }}
          onClearFiles={() => {
            setFiles([]);
            clearState();
          }}
          busy={busy}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={files.length === 0 || busy}
            onClick={() => void handlePreprocess()}
          >
            {busy ? "前処理中…" : "前処理を実行（プレビュー）"}
          </Button>
        {statusMessage && (
          <p className="self-center text-sm text-muted-foreground">
            {statusMessage}
          </p>
        )}
        {process.env.NODE_ENV !== "production" && files.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void compareImportPipelines(files[0]!, sourceType, masters).catch(
                (e) => console.error(e),
              )
            }
          >
            旧新比較（console）
          </Button>
        )}
      </div>
      </section>

      {result &&
        result.sourceType !== "filemaker_employee_schedule" &&
        result.sourceType !== "shiga_store_delivery" && (
        <PreprocessStickyNav
          result={result}
          onNavigate={setReviewTab}
        />
      )}

      {result?.sourceType === "filemaker_employee_schedule" && (
        <FmActionFeedbackBanner
          feedback={fmFeedback}
          onDismiss={() => setFmFeedback(null)}
        />
      )}

      {result?.sourceType === "shiga_store_delivery" && (
        <FmActionFeedbackBanner
          feedback={shigaFeedback}
          onDismiss={() => setShigaFeedback(null)}
        />
      )}

      {result?.sourceType === "shiga_store_delivery" ? (
        <ShigaDeliverySummaryPanel result={result} />
      ) : (
        <PreprocessSummarySection
          result={result}
          fmActiveFilter={
            result?.sourceType === "filemaker_employee_schedule"
              ? fmFilter
              : undefined
          }
          onFmFilterChange={
            result?.sourceType === "filemaker_employee_schedule"
              ? setFmFilter
              : undefined
          }
        />
      )}
      {result?.sourceType !== "filemaker_employee_schedule" &&
        result?.sourceType !== "shiga_store_delivery" && (
        <PreprocessAmountSection result={result} />
      )}

      {result?.sourceType === "shiga_store_delivery" && (
        <ShigaDeliveryReviewTable
          result={result}
          lastOpenedRecordId={lastModifiedRecordId}
          onOpenDetail={handleOpenShigaDetail}
          onWarningClick={handleShigaWarningClick}
        />
      )}

      <FmScheduleReviewTable
        result={result}
        activeFilter={fmFilter}
        activeWarningFlag={fmWarningFlag}
        lastModifiedRecordId={lastModifiedRecordId}
        onFilterChange={setFmFilter}
        onWarningFlagFilter={handleFmWarningFlagFilter}
        onClearFilter={handleFmClearFilter}
        onDismissWarning={handleFmDismissWarning}
        onOpenEditMode={handleOpenFmEditMode}
      />

      <FmScheduleEditModeDialog
        record={
          result?.sourceType === "filemaker_employee_schedule"
            ? (result.fmScheduleRecords?.find((r) => r.id === fmEditRecordId) ??
              null)
            : null
        }
        allRecords={
          result?.sourceType === "filemaker_employee_schedule"
            ? (result.fmScheduleRecords ?? [])
            : []
        }
        open={Boolean(fmEditRecordId)}
        context={fmEditContext}
        onClose={handleCloseFmEditMode}
        onSave={handleFmManualRecordEdit}
        saveFeedback={fmSaveFeedback}
        warningQueue={fmWarningQueue}
        warningQueueIndex={fmWarningQueueIndex}
        onNavigateWarning={handleNavigateWarning}
        onDismissWarning={handleFmDismissWarning}
        onHoldWarning={handleFmHoldWarning}
        onReopenWarning={handleFmReopenWarning}
        onRevertToImport={handleRevertToImport}
        onRevertToPreviousSave={handleRevertToPreviousSave}
        onRevertHistoryEntry={handleRevertHistoryEntry}
        onApplyReviewDecision={({ jointJobKey, decisionType }) => {
          handleFmReviewDecision({
            jointJobKey,
            decisionType,
            scope: "same_shipper_job",
            saveRule: true,
          });
        }}
        onSelectSibling={(recordId) => {
          setFmEditRecordId(recordId);
          setFmEditContext(null);
        }}
      />

      <ShigaDeliveryDetailDialog
        record={
          result?.sourceType === "shiga_store_delivery"
            ? (result.shigaDeliveryRecords?.find(
                (r) => r.id === shigaEditRecordId,
              ) ?? null)
            : null
        }
        open={Boolean(shigaEditRecordId)}
        saveFeedback={shigaSaveFeedback}
        onClose={() => setShigaEditRecordId(null)}
        onSave={handleShigaManualEdit}
        onRevert={handleRevertShigaRecord}
      />

      {result?.sourceType !== "filemaker_employee_schedule" &&
        result?.sourceType !== "shiga_store_delivery" && (
      <ReviewFixPanel
        result={result}
        activeTab={reviewTab}
        onTabChange={setReviewTab}
        onSetWarningStatus={handleSetWarningStatus}
        onEditRow={(id) => setEditingId(id)}
        onBulkApply={handleBulkApply}
      />
      )}

      {result?.sourceType !== "filemaker_employee_schedule" &&
        result?.sourceType !== "shiga_store_delivery" && (
        <ImportPreviewTable
          result={result}
          onEditRow={(id) => setEditingId(id)}
        />
      )}

      {result?.sourceType !== "filemaker_employee_schedule" &&
        result?.sourceType !== "shiga_store_delivery" && (
        <NormalizeResultTable result={result} />
      )}
      <ExportButtons result={result} />

      <RecordEditDialog
        record={editingRecord}
        open={editingId != null}
        onClose={() => setEditingId(null)}
        onSave={handleSaveEdit}
      />
      </>
      )}
    </div>
  );
}

function countByType(
  result: PreprocessResult,
  type: PreprocessResult["records"][number]["operationType"],
): number {
  return result.records.filter((r) => r.operationType === type).length;
}
