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
import { summarizeShipperBillingContracts } from "@/lib/shipper-billing-display";
import type { ShipperDetailSectionId } from "@/lib/shipper-ledger-navigation";
import { upsertShipperProfile } from "@/lib/shipper-company-utils";
import type { ShipperCompanyProfile } from "@/lib/shipper-company-types";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import type { MasterData } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ShipperCompanyProfileSection,
  shipperProfileFormToProfile,
  type ShipperProfileFormState,
} from "./shipper-company-profile-section";
import { ShipperBillingHistorySection } from "./shipper-billing-history-section";
import { ShipperBillingContractSection } from "./shipper-billing-contract-section";

type ShipperCompanyDetailViewProps = {
  profile: ShipperCompanyProfile | null;
  isCreate: boolean;
  masters: MasterData;
  contracts: ShipperBillingContract[];
  onMastersChange: (masters: MasterData) => void;
  onContractsChange: (contracts: ShipperBillingContract[]) => void;
  onBack: () => void;
  onNavigateToJobLedger?: () => void;
  onFeedback: (
    message: string,
    detail?: string,
    tone?: "success" | "warn" | "info",
  ) => void;
  initialScrollSection?: ShipperDetailSectionId | null;
  onScrollSectionApplied?: () => void;
  onProfileSaved?: (profile: ShipperCompanyProfile) => void;
};

export function ShipperCompanyDetailView({
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
}: ShipperCompanyDetailViewProps) {
  const [formState, setFormState] = useState<ShipperProfileFormState | null>(
    null,
  );
  const [profileDirty, setProfileDirty] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState<ShipperCompanyProfile | null>(
    profile,
  );

  const shipperId = profile?.id ?? savedProfile?.id ?? null;
  const displayName = formState?.name || profile?.name || "新規荷主";

  const contractSummary = useMemo(() => {
    if (!shipperId) return null;
    return summarizeShipperBillingContracts(contracts, shipperId);
  }, [contracts, shipperId]);

  const billingRef = useRef<HTMLDivElement>(null);

  const jobOptions = useMemo(() => {
    const names = new Set<string>();
    for (const p of masters.shipperProfiles ?? []) {
      for (const j of p.assignedJobNames ?? []) names.add(j);
    }
    const saved = savedProfile ?? profile;
    for (const j of saved?.assignedJobNames ?? []) names.add(j);
    for (const j of formState?.assignedJobs.map((a) => a.jobName) ?? []) {
      names.add(j);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "ja"));
  }, [masters.shipperProfiles, savedProfile, profile, formState?.assignedJobs]);

  useEffect(() => {
    setSavedProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (!initialScrollSection) return;
    const id = `shipper-section-${initialScrollSection}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      onFeedback?.(
        "請求契約セクションへ移動しました",
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
    (state: ShipperProfileFormState, dirty: boolean) => {
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
      const nextProfile = shipperProfileFormToProfile(formState, profile);
      const nextMasters = upsertShipperProfile(masters, nextProfile);
      onMastersChange(nextMasters);
      setSavedProfile(nextProfile);
      setProfileDirty(false);
      onFeedback(
        isCreate ? "荷主を登録しました" : "基本情報を保存しました",
        nextProfile.name,
        "success",
      );
      onProfileSaved?.(nextProfile);
      if (isCreate) {
        onFeedback("請求契約を登録できます", undefined, "info");
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const highlightBilling =
    initialScrollSection === "billing" ||
    (shipperId != null && contractSummary != null && !contractSummary.hasContract);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="gap-1" onClick={onBack}>
          <ArrowLeft className="size-4" />
          一覧に戻る
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold">{displayName}</h2>
          {shipperId && (
            <p className="text-xs text-muted-foreground">
              shipperId: {shipperId}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {profileDirty && (
            <Badge variant="outline" className="border-orange-400 text-orange-900">
              未保存の変更
            </Badge>
          )}
          {shipperId && contractSummary && (
            <Badge
              variant="outline"
              className={cn(
                contractSummary.hasContract
                  ? "border-emerald-400 text-emerald-800"
                  : "border-amber-500 bg-amber-100 text-amber-900",
              )}
            >
              {contractSummary.hasContract
                ? "請求契約登録済"
                : "請求契約未登録"}
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
          <CardTitle className="text-base">荷主詳細</CardTitle>
          <CardDescription>
            基本情報・対象業務・請求契約をこの画面で登録・編集します。
          </CardDescription>
        </CardHeader>
      </Card>

      <ShipperCompanyProfileSection
        profile={profile}
        savedProfile={savedProfile}
        onChange={handleProfileChange}
        onNavigateToJobLedger={onNavigateToJobLedger}
      />

      {shipperId ? (
        <>
          <div ref={billingRef}>
            <ShipperBillingContractSection
              shipperId={shipperId}
              shipperName={displayName}
              masters={masters}
              contracts={contracts}
              jobOptions={jobOptions}
              onContractsChange={onContractsChange}
              onFeedback={onFeedback}
              highlight={highlightBilling}
            />
          </div>
          <ShipperBillingHistorySection
            shipperId={shipperId}
            contracts={contracts}
          />
        </>
      ) : (
        <section className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-4 text-sm text-amber-950">
          請求契約を登録するには、先に「基本情報を保存」して荷主を登録してください。
        </section>
      )}
    </div>
  );
}
