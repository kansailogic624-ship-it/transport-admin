"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ensurePartnerProfiles } from "@/lib/partner-company-utils";
import type { PartnerDetailSectionId } from "@/lib/partner-ledger-navigation";
import { linkContractsToPartnerProfiles } from "@/lib/partner-contract-migrate";
import type { MasterData } from "@/lib/types";
import type { PartnerContractRate } from "@/lib/shiga-fm/partner-contract-types";
import { loadPartnerContractRates } from "@/services/partner-contract-storage";
import { cn } from "@/lib/utils";
import { PartnerCompanyList } from "@/components/partner-company-list";
import {
  FmActionFeedbackBanner,
  type FmActionFeedback,
} from "@/components/import-preprocessor/FmActionFeedbackBanner";

type PartnerLedgerViewProps = {
  masters: MasterData;
  onMastersChange: (masters: MasterData) => void;
  onNavigateToJobLedger?: () => void;
  initialPartnerId?: string | null;
  initialPartnerSection?: PartnerDetailSectionId | null;
  onInitialPartnerNavigationApplied?: () => void;
  className?: string;
};

export function PartnerLedgerView({
  masters,
  onMastersChange,
  onNavigateToJobLedger,
  initialPartnerId,
  initialPartnerSection,
  onInitialPartnerNavigationApplied,
  className,
}: PartnerLedgerViewProps) {
  const [contracts, setContracts] = useState<PartnerContractRate[]>([]);
  const [feedback, setFeedback] = useState<FmActionFeedback | null>(null);

  const loadContracts = useCallback(async () => {
    try {
      const rows = linkContractsToPartnerProfiles(
        await loadPartnerContractRates(),
        ensurePartnerProfiles(masters),
      );
      setContracts(rows);
    } catch {
      setContracts([]);
    }
  }, [masters]);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  return (
    <div className={cn("space-y-6", className)}>
      <Card>
        <CardHeader>
          <CardTitle>協力会社台帳</CardTitle>
          <CardDescription>
            協力会社（傭車先）の基本情報・依頼業務・支払契約を管理します。詳細画面で登録・改定できます。
          </CardDescription>
        </CardHeader>
      </Card>

      <FmActionFeedbackBanner
        feedback={feedback}
        onDismiss={() => setFeedback(null)}
      />

      <PartnerCompanyList
        masters={masters}
        contracts={contracts}
        onMastersChange={onMastersChange}
        onContractsChange={setContracts}
        onNavigateToJobLedger={onNavigateToJobLedger}
        initialPartnerId={initialPartnerId}
        initialScrollSection={initialPartnerSection}
        onInitialNavigationApplied={onInitialPartnerNavigationApplied}
        onFeedback={(message, detail, tone) =>
          setFeedback({ message, detail, tone: tone ?? "info" })
        }
      />
    </div>
  );
}
