"use client";

import { useEffect, useRef } from "react";
import { EmployeeLedgerView } from "@/components/employee-ledger-view";
import { JobLedgerView } from "@/components/job-ledger-view";
import { AllocationExpenseSettingsView } from "@/components/allocation-expense-settings-view";
import { PartnerLedgerView } from "@/components/partner-ledger-view";
import { VehicleLedgerView } from "@/components/vehicle-ledger-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { canAccessEmployeeLedger } from "@/lib/auth-access";
import { cleanupImportedJobMasterNoise } from "@/lib/job-master-cleanup";
import type { DailyRecord, MasterData } from "@/lib/types";
import { cn } from "@/lib/utils";

type MasterRegistryViewProps = {
  records: DailyRecord[];
  masters: MasterData;
  onRecordsChange: (records: DailyRecord[]) => void;
  onMastersChange: (masters: MasterData) => void;
  onRestore: (records: DailyRecord[], masters: MasterData) => void;
};

export function MasterRegistryView({
  records,
  masters,
  onMastersChange,
}: MasterRegistryViewProps) {
  const { user } = useAuth();
  const showEmployeeLedger = canAccessEmployeeLedger(user?.email);
  const cleanupRan = useRef(false);

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

  const tabCols = showEmployeeLedger ? "grid-cols-5" : "grid-cols-4";
  const defaultTab = showEmployeeLedger ? "employee-ledger" : "vehicle-ledger";

  return (
    <Tabs defaultValue={defaultTab} className="min-w-0 space-y-6">
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
        <TabsTrigger value="job-ledger">業務台帳</TabsTrigger>
        <TabsTrigger value="partner-ledger">取引先台帳</TabsTrigger>
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

      <TabsContent value="job-ledger" className="mt-0">
        <JobLedgerView />
      </TabsContent>

      <TabsContent value="partner-ledger" className="mt-0">
        <PartnerLedgerView masters={masters} onMastersChange={onMastersChange} />
      </TabsContent>

      <TabsContent value="allocation-expenses" className="mt-0">
        <AllocationExpenseSettingsView
          masters={masters}
          onMastersChange={onMastersChange}
        />
      </TabsContent>
    </Tabs>
  );
}
