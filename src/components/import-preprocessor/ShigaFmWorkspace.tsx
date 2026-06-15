"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, GitCompareArrows } from "lucide-react";
import { PartnerContractMasterView } from "@/components/partner-contract-master-view";
import { ImportDropZone } from "@/components/import-drop-zone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildShigaFmReconciliationResult,
  preprocessImportFile,
  type PreprocessLedgerContext,
  type PreprocessResult,
} from "@/lib/import-preprocessor";
import type { ShigaFmReconciliationResult } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import {
  countPartnerPaymentContractGaps,
  countShipperBillingContractGaps,
} from "@/lib/import-preprocessor/shiga-fm-reconciliation/apply-assignments";
import type { ShigaFmSlotAssignment } from "@/lib/import-preprocessor/shiga-fm-reconciliation/slot-assignment-types";
import type { PartnerPaymentContract } from "@/lib/shiga-fm/partner-payment-types";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import { linkContractsToPartnerProfiles } from "@/lib/partner-contract-migrate";
import type { ShigaFmPendingSubTab } from "@/lib/shiga-fm-navigation";
import type { PartnerDetailSectionId } from "@/lib/partner-ledger-navigation";
import type { ShipperDetailSectionId } from "@/lib/shipper-ledger-navigation";
import { resolvePartnerIdFromContractGapRows } from "@/lib/partner-contract-gap-utils";
import {
  resolveBillingShipperId,
  resolveShipperIdFromBillingGapRows,
} from "@/lib/shipper-billing-gap-utils";
import type { MasterData } from "@/lib/types";
import { DEFAULT_MASTERS } from "@/lib/types";
import {
  loadEmployeeDetails,
  loadJobDetails,
  loadVehicleDetails,
} from "@/services/firestore-storage";
import { loadPartnerContractRates } from "@/services/partner-contract-storage";
import { loadShipperBillingContracts } from "@/services/shipper-billing-contract-storage";
import {
  deleteShigaFmSlotAssignment,
  loadShigaFmSlotAssignments,
  upsertShigaFmSlotAssignment,
} from "@/services/shiga-fm-slot-assignment-storage";
import { buildDefaultPartnerContractDrafts } from "@/lib/shiga-fm/default-contracts";
import type { PartnerPaymentContractDraft } from "@/lib/shiga-fm/partner-payment-types";
import { cn } from "@/lib/utils";
import {
  FmActionFeedbackBanner,
  type FmActionFeedback,
} from "./FmActionFeedbackBanner";
import { ShigaFmMatchDetailDialog } from "./ShigaFmMatchDetailDialog";
import {
  ShigaFmMatchReviewTable,
  type ShigaFmMatchFilter,
} from "./ShigaFmMatchReviewTable";
import { ShigaFmMatchSummaryPanel } from "./ShigaFmMatchSummaryPanel";
import {
  ShigaFmSlotAssignmentDialog,
  type ShigaFmSlotAssignmentFormValues,
} from "./ShigaFmSlotAssignmentDialog";
import { ShigaFmSlotAssignmentPanel } from "./ShigaFmSlotAssignmentPanel";
import { ShigaFmDataStatusPanel } from "./ShigaFmDataStatusPanel";
import { ShigaFmNextStepsPanel } from "./ShigaFmNextStepsPanel";
import { ShigaFmSessionPanel } from "./ShigaFmSessionPanel";
import { RECONCILE_CONTRACT_REFRESH_NOTE } from "@/lib/shiga-fm/fm-shortage-ui-messages";
import { enrichShigaFmReconciliationResult } from "@/lib/reconcile-core";
import {
  buildShigaFmSessionDocument,
  formatMonthPeriodLabel,
  SHIGA_FM_ACTIVE_MONTH_STORAGE_KEY,
  toSessionSummary,
} from "@/lib/shiga-fm/session-utils";
import type { ShigaFmSessionSummary } from "@/lib/shiga-fm/session-types";
import {
  deleteShigaFmSession,
  listShigaFmSessionSummaries,
  loadShigaFmSession,
  saveShigaFmSession,
} from "@/services/shiga-fm-session-storage";

type ShigaFmWorkspaceProps = {
  masters?: MasterData | null;
  initialSubTab?: ShigaFmPendingSubTab | null;
  initialPartnerId?: string | null;
  onInitialNavigationApplied?: () => void;
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

type ShigaFmSubTab = ShigaFmPendingSubTab;

function draftsToRates(drafts: PartnerPaymentContractDraft[]): PartnerPaymentContract[] {
  const now = new Date().toISOString();
  return drafts.map((draft, index) => ({
    id: `default-${index}`,
    ...draft,
    createdAt: now,
    updatedAt: now,
  }));
}

async function resolvePaymentContractsForReconcile(
  cached: PartnerPaymentContract[],
  masters?: MasterData | null,
  options?: { forceRefresh?: boolean },
): Promise<PartnerPaymentContract[]> {
  let rows = cached;
  const shouldLoad =
    options?.forceRefresh === true || rows.length === 0;
  if (shouldLoad) {
    try {
      const loaded = await loadPartnerContractRates();
      if (loaded.length > 0) {
        rows = loaded;
      } else if (options?.forceRefresh !== true) {
        // forceRefresh 時に空ならキャッシュを維持
      }
    } catch {
      // Firestore 未接続時はキャッシュまたは初期契約にフォールバック
    }
  }
  if (rows.length === 0) {
    rows = draftsToRates(buildDefaultPartnerContractDrafts());
  }
  if (masters) {
    return linkContractsToPartnerProfiles(rows, masters);
  }
  return rows;
}

async function resolveBillingContractsForReconcile(
  cached: ShipperBillingContract[],
  masters?: MasterData | null,
  options?: { forceRefresh?: boolean },
): Promise<ShipperBillingContract[]> {
  let rows = cached;
  const shouldLoad =
    options?.forceRefresh === true || rows.length === 0;
  if (shouldLoad) {
    try {
      const loaded = await loadShipperBillingContracts(masters ?? undefined);
      if (loaded.length > 0) {
        rows = loaded;
      }
    } catch {
      // Firestore 未接続時はキャッシュを維持
    }
  }
  return rows;
}

function FileStatusBadge({
  label,
  loaded,
  fileName,
}: {
  label: string;
  loaded: boolean;
  fileName: string | null;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        loaded
          ? "border-emerald-300 bg-emerald-50/60"
          : "border-muted bg-muted/30",
      )}
    >
      {loaded ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
      ) : (
        <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {loaded ? fileName : "未取込"}
        </p>
      </div>
    </div>
  );
}

type PreprocessCache = {
  shiga: PreprocessResult | null;
  fm: PreprocessResult | null;
  employeeNames: string[];
};

export function ShigaFmWorkspace({
  masters,
  initialSubTab,
  initialPartnerId,
  onInitialNavigationApplied,
  onNavigateToPartnerDetail,
  onNavigateToPartnerLedger,
  onNavigateToShipperDetail,
}: ShigaFmWorkspaceProps) {
  const [activeSubTab, setActiveSubTab] = useState<ShigaFmSubTab>(
    initialSubTab ?? "summary",
  );
  const [contractPartnerId, setContractPartnerId] = useState<string | null>(
    initialPartnerId ?? null,
  );
  const [shigaFiles, setShigaFiles] = useState<File[]>([]);
  const [fmFiles, setFmFiles] = useState<File[]>([]);
  const [reconcileResult, setReconcileResult] =
    useState<ShigaFmReconciliationResult | null>(null);
  const [paymentContracts, setPaymentContracts] = useState<PartnerPaymentContract[]>(
    [],
  );
  const [billingContracts, setBillingContracts] = useState<ShipperBillingContract[]>(
    [],
  );
  const [slotAssignments, setSlotAssignments] = useState<ShigaFmSlotAssignment[]>(
    [],
  );
  const [preprocessCache, setPreprocessCache] =
    useState<PreprocessCache | null>(null);
  const [assignmentSlotKey, setAssignmentSlotKey] = useState<string | null>(null);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [feedback, setFeedback] = useState<FmActionFeedback | null>(null);
  const [matchFilter, setMatchFilter] = useState<ShigaFmMatchFilter>("all");
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [persistedContractCount, setPersistedContractCount] = useState(0);
  const [savedSessions, setSavedSessions] = useState<ShigaFmSessionSummary[]>([]);
  const [activeMonthPeriod, setActiveMonthPeriod] = useState<string | null>(
    null,
  );
  const [loadedSessionMeta, setLoadedSessionMeta] =
    useState<ShigaFmSessionSummary | null>(null);
  const [sessionDirty, setSessionDirty] = useState(false);
  const [sessionListBusy, setSessionListBusy] = useState(false);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
      setFeedback({
        message: "指定のタブを開きました",
        detail:
          initialSubTab === "assignments"
            ? "傭車・アルバイト入力"
            : initialSubTab === "contracts"
              ? "契約単価マスタ"
              : initialSubTab === "details"
                ? "明細一覧"
                : undefined,
        tone: "info",
      });
    }
    if (initialPartnerId) {
      setContractPartnerId(initialPartnerId);
    }
    if (initialSubTab || initialPartnerId) {
      onInitialNavigationApplied?.();
    }
  }, [
    initialSubTab,
    initialPartnerId,
    onInitialNavigationApplied,
  ]);

  useEffect(() => {
    void loadPartnerContractRates()
      .then((rows) => setPersistedContractCount(rows.length))
      .catch(() => setPersistedContractCount(0));
  }, [paymentContracts.length]);

  useEffect(() => {
    void loadShipperBillingContracts(masters ?? undefined)
      .then(setBillingContracts)
      .catch(() => setBillingContracts([]));
  }, [masters]);

  const hasShigaFile = shigaFiles.length > 0;
  const hasFmFile = fmFiles.length > 0;
  const hasShigaData = hasShigaFile || preprocessCache?.shiga != null;
  const hasFmData = hasFmFile || preprocessCache?.fm != null;
  const shigaDisplayName =
    shigaFiles[0]?.name ??
    preprocessCache?.shiga?.sourceFileName ??
    loadedSessionMeta?.shigaFileName ??
    null;
  const fmDisplayName =
    fmFiles[0]?.name ??
    preprocessCache?.fm?.sourceFileName ??
    loadedSessionMeta?.fmFileName ??
    null;
  const canExecute = hasShigaFile || hasFmFile;
  const canReconcileFromCache = Boolean(
    preprocessCache?.shiga || preprocessCache?.fm,
  );
  const canSaveSession = Boolean(
    preprocessCache && (preprocessCache.shiga || preprocessCache.fm),
  );

  const executeHint = useMemo(() => {
    if (canReconcileFromCache && !canExecute) {
      return `保存済みデータ — 「再突合する」で最新契約・手入力を反映できます。${RECONCILE_CONTRACT_REFRESH_NOTE}`;
    }
    if (!canExecute) return "ファイルを1つ以上選択するか、保存済み月度を読み込んでください";
    if (hasShigaFile && hasFmFile) return "両ファイル取込済み — 突合を実行します";
    if (hasShigaFile) return "滋賀店配のみ — FM未取込のため突合は行いません";
    return "FMのみ — 滋賀店配未取込のため突合は行いません";
  }, [canExecute, canReconcileFromCache, hasShigaFile, hasFmFile]);

  const unregisteredCount = reconcileResult?.totals.unregisteredCount ?? 0;
  const fmShortageCount = reconcileResult?.totals.fmShortageCount ?? 0;
  const needsInputCount = unregisteredCount + fmShortageCount;

  const paymentContractGapCount = useMemo(() => {
    if (!reconcileResult) return 0;
    return countPartnerPaymentContractGaps(reconcileResult.rows);
  }, [reconcileResult]);

  const billingContractGapCount = useMemo(() => {
    if (!reconcileResult) return 0;
    return countShipperBillingContractGaps(reconcileResult.rows);
  }, [reconcileResult]);

  const billingShipperId = useMemo(
    () => resolveBillingShipperId(masters ?? DEFAULT_MASTERS),
    [masters],
  );

  const rebuildWithAssignments = useCallback(
    (
      cache: PreprocessCache,
      paymentContractsToUse: PartnerPaymentContract[],
      billingContractsToUse: ShipperBillingContract[],
      assignments: ShigaFmSlotAssignment[],
    ) => {
      return buildShigaFmReconciliationResult({
        shigaResult: cache.shiga,
        fmResult: cache.fm,
        paymentContracts: paymentContractsToUse,
        billingContracts: billingContractsToUse,
        billingShipperId,
        employeeNames: cache.employeeNames,
        slotAssignments: assignments,
      });
    },
    [billingShipperId],
  );

  const loadAssignmentsForMonth = useCallback(async (monthPeriod: string | null) => {
    try {
      const rows = await loadShigaFmSlotAssignments(monthPeriod);
      setSlotAssignments(rows);
      return rows;
    } catch {
      return [];
    }
  }, []);

  const refreshSessionList = useCallback(async () => {
    setSessionListBusy(true);
    try {
      const list = await listShigaFmSessionSummaries();
      setSavedSessions(list);
      return list;
    } catch {
      setSavedSessions([]);
      return [];
    } finally {
      setSessionListBusy(false);
    }
  }, []);

  const applyLoadedSession = useCallback(
    async (
      session: Awaited<ReturnType<typeof loadShigaFmSession>>,
      options?: { announce?: boolean },
    ) => {
      if (!session) return false;
      const cache: PreprocessCache = {
        shiga: session.shigaPreprocess,
        fm: session.fmPreprocess,
        employeeNames: session.employeeNames,
      };
      setPreprocessCache(cache);
      setReconcileResult(
        session.reconcileResult
          ? enrichShigaFmReconciliationResult(session.reconcileResult)
          : null,
      );
      setActiveMonthPeriod(session.monthPeriod);
      setLoadedSessionMeta(toSessionSummary(session));
      setSessionDirty(false);
      setShigaFiles([]);
      setFmFiles([]);
      sessionStorage.setItem(
        SHIGA_FM_ACTIVE_MONTH_STORAGE_KEY,
        session.monthPeriod,
      );
      await loadAssignmentsForMonth(session.monthPeriod);
      if (options?.announce !== false) {
        setFeedback({
          message: "保存済みデータを読み込みました",
          detail: `${formatMonthPeriodLabel(session.monthPeriod)}の突合作業を再開しました（突合${session.reconcileRowCount}件 / FM不足${session.fmShortageCount}件）`,
          tone: "success",
        });
        setStatusMessage(
          `復元: ${formatMonthPeriodLabel(session.monthPeriod)} / 保存 ${new Date(session.savedAt).toLocaleString("ja-JP")}`,
        );
      }
      return true;
    },
    [loadAssignmentsForMonth],
  );

  useEffect(() => {
    void refreshSessionList();
  }, [refreshSessionList]);

  useEffect(() => {
    if (!sessionDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [sessionDirty]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = sessionStorage.getItem(SHIGA_FM_ACTIVE_MONTH_STORAGE_KEY);
      if (!stored || preprocessCache != null) return;
      try {
        const session = await loadShigaFmSession(stored);
        if (cancelled || !session) return;
        await applyLoadedSession(session);
      } catch {
        /* 未ログイン等は無視 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyLoadedSession, preprocessCache]);

  useEffect(() => {
    if (reconcileResult?.monthPeriod && preprocessCache == null) {
      void loadAssignmentsForMonth(reconcileResult.monthPeriod);
    }
  }, [reconcileResult?.monthPeriod, preprocessCache, loadAssignmentsForMonth]);

  const issueCount = useMemo(() => {
    if (!reconcileResult) return 0;
    const t = reconcileResult.totals;
    return (
      t.shigaOnlyCount +
      t.fmOnlyCount +
      t.amountMismatchCount +
      t.mappingFailedCount +
      t.unregisteredCount +
      t.fmShortageCount
    );
  }, [reconcileResult]);

  const handleReconcile = useCallback(async () => {
    if (!canExecute) return;
    setBusy(true);
    setStatusMessage("");
    setFeedback(null);
    try {
      let shigaProcessed = null;
      let fmProcessed = null;
      let employeeNames: string[] = [];

      if (hasShigaFile) {
        shigaProcessed = await preprocessImportFile(
          "shiga_store_delivery",
          shigaFiles[0]!,
          masters,
        );
      }

      if (hasFmFile) {
        const [employees, vehicles, jobs] = await Promise.all([
          loadEmployeeDetails(),
          loadVehicleDetails(),
          loadJobDetails(),
        ]);
        employeeNames = employees
          .filter((e) => e.activeFlag === 1)
          .map((e) => e.name);
        const ledger: PreprocessLedgerContext = { employees, vehicles, jobs };
        fmProcessed = await preprocessImportFile(
          "filemaker_employee_schedule",
          fmFiles[0]!,
          masters,
          ledger,
        );
      }

      const monthPeriod =
        shigaProcessed?.shigaDeliveryRecords?.[0]?.monthPeriod ?? null;
      if (monthPeriod) {
        const existing = savedSessions.find(
          (s) => s.monthPeriod === monthPeriod,
        );
        if (existing) {
          const ok = window.confirm(
            `${formatMonthPeriodLabel(monthPeriod)}の保存済みデータがあります。\n再取込して上書きしますか？`,
          );
          if (!ok) return;
        }
      }

      const paymentContractsToUse = await resolvePaymentContractsForReconcile(
        paymentContracts,
        masters,
        { forceRefresh: true },
      );
      setPaymentContracts(paymentContractsToUse);
      const billingContractsToUse = await resolveBillingContractsForReconcile(
        billingContracts,
        masters,
        { forceRefresh: true },
      );
      setBillingContracts(billingContractsToUse);

      const cache: PreprocessCache = {
        shiga: shigaProcessed,
        fm: fmProcessed,
        employeeNames,
      };
      setPreprocessCache(cache);

      const assignments =
        shigaProcessed && fmProcessed
          ? await loadAssignmentsForMonth(monthPeriod)
          : [];

      const result = rebuildWithAssignments(
        cache,
        paymentContractsToUse,
        billingContractsToUse,
        assignments,
      );

      setReconcileResult(result);
      setActiveMonthPeriod(monthPeriod ?? result.monthPeriod);
      setLoadedSessionMeta(null);
      setSessionDirty(true);
      if (monthPeriod ?? result.monthPeriod) {
        sessionStorage.setItem(
          SHIGA_FM_ACTIVE_MONTH_STORAGE_KEY,
          monthPeriod ?? result.monthPeriod!,
        );
      }
      const t = result.totals;

      if (result.inputMode === "shiga_only") {
        const preview = result.shigaPreview;
        setStatusMessage(
          `滋賀店配読込: 明細${preview?.rowCount ?? 0}件 / 支払合計¥${(preview?.payTotal ?? t.totalPayment).toLocaleString()}`,
        );
        setFeedback({
          message: "滋賀店配データを読み込みました",
          detail: "FMスケジュール未取込 — 支払データのみ表示しています",
          tone: "success",
        });
      } else if (result.inputMode === "fm_only") {
        const preview = result.fmPreview;
        setStatusMessage(
          `FM読込: 対象${preview?.rowCount ?? 0}件 / 売上合計¥${(preview?.salesTotal ?? t.totalSales).toLocaleString()}`,
        );
        setFeedback({
          message: "FMスケジュールを読み込みました",
          detail: "滋賀店配未取込 — 売上データのみ表示しています",
          tone: "success",
        });
      } else {
        const d = result.diagnostics;
        setStatusMessage(
          `突合完了: 一致${t.matchedCount} / FM不足${t.fmShortageCount} / 未登録${t.unregisteredCount} / 粗利${t.totalGrossProfit.toLocaleString()}円`,
        );
        setFeedback({
          message: "突合が完了しました",
          detail: d
            ? `診断 — 社員${d.employeeCount} / 傭車${d.partnerCount} / FM不足${d.fmShortageCount} / 合計行除外${d.excludedTotalRowCount} / 支払契約${paymentContractsToUse.length}件 / 請求契約${billingContractsToUse.length}件`
            : `支払契約 ${paymentContractsToUse.length} 件 / 請求契約 ${billingContractsToUse.length} 件 / 社員マスタ ${employeeNames.length} 名を反映`,
          tone: "success",
        });
      }
      setActiveSubTab("summary");
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "処理中に不明なエラー";
      setStatusMessage(`エラー: ${msg}`);
      setFeedback({ message: msg, tone: "warn" });
      window.alert(msg);
    } finally {
      setBusy(false);
    }
  }, [
    canExecute,
    hasShigaFile,
    hasFmFile,
    shigaFiles,
    fmFiles,
    masters,
    paymentContracts,
    billingContracts,
    rebuildWithAssignments,
    loadAssignmentsForMonth,
    savedSessions,
    sessionDirty,
    loadedSessionMeta,
  ]);

  const handleReconcileFromCache = useCallback(async () => {
    if (!preprocessCache || !canReconcileFromCache) return;
    setBusy(true);
    setFeedback(null);
    try {
      const monthPeriod =
        activeMonthPeriod ??
        preprocessCache.shiga?.shigaDeliveryRecords?.[0]?.monthPeriod ??
        null;
      const paymentContractsToUse = await resolvePaymentContractsForReconcile(
        paymentContracts,
        masters,
        { forceRefresh: true },
      );
      setPaymentContracts(paymentContractsToUse);
      const billingContractsToUse = await resolveBillingContractsForReconcile(
        billingContracts,
        masters,
        { forceRefresh: true },
      );
      setBillingContracts(billingContractsToUse);
      const assignments = await loadAssignmentsForMonth(monthPeriod);
      const result = rebuildWithAssignments(
        preprocessCache,
        paymentContractsToUse,
        billingContractsToUse,
        assignments,
      );
      setReconcileResult(result);
      setActiveMonthPeriod(monthPeriod ?? result.monthPeriod);
      setSessionDirty(true);
      setLoadedSessionMeta(null);
      const d = result.diagnostics;
      setStatusMessage(
        `再突合完了: 一致${result.totals.matchedCount} / FM不足${result.totals.fmShortageCount} / 粗利${result.totals.totalGrossProfit.toLocaleString()}円`,
      );
      setFeedback({
        message: "保存済みデータで再突合しました",
        detail: d
          ? `診断 — 社員${d.employeeCount} / 傭車${d.partnerCount} / FM不足${d.fmShortageCount}`
          : "契約・手入力を反映して突合を更新しました",
        tone: "success",
      });
      setActiveSubTab("summary");
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "再突合に失敗しました";
      setFeedback({ message: msg, tone: "warn" });
      window.alert(msg);
    } finally {
      setBusy(false);
    }
  }, [
    preprocessCache,
    canReconcileFromCache,
    activeMonthPeriod,
    paymentContracts,
    billingContracts,
    masters,
    loadAssignmentsForMonth,
    rebuildWithAssignments,
  ]);

  const handleSaveSession = useCallback(async () => {
    if (!preprocessCache || !canSaveSession) return;
    const monthPeriod =
      activeMonthPeriod ??
      preprocessCache.shiga?.shigaDeliveryRecords?.[0]?.monthPeriod ??
      reconcileResult?.monthPeriod ??
      null;
    if (!monthPeriod) {
      window.alert("月度を特定できません。滋賀店配データを取込してください。");
      return;
    }
    const existing = savedSessions.find((s) => s.monthPeriod === monthPeriod);
    if (existing) {
      const ok = window.confirm(
        `${formatMonthPeriodLabel(monthPeriod)}の保存済みデータを上書きしますか？`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const doc = buildShigaFmSessionDocument({
        monthPeriod,
        preprocessCache,
        reconcileResult,
        preserveSavedAt: existing?.savedAt,
        preserveReconciledAt:
          reconcileResult && sessionDirty
            ? undefined
            : (loadedSessionMeta?.reconciledAt ??
              existing?.reconciledAt ??
              null),
      });
      await saveShigaFmSession(doc);
      const summary = toSessionSummary(doc);
      setLoadedSessionMeta(summary);
      setSessionDirty(false);
      setActiveMonthPeriod(monthPeriod);
      sessionStorage.setItem(SHIGA_FM_ACTIVE_MONTH_STORAGE_KEY, monthPeriod);
      await refreshSessionList();
      setFeedback({
        message: `${formatMonthPeriodLabel(monthPeriod)}を保存しました`,
        detail: `滋賀${doc.shigaRecordCount}件 / FM${doc.fmRecordCount}件 / 突合${doc.reconcileRowCount}件`,
        tone: "success",
      });
      setStatusMessage(
        `Firestore保存完了: ${formatMonthPeriodLabel(monthPeriod)}`,
      );
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "保存に失敗しました";
      setFeedback({ message: msg, tone: "warn" });
      window.alert(msg);
    } finally {
      setBusy(false);
    }
  }, [
    preprocessCache,
    canSaveSession,
    activeMonthPeriod,
    reconcileResult,
    savedSessions,
    refreshSessionList,
  ]);

  const handleLoadSession = useCallback(
    async (monthPeriod: string) => {
      if (!monthPeriod) return;
      if (
        sessionDirty &&
        !window.confirm(
          "未保存の変更があります。保存済みデータを読み込むと破棄されます。続行しますか？",
        )
      ) {
        return;
      }
      setBusy(true);
      try {
        const session = await loadShigaFmSession(monthPeriod);
        if (!session) {
          window.alert("セッションが見つかりませんでした");
          return;
        }
        await applyLoadedSession(session);
        setActiveSubTab("summary");
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "読み込みに失敗しました";
        setFeedback({ message: msg, tone: "warn" });
        window.alert(msg);
      } finally {
        setBusy(false);
      }
    },
    [sessionDirty, applyLoadedSession],
  );

  const handleDeleteSession = useCallback(
    async (monthPeriod: string) => {
      if (!monthPeriod) return;
      const label = formatMonthPeriodLabel(monthPeriod);
      if (
        !window.confirm(
          `${label}の保存済みデータを削除しますか？この操作は取り消せません。`,
        )
      ) {
        return;
      }
      setBusy(true);
      try {
        await deleteShigaFmSession(monthPeriod);
        await refreshSessionList();
        if (activeMonthPeriod === monthPeriod) {
          setLoadedSessionMeta(null);
          setPreprocessCache(null);
          setReconcileResult(null);
          setActiveMonthPeriod(null);
          setSessionDirty(false);
          sessionStorage.removeItem(SHIGA_FM_ACTIVE_MONTH_STORAGE_KEY);
        }
        setFeedback({
          message: `${label}の保存データを削除しました`,
          tone: "success",
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "削除に失敗しました";
        setFeedback({ message: msg, tone: "warn" });
        window.alert(msg);
      } finally {
        setBusy(false);
      }
    },
    [activeMonthPeriod, refreshSessionList],
  );

  const assignmentRow = useMemo(() => {
    if (!assignmentSlotKey || !reconcileResult) return null;
    return (
      reconcileResult.rows.find((r) => r.slotKey === assignmentSlotKey) ?? null
    );
  }, [assignmentSlotKey, reconcileResult]);

  const existingAssignment = useMemo(() => {
    if (!assignmentSlotKey) return null;
    return slotAssignments.find((a) => a.slotKey === assignmentSlotKey) ?? null;
  }, [assignmentSlotKey, slotAssignments]);

  const handleOpenAssignment = useCallback(
    (slotKey: string) => {
      setAssignmentSlotKey(slotKey);
      const row = reconcileResult?.rows.find((r) => r.slotKey === slotKey);
      const isFmShortage = row?.status === "fm_shortage";
      setFeedback({
        message: isFmShortage
          ? "FM不足行の入力を開きました"
          : "入力画面を開きました",
        detail: row
          ? `${row.businessDate} / ${row.courseName ?? "—"} / ${row.jobName}`
          : slotKey,
        tone: "info",
      });
    },
    [reconcileResult?.rows],
  );

  const handleSaveAssignment = useCallback(
    async (values: ShigaFmSlotAssignmentFormValues) => {
      if (!preprocessCache || !assignmentRow || !assignmentRow.courseId) return;
      setAssignmentBusy(true);
      try {
        const now = new Date().toISOString();
        const assignment: ShigaFmSlotAssignment = {
          id: assignmentRow.slotKey,
          slotKey: assignmentRow.slotKey,
          monthPeriod: reconcileResult?.monthPeriod ?? null,
          businessDate: assignmentRow.businessDate,
          courseId: assignmentRow.courseId,
          courseName: assignmentRow.courseName ?? "",
          slotIndex: assignmentRow.slotIndex,
          unitCount: assignmentRow.unitCount,
          jobName: assignmentRow.jobName,
          assignmentType: values.assignmentType,
          partnerId:
            values.assignmentType === "partner"
              ? values.partnerId.trim()
              : undefined,
          partnerName:
            values.assignmentType === "partner"
              ? values.partnerName.trim()
              : undefined,
          partTimePaymentAmount:
            values.assignmentType === "part_time"
              ? values.partTimePaymentAmount
              : undefined,
          salesAmount:
            values.salesAmount > 0 ? values.salesAmount : undefined,
          workerName: values.workerName.trim() || undefined,
          note: values.note.trim() || undefined,
          createdAt: existingAssignment?.createdAt ?? now,
          updatedAt: now,
        };
        await upsertShigaFmSlotAssignment(assignment);
        const updated = [
          ...slotAssignments.filter((a) => a.slotKey !== assignment.slotKey),
          assignment,
        ];
        setSlotAssignments(updated);
        const paymentContractsToUse = await resolvePaymentContractsForReconcile(
          paymentContracts,
          masters,
          { forceRefresh: true },
        );
        setPaymentContracts(paymentContractsToUse);
        const billingContractsToUse = await resolveBillingContractsForReconcile(
          billingContracts,
          masters,
          { forceRefresh: true },
        );
        setBillingContracts(billingContractsToUse);
        const newResult = rebuildWithAssignments(
          preprocessCache,
          paymentContractsToUse,
          billingContractsToUse,
          updated,
        );
        setReconcileResult(newResult);
        setAssignmentSlotKey(null);
        setSessionDirty(true);
        setLoadedSessionMeta(null);
        setStatusMessage(
          `再計算完了: FM不足${newResult.totals.fmShortageCount} / 未登録${newResult.totals.unregisteredCount}件 / 粗利${newResult.totals.totalGrossProfit.toLocaleString()}円`,
        );
        setFeedback({
          message: "入力を保存して再計算しました",
          detail: `${assignmentRow.businessDate} / ${assignmentRow.jobName} → ${values.assignmentType}`,
          tone: "success",
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "保存に失敗しました";
        setFeedback({ message: msg, tone: "warn" });
        window.alert(msg);
      } finally {
        setAssignmentBusy(false);
      }
    },
    [
      preprocessCache,
      assignmentRow,
      reconcileResult?.monthPeriod,
      existingAssignment,
      slotAssignments,
      rebuildWithAssignments,
      paymentContracts,
      billingContracts,
      masters,
    ],
  );

  const handleDeleteAssignment = useCallback(async () => {
    if (!preprocessCache || !assignmentRow || !existingAssignment) return;
    if (!window.confirm("この入力を削除して再計算しますか？")) return;
    setAssignmentBusy(true);
    try {
      await deleteShigaFmSlotAssignment(existingAssignment.id);
      const updated = slotAssignments.filter(
        (a) => a.slotKey !== existingAssignment.slotKey,
      );
      setSlotAssignments(updated);
      const paymentContractsToUse = await resolvePaymentContractsForReconcile(
        paymentContracts,
        masters,
        { forceRefresh: true },
      );
      setPaymentContracts(paymentContractsToUse);
      const billingContractsToUse = await resolveBillingContractsForReconcile(
        billingContracts,
        masters,
        { forceRefresh: true },
      );
      setBillingContracts(billingContractsToUse);
      const newResult = rebuildWithAssignments(
        preprocessCache,
        paymentContractsToUse,
        billingContractsToUse,
        updated,
      );
      setReconcileResult(newResult);
      setAssignmentSlotKey(null);
      setSessionDirty(true);
      setLoadedSessionMeta(null);
      setStatusMessage(
        `削除後再計算: FM不足${newResult.totals.fmShortageCount} / 未登録${newResult.totals.unregisteredCount}件`,
      );
      setFeedback({
        message: "入力を削除して再計算しました",
        detail: assignmentRow.slotKey,
        tone: "success",
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "削除に失敗しました";
      setFeedback({ message: msg, tone: "warn" });
      window.alert(msg);
    } finally {
      setAssignmentBusy(false);
    }
  }, [
    preprocessCache,
    assignmentRow,
    existingAssignment,
    slotAssignments,
    rebuildWithAssignments,
    paymentContracts,
    billingContracts,
    masters,
  ]);

  const handleOpenDetail = useCallback(
    (rowId: string) => {
      setDetailRowId(rowId);
      const row = reconcileResult?.rows.find((r) => r.id === rowId);
      setFeedback({
        message: "明細を開きました",
        detail: row
          ? `${row.businessDate} / ${row.courseName ?? "—"} / ${row.status}`
          : undefined,
        tone: "info",
      });
    },
    [reconcileResult?.rows],
  );

  const handleFilterChange = useCallback((filter: ShigaFmMatchFilter) => {
    setMatchFilter(filter);
    setFeedback({
      message: "フィルタを変更しました",
      detail:
        filter === "all"
          ? "すべての行を表示中"
          : `${filter} で絞り込み中`,
      tone: "info",
    });
  }, []);

  const handleSubTabChange = useCallback((value: string) => {
    setActiveSubTab(value as ShigaFmSubTab);
    setFeedback({
      message: "表示を切り替えました",
      detail:
        value === "summary"
          ? "突合結果"
          : value === "details"
            ? "明細一覧"
            : value === "issues"
              ? "未突合・要確認"
              : value === "assignments"
                ? "傭車・アルバイト入力"
                : "契約単価マスタ",
      tone: "info",
    });
  }, []);

  const handleGoToAssignments = useCallback(() => {
    setActiveSubTab("assignments");
    setFeedback({
      message: "傭車・アルバイト入力タブに切り替えました",
      detail:
        needsInputCount > 0
          ? `要入力 ${needsInputCount} 件（FM不足 ${fmShortageCount} / 未登録 ${unregisteredCount}）`
          : undefined,
      tone: "info",
    });
  }, [needsInputCount, fmShortageCount, unregisteredCount]);

  const handleGoToPaymentContracts = useCallback(() => {
    const partnerId =
      resolvePartnerIdFromContractGapRows(
        masters ?? DEFAULT_MASTERS,
        reconcileResult?.rows ?? [],
      ) ?? null;
    if (partnerId && onNavigateToPartnerDetail) {
      onNavigateToPartnerDetail(partnerId, "contracts");
      setFeedback({
        message: "協力会社台帳の協力会社詳細へ移動します",
        detail:
          paymentContractGapCount > 0
            ? `支払契約未登録 ${paymentContractGapCount} 件 — 支払契約を登録してください`
            : undefined,
        tone: "info",
      });
      return;
    }
    setActiveSubTab("contracts");
    setFeedback({
      message: "契約単価マスタタブに切り替えました",
      detail:
        paymentContractGapCount > 0
          ? `支払契約未登録 ${paymentContractGapCount} 件 — 協力会社台帳で登録するか、ここで横断管理できます`
          : "協力会社を特定できない場合はこのタブで登録できます",
      tone: "info",
    });
  }, [
    masters,
    reconcileResult?.rows,
    onNavigateToPartnerDetail,
    paymentContractGapCount,
  ]);

  const handleGoToShipperBilling = useCallback(() => {
    const shipperId =
      resolveShipperIdFromBillingGapRows(
        masters ?? DEFAULT_MASTERS,
        reconcileResult?.rows ?? [],
      ) ?? billingShipperId;
    if (shipperId && onNavigateToShipperDetail) {
      onNavigateToShipperDetail(shipperId, "billing");
      setFeedback({
        message: "荷主台帳の請求契約セクションへ移動します",
        detail:
          billingContractGapCount > 0
            ? `請求契約未登録 ${billingContractGapCount} 件 — 請求契約を登録してください`
            : undefined,
        tone: "info",
      });
      return;
    }
    setFeedback({
      message: "荷主を特定できませんでした",
      detail:
        billingContractGapCount > 0
          ? `請求契約未登録 ${billingContractGapCount} 件 — マスタ登録の荷主台帳から登録してください`
          : "荷主台帳で請求契約を確認・登録できます",
      tone: "warn",
    });
  }, [
    masters,
    reconcileResult?.rows,
    billingShipperId,
    onNavigateToShipperDetail,
    billingContractGapCount,
  ]);

  const handleGoToDetails = useCallback(() => {
    setActiveSubTab("details");
    setFeedback({
      message: "明細一覧タブに切り替えました",
      tone: "info",
    });
  }, []);

  const detailRow =
    reconcileResult?.rows.find((r) => r.id === detailRowId) ?? null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-4 py-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-violet-950">
          <GitCompareArrows className="size-5" />
          滋賀店配 × FMスケジュール突合
        </h3>
        <p className="mt-1 text-sm text-violet-900/80">
          FAトラック / Joshin①〜④ と滋賀店配を突合します。片方のみでも読み込み可能です。
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <FileStatusBadge
          label="滋賀店配 Excel"
          loaded={hasShigaData}
          fileName={shigaDisplayName}
        />
        <FileStatusBadge
          label="FM社員スケジュール Excel"
          loaded={hasFmData}
          fileName={fmDisplayName}
        />
      </div>

      <ShigaFmSessionPanel
        busy={busy || sessionListBusy}
        sessionDirty={sessionDirty}
        activeMonthPeriod={activeMonthPeriod}
        loadedSessionMeta={loadedSessionMeta}
        savedSessions={savedSessions}
        canSave={canSaveSession}
        canReconcileFromCache={canReconcileFromCache}
        onSave={() => void handleSaveSession()}
        onLoad={(month) => void handleLoadSession(month)}
        onReconcile={() => void handleReconcileFromCache()}
        onDelete={(month) => void handleDeleteSession(month)}
        onRefreshList={() => void refreshSessionList()}
      />

      <div className="grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label>1. 滋賀店配 Excel</Label>
          <ImportDropZone
            hint="滋賀店配データー入力sheet（.xlsx）"
            files={shigaFiles}
            onAdd={(list) => {
              setShigaFiles(Array.from(list).slice(0, 1));
              setReconcileResult(null);
              setSessionDirty(true);
              setLoadedSessionMeta(null);
            }}
            onClear={() => {
              setShigaFiles([]);
              setReconcileResult(null);
              setSessionDirty(true);
              setLoadedSessionMeta(null);
            }}
            accept=".xlsx,.xls"
            accent="indigo"
            minHeightClass="h-32"
          />
        </div>
        <div className="space-y-2">
          <Label>2. FM社員スケジュール Excel</Label>
          <ImportDropZone
            hint="ファイルメーカー日時売上（.xlsx）"
            files={fmFiles}
            onAdd={(list) => {
              setFmFiles(Array.from(list).slice(0, 1));
              setReconcileResult(null);
              setSessionDirty(true);
              setLoadedSessionMeta(null);
            }}
            onClear={() => {
              setFmFiles([]);
              setReconcileResult(null);
              setSessionDirty(true);
              setLoadedSessionMeta(null);
            }}
            accept=".xlsx,.xls"
            accent="indigo"
            minHeightClass="h-32"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!canExecute || busy}
          onClick={() => void handleReconcile()}
        >
          {busy ? "処理中…" : "突合を実行"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!canReconcileFromCache || busy}
          onClick={() => void handleReconcileFromCache()}
        >
          再突合する
        </Button>
        <p
          className={cn(
            "text-sm",
            canExecute ? "text-muted-foreground" : "text-amber-800",
          )}
        >
          {executeHint}
        </p>
        {statusMessage && (
          <p className="w-full text-sm text-muted-foreground">{statusMessage}</p>
        )}
      </div>

      <FmActionFeedbackBanner
        feedback={feedback}
        onDismiss={() => setFeedback(null)}
      />

      <ShigaFmDataStatusPanel
        result={reconcileResult}
        assignmentCount={slotAssignments.length}
        contractCount={persistedContractCount}
        hasShigaData={hasShigaData}
        hasFmData={hasFmData}
        shigaFileName={shigaDisplayName}
        fmFileName={fmDisplayName}
        activeMonthPeriod={activeMonthPeriod}
        loadedSessionMeta={loadedSessionMeta}
        sessionDirty={sessionDirty}
        savedSessionCount={savedSessions.length}
      />

      {reconcileResult?.inputMode === "both" && (
        <ShigaFmNextStepsPanel
          result={reconcileResult}
          paymentContractGapCount={paymentContractGapCount}
          billingContractGapCount={billingContractGapCount}
          onGoToAssignments={handleGoToAssignments}
          onGoToPaymentContracts={handleGoToPaymentContracts}
          onGoToBillingContracts={handleGoToShipperBilling}
          onGoToDetails={handleGoToDetails}
        />
      )}

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:grid-cols-5">
          <TabsTrigger value="summary">突合結果</TabsTrigger>
          <TabsTrigger value="details">明細一覧</TabsTrigger>
          <TabsTrigger value="issues" className="relative">
            未突合・要確認
            {issueCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">
                {issueCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="assignments" className="relative">
            傭車・アルバイト入力
            {needsInputCount > 0 && (
              <span className="ml-1 rounded-full bg-orange-600 px-1.5 text-[10px] text-white">
                {needsInputCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="contracts">契約単価マスタ</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-4">
          <ShigaFmMatchSummaryPanel result={reconcileResult} />
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <ShigaFmMatchReviewTable
            result={reconcileResult}
            activeFilter={matchFilter}
            onFilterChange={handleFilterChange}
            lastOpenedRowId={detailRowId}
            onOpenDetail={handleOpenDetail}
          />
        </TabsContent>

        <TabsContent value="issues" className="mt-4 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-4 py-3 text-sm text-amber-950">
            滋賀のみ・FMのみ・金額不一致・マップ失敗の行を表示します。
            {reconcileResult == null && " 先に突合を実行してください。"}
          </div>
          <ShigaFmMatchReviewTable
            result={reconcileResult}
            lastOpenedRowId={detailRowId}
            onOpenDetail={handleOpenDetail}
            onOpenAssignment={handleOpenAssignment}
            issueMode
          />
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <ShigaFmSlotAssignmentPanel
            result={reconcileResult}
            assignments={slotAssignments}
            masters={masters}
            onOpenAssignment={handleOpenAssignment}
          />
        </TabsContent>

        <TabsContent value="contracts" className="mt-4">
          <PartnerContractMasterView
            masters={masters}
            initialPartnerId={contractPartnerId}
            onContractsChange={(rows) => {
              setPaymentContracts(rows);
              setPersistedContractCount(rows.length);
            }}
          />
        </TabsContent>
      </Tabs>

      <ShigaFmMatchDetailDialog
        row={detailRow}
        inputMode={reconcileResult?.inputMode}
        masters={masters}
        open={Boolean(detailRowId)}
        onClose={() => setDetailRowId(null)}
        onOpenAssignment={handleOpenAssignment}
        onNavigateToPartnerDetail={onNavigateToPartnerDetail}
        onNavigateToShipperDetail={onNavigateToShipperDetail}
        onActionFeedback={setFeedback}
      />

      <ShigaFmSlotAssignmentDialog
        row={assignmentRow}
        existing={existingAssignment}
        contracts={paymentContracts}
        masters={masters}
        monthPeriod={reconcileResult?.monthPeriod ?? null}
        open={Boolean(assignmentSlotKey)}
        busy={assignmentBusy}
        onClose={() => setAssignmentSlotKey(null)}
        onSave={handleSaveAssignment}
        onDelete={() => void handleDeleteAssignment()}
        onNavigateToPartnerDetail={onNavigateToPartnerDetail}
        onNavigateToPartnerLedger={onNavigateToPartnerLedger}
      />
    </div>
  );
}
