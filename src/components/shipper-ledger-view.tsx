"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ensureShipperProfiles } from "@/lib/shipper-company-utils";
import type { ShipperDetailSectionId } from "@/lib/shipper-ledger-navigation";
import type { MasterData } from "@/lib/types";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import { loadShipperBillingContracts } from "@/services/shipper-billing-contract-storage";
import { cn } from "@/lib/utils";
import { ShipperCompanyList } from "@/components/shipper-company-list";
import {
  FmActionFeedbackBanner,
  type FmActionFeedback,
} from "@/components/import-preprocessor/FmActionFeedbackBanner";

type ShipperLedgerViewProps = {
  masters: MasterData;
  onMastersChange: (masters: MasterData) => void;
  onNavigateToJobLedger?: () => void;
  initialShipperId?: string | null;
  initialShipperSection?: ShipperDetailSectionId | null;
  onInitialShipperNavigationApplied?: () => void;
  className?: string;
};

export function ShipperLedgerView({
  masters,
  onMastersChange,
  onNavigateToJobLedger,
  initialShipperId,
  initialShipperSection,
  onInitialShipperNavigationApplied,
  className,
}: ShipperLedgerViewProps) {
  const [contracts, setContracts] = useState<ShipperBillingContract[]>([]);
  const [feedback, setFeedback] = useState<FmActionFeedback | null>(null);

  const normalizedMasters = useMemo(
    () => ensureShipperProfiles(masters),
    [masters],
  );

  const loadContracts = useCallback(async () => {
    try {
      const rows = await loadShipperBillingContracts(normalizedMasters);
      setContracts(rows);
    } catch {
      setContracts([]);
    }
  }, [normalizedMasters]);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  return (
    <div className={cn("space-y-6", className)}>
      <Card>
        <CardHeader>
          <CardTitle>荷主台帳</CardTitle>
          <CardDescription>
            荷主の基本情報・対象業務・請求契約を管理します。請求契約は荷主詳細画面で登録・改定できます。
          </CardDescription>
        </CardHeader>
      </Card>

      <FmActionFeedbackBanner
        feedback={feedback}
        onDismiss={() => setFeedback(null)}
      />

      <ShipperCompanyList
        masters={normalizedMasters}
        contracts={contracts}
        onMastersChange={onMastersChange}
        onContractsChange={setContracts}
        onNavigateToJobLedger={onNavigateToJobLedger}
        initialShipperId={initialShipperId}
        initialScrollSection={initialShipperSection}
        onInitialNavigationApplied={onInitialShipperNavigationApplied}
        onFeedback={(message, detail, tone) =>
          setFeedback({ message, detail, tone: tone ?? "info" })
        }
      />
    </div>
  );
}
