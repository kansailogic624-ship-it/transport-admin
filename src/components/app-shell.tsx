"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { DailyDashboard } from "@/components/daily-dashboard";
import { MasterRegistry } from "@/components/master-registry";
import { SalarySettingsView } from "@/components/salary-settings-view";
import { DriverDetailView } from "@/components/driver-detail-view";
import { MonthlySummary } from "@/components/monthly-summary";
import { AttendanceCheckView } from "@/components/attendance-check-view";
import { MaintenanceBillView } from "@/components/maintenance-bill-view";
import { ImportHistoryView } from "@/components/import-history-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { migrateFromLocalStorageIfNeeded } from "@/services/idb-storage";
import { migrateIndexedDbToFirestoreOnce } from "@/services/migrate-idb-to-firestore";
import {
  loadMasters,
  loadRecords,
  saveMasters,
  saveRecords,
} from "@/services/firestore-storage";
import { SelectedDateProvider } from "@/contexts/selected-date-context";
import type { DailyRecord, MasterData } from "@/lib/types";

export function AppShell() {
  const { user, logOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [masters, setMasters] = useState<MasterData | null>(null);
  const [initMessage, setInitMessage] = useState("");

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;

    let cancelled = false;
    async function init(userId: string) {
      setMounted(false);
      // localStorage → IndexedDB（レガシー）
      await migrateFromLocalStorageIfNeeded();
      // IndexedDB → Firestore（一回限り）
      const migration = await migrateIndexedDbToFirestoreOnce(userId);
      if (migration.migrated) {
        setInitMessage(migration.message);
      }

      const [loadedRecords, loadedMasters] = await Promise.all([
        loadRecords(),
        loadMasters(),
      ]);
      if (cancelled) return;
      setRecords(loadedRecords);
      setMasters(loadedMasters);
      setMounted(true);
    }
    init(uid).catch((err) => {
      console.error(err);
      if (!cancelled) setMounted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const persistRecords = useCallback((next: DailyRecord[]) => {
    setRecords(next);
    saveRecords(next).catch(console.error);
  }, []);

  const persistMasters = useCallback((next: MasterData) => {
    setMasters(next);
    saveMasters(next).catch(console.error);
  }, []);

  const handleRestore = useCallback(
    (nextRecords: DailyRecord[], nextMasters: MasterData) => {
      persistRecords(nextRecords);
      persistMasters(nextMasters);
    },
    [persistRecords, persistMasters],
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

      <Tabs defaultValue="daily" className="min-w-0 space-y-6 overflow-hidden">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="daily">日次入力</TabsTrigger>
          <TabsTrigger value="check" className="relative">
            管理チェック
          </TabsTrigger>
          <TabsTrigger value="drivers">ドライバー別実績</TabsTrigger>
          <TabsTrigger value="monthly">月次集計・出力</TabsTrigger>
          <TabsTrigger value="maintenance">車両経費</TabsTrigger>
          <TabsTrigger value="masters">マスタ登録</TabsTrigger>
          <TabsTrigger value="import-history">インポート履歴</TabsTrigger>
          <TabsTrigger value="salary">給与設定</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-0 space-y-6">
          <DailyDashboard
            records={records}
            masters={masters}
            onRecordsChange={persistRecords}
            onMastersChange={persistMasters}
          />
        </TabsContent>

        <TabsContent value="check" className="mt-0">
          <AttendanceCheckView
            records={records}
            masters={masters}
            onRecordsChange={persistRecords}
          />
        </TabsContent>

        <TabsContent
          value="drivers"
          className="mt-0 w-full max-w-full min-w-0 overflow-hidden"
        >
          <DriverDetailView
            records={records}
            onRecordsChange={persistRecords}
          />
        </TabsContent>

        <TabsContent value="monthly" className="mt-0">
          <MonthlySummary
            records={records}
            masters={masters}
            onRestore={handleRestore}
            onRecordsChange={persistRecords}
          />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-0">
          <MaintenanceBillView />
        </TabsContent>

        <TabsContent value="masters" className="mt-0">
          <MasterRegistry
            records={records}
            masters={masters}
            onRecordsChange={persistRecords}
            onMastersChange={persistMasters}
            onRestore={handleRestore}
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
