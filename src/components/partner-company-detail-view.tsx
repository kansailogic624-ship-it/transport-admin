"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { summarizePartnerPaymentContracts } from "@/lib/partner-contract-display";
import type { PartnerDetailSectionId } from "@/lib/partner-ledger-navigation";
import { upsertPartnerProfile } from "@/lib/partner-company-utils";
import type { PartnerCompanyProfile } from "@/lib/partner-company-types";
import type { PartnerContractRate } from "@/lib/shiga-fm/partner-contract-types";
import type { MasterData } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PartnerCompanyProfileSection,
  profileFormToProfile,
  type PartnerProfileFormState,
} from "./partner-company-profile-section";
import { PartnerContractHistorySection } from "./partner-contract-history-section";
import { PartnerContractSection } from "./partner-contract-section";

type PartnerCompanyDetailViewProps = {
  profile: PartnerCompanyProfile | null;
  isCreate: boolean;
  masters: MasterData;
  contracts: PartnerContractRate[];
  onMastersChange: (masters: MasterData) => void;
  onContractsChange: (contracts: PartnerContractRate[]) => void;
  onBack: () => void;
  onNavigateToJobLedger?: () => void;
  onFeedback: (
    message: string,
    detail?: string,
    tone?: "success" | "warn" | "info",
  ) => void;
  initialScrollSection?: PartnerDetailSectionId | null;
  onScrollSectionApplied?: () => void;
  onProfileSaved?: (profile: PartnerCompanyProfile) => void;
};

export function PartnerCompanyDetailView({
  profile,
  isCreate,
  masters,
  contracts,
  onMastersChange,
  onContractsChange,
  onBack,
  onNavigateToJobLedger,
  onFeedback,
  initialScrollSection,
  onScrollSectionApplied,
  onProfileSaved,
}: PartnerCompanyDetailViewProps) {
  const [formState, setFormState] = useState<PartnerProfileFormState | null>(
    null,
  );
  const [profileDirty, setProfileDirty] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState<PartnerCompanyProfile | null>(
    profile,
  );

  const partnerId = profile?.id ?? savedProfile?.id ?? null;
  const displayName = formState?.name || profile?.name || "新規協力会社";

  const contractSummary = useMemo(() => {
    if (!partnerId) return null;
    return summarizePartnerPaymentContracts(contracts, partnerId);
  }, [contracts, partnerId]);

  const contractsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSavedProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (!initialScrollSection) return;
    const id =
      initialScrollSection === "contracts" || initialScrollSection === "history"
        ? `partner-section-${initialScrollSection}`
        : `partner-section-${initialScrollSection}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      onFeedback?.(
        "契約単価セクションへ移動しました",
        displayName,
        "info",
      );
    }
    onScrollSectionApplied?.();
  }, [
    initialScrollSection,
    onScrollSectionApplied,
    onFeedback,
    displayName,
  ]);

  const handleProfileChange = useCallback(
    (state: PartnerProfileFormState, dirty: boolean) => {
      setFormState(state);
      setProfileDirty(dirty);
    },
    [],
  );

  const handleSaveProfile = async () => {
    if (!formState) return;
    if (!formState.name.trim()) {
      onFeedback("会社名を入力してください", undefined, "warn");
      return;
    }
    setSavingProfile(true);
    try {
      const nextProfile = profileFormToProfile(formState, profile);
      const nextMasters = upsertPartnerProfile(masters, nextProfile);
      onMastersChange(nextMasters);
      setSavedProfile(nextProfile);
      setProfileDirty(false);
      onFeedback(
        isCreate ? "協力会社を登録しました" : "基本情報を保存しました",
        nextProfile.name,
        "success",
      );
      onProfileSaved?.(nextProfile);
      if (isCreate) {
        onFeedback("契約単価を登録できます", undefined, "info");
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const highlightContracts =
    initialScrollSection === "contracts" ||
    (partnerId != null && contractSummary != null && !contractSummary.hasContract);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="gap-1" onClick={onBack}>
          <ArrowLeft className="size-4" />
          一覧に戻る
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold">{displayName}</h2>
          {partnerId && (
            <p className="text-xs text-muted-foreground">
              partnerId: {partnerId}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {profileDirty && (
            <Badge variant="outline" className="border-orange-400 text-orange-900">
              未保存の変更
            </Badge>
          )}
          {partnerId && contractSummary && (
            <Badge
              variant="outline"
              className={cn(
                contractSummary.hasContract
                  ? "border-emerald-400 text-emerald-800"
                  : "border-amber-500 bg-amber-100 text-amber-900",
              )}
            >
              {contractSummary.hasContract ? "支払契約登録済" : "支払契約未登録"}
            </Badge>
          )}
          {savedProfile && !savedProfile.activeFlag && (
            <Badge variant="secondary">無効</Badge>
          )}
        </div>
        <Button
          type="button"
          disabled={!profileDirty || savingProfile}
          className="gap-1"
          onClick={() => void handleSaveProfile()}
        >
          <Save className="size-4" />
          {savingProfile ? "保存中…" : "基本情報を保存"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">協力会社詳細</CardTitle>
          <CardDescription>
            基本情報・依頼業務・対象コース・契約単価をこの画面で登録・編集します。
          </CardDescription>
        </CardHeader>
      </Card>

      <PartnerCompanyProfileSection
        profile={profile}
        savedProfile={savedProfile}
        onChange={handleProfileChange}
        onNavigateToJobLedger={onNavigateToJobLedger}
      />

      {partnerId ? (
        <>
          <div ref={contractsRef}>
            <PartnerContractSection
              partnerId={partnerId}
              partnerName={displayName}
              masters={masters}
              contracts={contracts}
              onContractsChange={onContractsChange}
              onFeedback={onFeedback}
              highlight={highlightContracts}
            />
          </div>
          <PartnerContractHistorySection
            partnerId={partnerId}
            contracts={contracts}
          />
        </>
      ) : (
        <section className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-4 text-sm text-amber-950">
          契約単価を登録するには、先に「基本情報を保存」して協力会社を登録してください。
        </section>
      )}
    </div>
  );
}
