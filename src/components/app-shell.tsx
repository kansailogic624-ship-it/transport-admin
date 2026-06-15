"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { DailyDashboard } from "@/components/daily-dashboard";
import { SalarySettingsView } from "@/components/salary-settings-view";
import { MonthlySummary } from "@/components/monthly-summary";
import { ExecutiveDashboardView } from "@/components/executive-dashboard-view";
import { AttendanceCheckView } from "@/components/attendance-check-view";
import { MaintenanceBillView } from "@/components/maintenance-bill-view";
import { ImportHistoryView } from "@/components/import-history-view";
import { ImportPreprocessorTab } from "@/components/import-preprocessor/ImportPreprocessorTab";
import type { PreprocessSourceType } from "@/lib/import-preprocessor";
import { MasterRegistryView } from "@/components/master-registry-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { migrateFromLocalStorageIfNeeded } from "@/services/idb-storage";
import { migrateIndexedDbToFirestoreOnce } from "@/services/migrate-idb-to-firestore";
import { clearFirestoreCache } from "@/services/firestore-cache";
import { clearCollectionBaselines } from "@/services/firestore-utils";
import {
  getFirestoreReadStats,
  getFirestoreWriteStats,
  printFirestoreIoReport,
  resetFirestoreIoStats,
} from "@/services/firestore-read-trace";
import {
  loadMasters,
  loadRecords,
  loadVehicleExpenses,
  saveMasters,
  saveRecords,
} from "@/lib/db";
import { SelectedDateProvider } from "@/contexts/selected-date-context";
import type { RecordsPersistOptions } from "@/lib/records-persist";
import type { DailyRecord, MasterData, VehicleExpenseRecord } from "@/lib/types";
import { ensurePartnerProfiles } from "@/lib/partner-company-utils";
import { ensureShipperProfiles } from "@/lib/shipper-company-utils";
import {
  PENDING_MASTER_REGISTRY_TAB_KEY,
} from "@/lib/master-registry-navigation";
import {
  PENDING_PARTNER_DETAIL_ID_KEY,
  PENDING_PARTNER_DETAIL_SECTION_KEY,
  type PartnerDetailSectionId,
} from "@/lib/partner-ledger-navigation";
import {
  PENDING_SHIPPER_DETAIL_ID_KEY,
  PENDING_SHIPPER_DETAIL_SECTION_KEY,
  type ShipperDetailSectionId,
} from "@/lib/shipper-ledger-navigation";
import {
  PENDING_SHIGA_FM_CONTRACT_PARTNER_ID_KEY,
  PENDING_SHIGA_FM_SUB_TAB_KEY,
  PENDING_SHIGA_FM_WORKSPACE_MODE_KEY,
} from "@/lib/shiga-fm-navigation";

export function AppShell() {
  const { user, logOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [masters, setMasters] = useState<MasterData | null>(null);
  const [vehicleExpenses, setVehicleExpenses] = useState<VehicleExpenseRecord[]>(
    [],
  );
  const [initMessage, setInitMessage] = useState("");
  const [activeTab, setActiveTab] = useState("daily");
  const [preprocessSourceType, setPreprocessSourceType] =
    useState<PreprocessSourceType | null>(null);
  const [preprocessWorkspaceMode, setPreprocessWorkspaceMode] = useState<
    "single" | "shiga_fm_reconcile" | null
  >(null);
  const [preprocessShigaFmSubTab, setPreprocessShigaFmSubTab] = useState<
    "summary" | "details" | "issues" | "assignments" | "contracts" | null
  >(null);
  const [preprocessPartnerId, setPreprocessPartnerId] = useState<string | null>(
    null,
  );
  const [partnerDetailId, setPartnerDetailId] = useState<string | null>(null);
  const [partnerDetailSection, setPartnerDetailSection] =
    useState<PartnerDetailSectionId | null>(null);
  const [shipperDetailId, setShipperDetailId] = useState<string | null>(null);
  const [shipperDetailSection, setShipperDetailSection] =
    useState<ShipperDetailSectionId | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mastersSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRecordsRef = useRef<DailyRecord[] | null>(null);
  const pendingMastersRef = useRef<MasterData | null>(null);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    let cancelled = false;
    async function init(userId: string) {
      console.count("loadData");
      resetFirestoreIoStats();
      setMounted(false);
      clearFirestoreCache();
      clearCollectionBaselines();
      // localStorage → IndexedDB（レガシー）
      await migrateFromLocalStorageIfNeeded();
      // IndexedDB → Firestore（一回限り）
      const migration = await migrateIndexedDbToFirestoreOnce(userId);
      if (migration.migrated) {
        setInitMessage(migration.message);
      }

      const [loadedRecords, loadedMasters, loadedVehicleExpenses] =
        await Promise.all([
          loadRecords(),
          loadMasters(),
          loadVehicleExpenses(),
        ]);
      if (cancelled) return;
      const normalizedMasters = ensureShipperProfiles(
        ensurePartnerProfiles(loadedMasters),
      );
      setRecords(loadedRecords);
      setMasters(normalizedMasters);
      if (
        normalizedMasters.partnerProfiles?.length &&
        !loadedMasters.partnerProfiles?.length
      ) {
        void saveMasters(normalizedMasters).catch(console.error);
      }
      if (
        normalizedMasters.shipperProfiles?.length &&
        !loadedMasters.shipperProfiles?.length
      ) {
        void saveMasters(normalizedMasters).catch(console.error);
      }
      setVehicleExpenses(loadedVehicleExpenses);
      setMounted(true);
      if (process.env.NODE_ENV !== "production") {
        printFirestoreIoReport();
        const win = window as Window & {
          __firestoreIoReport?: () => void;
          __firestoreReadStats?: () => Record<string, number>;
          __firestoreWriteStats?: () => Record<string, number>;
          /** @deprecated __firestoreIoReport を使用 */
          __firestoreReadReport?: () => void;
        };
        win.__firestoreIoReport = printFirestoreIoReport;
        win.__firestoreReadReport = printFirestoreIoReport;
        win.__firestoreReadStats = getFirestoreReadStats;
        win.__firestoreWriteStats = getFirestoreWriteStats;
      }
    }
    init(uid).catch((err) => {
      console.error(err);
      if (!cancelled) setMounted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (mastersSaveTimerRef.current) {
        clearTimeout(mastersSaveTimerRef.current);
      }
    };
  }, []);

  const refreshVehicleExpenses = useCallback(async () => {
    const next = await loadVehicleExpenses();
    setVehicleExpenses(next);
    return next;
  }, []);

  const flushPendingRecords = useCallback(() => {
    const pending = pendingRecordsRef.current;
    if (!pending) return;
    pendingRecordsRef.current = null;
    void saveRecords(pending).catch((error) => {
      console.error("Firestore save failed:", error);
    });
  }, []);

  const persistRecords = useCallback(
    (next: DailyRecord[], options?: RecordsPersistOptions) => {
      setRecords(next);
      if (options?.skipCloudSave) return;

      pendingRecordsRef.current = next;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        flushPendingRecords();
      }, 1500);
    },
    [flushPendingRecords],
  );

  const flushPendingMasters = useCallback(() => {
    const pending = pendingMastersRef.current;
    if (!pending) return;
    pendingMastersRef.current = null;
    void saveMasters(pending).catch((error) => {
      console.error("Firestore masters save failed:", error);
    });
  }, []);

  const persistMasters = useCallback(
    (next: MasterData) => {
      setMasters(next);
      pendingMastersRef.current = next;
      if (mastersSaveTimerRef.current) {
        clearTimeout(mastersSaveTimerRef.current);
      }
      mastersSaveTimerRef.current = setTimeout(() => {
        mastersSaveTimerRef.current = null;
        flushPendingMasters();
      }, 1500);
    },
    [flushPendingMasters],
  );

  const handleRestore = useCallback(
    (nextRecords: DailyRecord[], nextMasters: MasterData) => {
      persistRecords(nextRecords);
      persistMasters(nextMasters);
    },
    [persistRecords, persistMasters],
  );

  const navigateToPartnerDetail = useCallback(
    (partnerId: string, section: PartnerDetailSectionId = "contracts") => {
      sessionStorage.setItem(PENDING_MASTER_REGISTRY_TAB_KEY, "partner-ledger");
      sessionStorage.setItem(PENDING_PARTNER_DETAIL_ID_KEY, partnerId);
      sessionStorage.setItem(PENDING_PARTNER_DETAIL_SECTION_KEY, section);
      setPartnerDetailId(partnerId);
      setPartnerDetailSection(section);
      setActiveTab("masters");
    },
    [],
  );

  const navigateToPartnerLedger = useCallback(() => {
    sessionStorage.setItem(PENDING_MASTER_REGISTRY_TAB_KEY, "partner-ledger");
    sessionStorage.removeItem(PENDING_PARTNER_DETAIL_ID_KEY);
    sessionStorage.removeItem(PENDING_PARTNER_DETAIL_SECTION_KEY);
    setPartnerDetailId(null);
    setPartnerDetailSection(null);
    setActiveTab("masters");
  }, []);

  const navigateToShipperDetail = useCallback(
    (shipperId: string, section: ShipperDetailSectionId = "billing") => {
      sessionStorage.setItem(PENDING_MASTER_REGISTRY_TAB_KEY, "shipper-ledger");
      sessionStorage.setItem(PENDING_SHIPPER_DETAIL_ID_KEY, shipperId);
      sessionStorage.setItem(PENDING_SHIPPER_DETAIL_SECTION_KEY, section);
      setShipperDetailId(shipperId);
      setShipperDetailSection(section);
      setActiveTab("masters");
    },
    [],
  );

  if (!mounted || !masters) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        クラウドデータを読み込み中…
      </div>
    );
  }

  return (
    <SelectedDateProvider>
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <header className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              実績・労務・生産性管理
            </h1>
            <p className="text-sm text-muted-foreground">
              Firestore クラウド同期 — {user?.email ?? "ログイン中"}
            </p>
            {initMessage && (
              <p className="text-xs text-emerald-700">{initMessage}</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => logOut().catch(console.error)}
          >
            <LogOut className="size-4" />
            ログアウト
          </Button>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-w-0 space-y-6 overflow-hidden"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          <TabsTrigger value="daily">日次入力</TabsTrigger>
          <TabsTrigger value="check" className="relative">
            管理チェック
          </TabsTrigger>
          <TabsTrigger value="monthly">集計・データ出力</TabsTrigger>
          <TabsTrigger value="executive">経営ダッシュボード</TabsTrigger>
          <TabsTrigger value="maintenance">車両経費</TabsTrigger>
          <TabsTrigger value="masters">マスタ登録</TabsTrigger>
          <TabsTrigger value="preprocess">データ前処理</TabsTrigger>
          <TabsTrigger value="import-history">インポート履歴</TabsTrigger>
          <TabsTrigger value="salary">給与設定</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-0 space-y-6">
          <DailyDashboard
            records={records}
            masters={masters}
            onRecordsChange={persistRecords}
            onMastersChange={persistMasters}
            onGoToPreprocess={(sourceType) => {
              setPreprocessSourceType(sourceType);
              setActiveTab("preprocess");
            }}
          />
        </TabsContent>

        <TabsContent value="check" className="mt-0">
          <AttendanceCheckView
            records={records}
            masters={masters}
            onRecordsChange={persistRecords}
          />
        </TabsContent>

        <TabsContent value="monthly" className="mt-0">
          <MonthlySummary
            records={records}
            masters={masters}
            vehicleExpenses={vehicleExpenses}
            onRestore={handleRestore}
            onRecordsChange={persistRecords}
          />
        </TabsContent>

        <TabsContent value="executive" className="mt-0">
          {masters && (
            <ExecutiveDashboardView
              records={records}
              masters={masters}
              vehicleExpenses={vehicleExpenses}
            />
          )}
        </TabsContent>

        <TabsContent value="maintenance" className="mt-0">
          <MaintenanceBillView
            onVehicleExpensesChange={() => {
              void refreshVehicleExpenses();
            }}
          />
        </TabsContent>

        <TabsContent value="masters" className="mt-0">
          <MasterRegistryView
            records={records}
            masters={masters}
            onRecordsChange={persistRecords}
            onMastersChange={persistMasters}
            onRestore={handleRestore}
            onNavigateToPartnerDetail={navigateToPartnerDetail}
            initialPartnerDetailId={partnerDetailId}
            initialPartnerDetailSection={partnerDetailSection}
            onInitialPartnerDetailApplied={() => {
              setPartnerDetailId(null);
              setPartnerDetailSection(null);
            }}
            initialShipperDetailId={shipperDetailId}
            initialShipperDetailSection={shipperDetailSection}
            onInitialShipperDetailApplied={() => {
              setShipperDetailId(null);
              setShipperDetailSection(null);
            }}
          />
        </TabsContent>

        <TabsContent value="preprocess" className="mt-0">
          <ImportPreprocessorTab
            masters={masters}
            initialSourceType={preprocessSourceType}
            onInitialSourceTypeApplied={() => setPreprocessSourceType(null)}
            initialWorkspaceMode={preprocessWorkspaceMode}
            initialShigaFmSubTab={preprocessShigaFmSubTab}
            initialPartnerId={preprocessPartnerId}
            onInitialShigaFmNavigationApplied={() => {
              setPreprocessWorkspaceMode(null);
              setPreprocessShigaFmSubTab(null);
              setPreprocessPartnerId(null);
            }}
            onNavigateToPartnerDetail={navigateToPartnerDetail}
            onNavigateToPartnerLedger={navigateToPartnerLedger}
            onNavigateToShipperDetail={navigateToShipperDetail}
          />
        </TabsContent>

        <TabsContent value="import-history" className="mt-0">
          <ImportHistoryView
            records={records}
            onRecordsChange={persistRecords}
          />
        </TabsContent>

        <TabsContent value="salary" className="mt-0">
          <SalarySettingsView
            masters={masters}
            onMastersChange={persistMasters}
          />
        </TabsContent>

      </Tabs>
    </div>
    </SelectedDateProvider>
  );
}
