"use client";

import { useEffect, useRef, useState } from "react";
import { EmployeeLedgerView } from "@/components/employee-ledger-view";
import { JobLedgerView } from "@/components/job-ledger-view";
import { AllocationExpenseSettingsView } from "@/components/allocation-expense-settings-view";
import { PartnerLedgerView } from "@/components/partner-ledger-view";
import { ShipperLedgerView } from "@/components/shipper-ledger-view";
import { VehicleLedgerView } from "@/components/vehicle-ledger-view";
import {
  FmActionFeedbackBanner,
  type FmActionFeedback,
} from "@/components/import-preprocessor/FmActionFeedbackBanner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { canAccessEmployeeLedger } from "@/lib/auth-access";
import { cleanupImportedJobMasterNoise } from "@/lib/job-master-cleanup";
import {
  PENDING_MASTER_REGISTRY_TAB_KEY,
  type MasterRegistryTabId,
} from "@/lib/master-registry-navigation";
import type { PartnerDetailSectionId } from "@/lib/partner-ledger-navigation";
import type { ShipperDetailSectionId } from "@/lib/shipper-ledger-navigation";
import type { DailyRecord, MasterData } from "@/lib/types";
import { cn } from "@/lib/utils";

type MasterRegistryViewProps = {
  records: DailyRecord[];
  masters: MasterData;
  onRecordsChange: (records: DailyRecord[]) => void;
  onMastersChange: (masters: MasterData) => void;
  onRestore: (records: DailyRecord[], masters: MasterData) => void;
  onNavigateToPartnerDetail?: (
    partnerId: string,
    section?: PartnerDetailSectionId,
  ) => void;
  initialPartnerDetailId?: string | null;
  initialPartnerDetailSection?: PartnerDetailSectionId | null;
  onInitialPartnerDetailApplied?: () => void;
  initialShipperDetailId?: string | null;
  initialShipperDetailSection?: ShipperDetailSectionId | null;
  onInitialShipperDetailApplied?: () => void;
};

export function MasterRegistryView({
  records,
  masters,
  onMastersChange,
  initialPartnerDetailId,
  initialPartnerDetailSection,
  onInitialPartnerDetailApplied,
  initialShipperDetailId,
  initialShipperDetailSection,
  onInitialShipperDetailApplied,
}: MasterRegistryViewProps) {
  const { user } = useAuth();
  const showEmployeeLedger = canAccessEmployeeLedger(user?.email);
  const cleanupRan = useRef(false);
  const [activeTab, setActiveTab] = useState<MasterRegistryTabId>(
    showEmployeeLedger ? "employee-ledger" : "vehicle-ledger",
  );
  const [feedback, setFeedback] = useState<FmActionFeedback | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pending = sessionStorage.getItem(PENDING_MASTER_REGISTRY_TAB_KEY);
    if (pending) {
      setActiveTab(pending as MasterRegistryTabId);
      sessionStorage.removeItem(PENDING_MASTER_REGISTRY_TAB_KEY);
      setFeedback({
        message: "マスタ登録の表示を切り替えました",
        detail:
          pending === "job-ledger"
            ? "業務台帳タブを開きました"
            : pending === "shipper-ledger"
              ? "荷主台帳タブを開きました"
              : pending === "partner-ledger"
                ? "協力会社台帳タブを開きました"
                : undefined,
        tone: "info",
      });
    }
  }, []);

  useEffect(() => {
    if (!initialShipperDetailId) return;
    setActiveTab("shipper-ledger");
    onInitialShipperDetailApplied?.();
  }, [initialShipperDetailId, onInitialShipperDetailApplied]);

  useEffect(() => {
    if (!initialPartnerDetailId) return;
    setActiveTab("partner-ledger");
    onInitialPartnerDetailApplied?.();
  }, [initialPartnerDetailId, onInitialPartnerDetailApplied]);

  useEffect(() => {
    if (cleanupRan.current) return;
    const { masters: cleaned, removed } = cleanupImportedJobMasterNoise(
      masters,
      { records },
    );
    if (removed.length === 0) return;
    cleanupRan.current = true;
    onMastersChange(cleaned);
  }, [masters, onMastersChange, records]);

  const tabCols = showEmployeeLedger ? "grid-cols-6" : "grid-cols-5";

  const handleNavigateToJobLedger = () => {
    setActiveTab("job-ledger");
    setFeedback({
      message: "業務台帳タブへ移動しました",
      detail: "ここで業務を登録・編集できます",
      tone: "info",
    });
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as MasterRegistryTabId);
    setFeedback({
      message: "表示を切り替えました",
      detail:
        value === "job-ledger"
          ? "業務台帳"
          : value === "shipper-ledger"
            ? "荷主台帳"
            : value === "partner-ledger"
              ? "協力会社台帳"
              : value === "vehicle-ledger"
                ? "車両台帳"
                : undefined,
      tone: "info",
    });
  };

  return (
    <div className="min-w-0 space-y-6">
      <FmActionFeedbackBanner
        feedback={feedback}
        onDismiss={() => setFeedback(null)}
      />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="min-w-0 space-y-6"
      >
        <TabsList
          className={cn(
            "grid h-auto w-full max-w-4xl gap-1",
            tabCols,
          )}
        >
          {showEmployeeLedger && (
            <TabsTrigger value="employee-ledger">社員台帳</TabsTrigger>
          )}
          <TabsTrigger value="vehicle-ledger">車両台帳</TabsTrigger>
          <TabsTrigger value="shipper-ledger">荷主台帳</TabsTrigger>
          <TabsTrigger value="job-ledger">業務台帳</TabsTrigger>
          <TabsTrigger value="partner-ledger">協力会社台帳</TabsTrigger>
          <TabsTrigger value="allocation-expenses">按分費設定</TabsTrigger>
        </TabsList>

        {showEmployeeLedger && (
          <TabsContent value="employee-ledger" className="mt-0">
            <EmployeeLedgerView />
          </TabsContent>
        )}

        <TabsContent value="vehicle-ledger" className="mt-0">
          <VehicleLedgerView />
        </TabsContent>

        <TabsContent value="shipper-ledger" className="mt-0">
          <ShipperLedgerView
            masters={masters}
            onMastersChange={onMastersChange}
            onNavigateToJobLedger={handleNavigateToJobLedger}
            initialShipperId={initialShipperDetailId}
            initialShipperSection={initialShipperDetailSection}
            onInitialShipperNavigationApplied={onInitialShipperDetailApplied}
          />
        </TabsContent>

        <TabsContent value="job-ledger" className="mt-0">
          <JobLedgerView />
        </TabsContent>

        <TabsContent value="partner-ledger" className="mt-0">
          <PartnerLedgerView
            masters={masters}
            onMastersChange={onMastersChange}
            onNavigateToJobLedger={handleNavigateToJobLedger}
            initialPartnerId={initialPartnerDetailId}
            initialPartnerSection={initialPartnerDetailSection}
            onInitialPartnerNavigationApplied={onInitialPartnerDetailApplied}
          />
        </TabsContent>

        <TabsContent value="allocation-expenses" className="mt-0">
          <AllocationExpenseSettingsView
            masters={masters}
            onMastersChange={onMastersChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
