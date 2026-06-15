"use client";

import { useCallback, useEffect, useState } from "react";
import type { PartnerDetailSectionId } from "@/lib/partner-ledger-navigation";
import {
  PENDING_PARTNER_DETAIL_ID_KEY,
  PENDING_PARTNER_DETAIL_SECTION_KEY,
} from "@/lib/partner-ledger-navigation";
import { findPartnerProfileById } from "@/lib/partner-company-utils";
import type { PartnerCompanyProfile } from "@/lib/partner-company-types";
import type { PartnerContractRate } from "@/lib/shiga-fm/partner-contract-types";
import type { MasterData } from "@/lib/types";
import { PartnerCompanyDetailView } from "./partner-company-detail-view";
import { PartnerCompanyListView } from "./partner-company-list-view";

type PartnerCompanyListProps = {
  masters: MasterData;
  contracts: PartnerContractRate[];
  onMastersChange: (masters: MasterData) => void;
  onContractsChange: (contracts: PartnerContractRate[]) => void;
  onNavigateToJobLedger?: () => void;
  onFeedback?: (
    message: string,
    detail?: string,
    tone?: "success" | "warn" | "info",
  ) => void;
  initialPartnerId?: string | null;
  initialScrollSection?: PartnerDetailSectionId | null;
  onInitialNavigationApplied?: () => void;
};

type ViewMode = "list" | "detail";

export function PartnerCompanyList({
  masters,
  contracts,
  onMastersChange,
  onContractsChange,
  onNavigateToJobLedger,
  onFeedback,
  initialPartnerId,
  initialScrollSection,
  onInitialNavigationApplied,
}: PartnerCompanyListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    null,
  );
  const [isCreate, setIsCreate] = useState(false);
  const [scrollSection, setScrollSection] =
    useState<PartnerDetailSectionId | null>(null);

  const openDetail = useCallback(
    (partnerId: string, section?: PartnerDetailSectionId | null) => {
      setSelectedPartnerId(partnerId);
      setIsCreate(false);
      setViewMode("detail");
      setScrollSection(section ?? null);
      const profile = findPartnerProfileById(masters, partnerId);
      onFeedback?.("詳細画面を開きました", profile?.name, "info");
    },
    [masters, onFeedback],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pendingId = sessionStorage.getItem(PENDING_PARTNER_DETAIL_ID_KEY);
    const pendingSection = sessionStorage.getItem(
      PENDING_PARTNER_DETAIL_SECTION_KEY,
    ) as PartnerDetailSectionId | null;
    if (pendingId) {
      openDetail(pendingId, pendingSection ?? "contracts");
      sessionStorage.removeItem(PENDING_PARTNER_DETAIL_ID_KEY);
      sessionStorage.removeItem(PENDING_PARTNER_DETAIL_SECTION_KEY);
    }
  }, [openDetail]);

  useEffect(() => {
    if (!initialPartnerId) return;
    openDetail(initialPartnerId, initialScrollSection ?? "contracts");
    onInitialNavigationApplied?.();
  }, [
    initialPartnerId,
    initialScrollSection,
    onInitialNavigationApplied,
    openDetail,
  ]);

  const selectedProfile: PartnerCompanyProfile | null = selectedPartnerId
    ? findPartnerProfileById(masters, selectedPartnerId)
    : null;

  if (viewMode === "detail") {
    return (
      <PartnerCompanyDetailView
        profile={isCreate ? null : selectedProfile}
        isCreate={isCreate}
        masters={masters}
        contracts={contracts}
        onMastersChange={onMastersChange}
        onContractsChange={onContractsChange}
        initialScrollSection={scrollSection}
        onScrollSectionApplied={() => setScrollSection(null)}
        onBack={() => {
          setViewMode("list");
          setSelectedPartnerId(null);
          setIsCreate(false);
          onFeedback?.("一覧に戻りました", undefined, "info");
        }}
        onNavigateToJobLedger={onNavigateToJobLedger}
        onFeedback={(message, detail, tone) =>
          onFeedback?.(message, detail, tone)
        }
        onProfileSaved={(p) => {
          setSelectedPartnerId(p.id);
          setIsCreate(false);
        }}
      />
    );
  }

  return (
    <PartnerCompanyListView
      masters={masters}
      contracts={contracts}
      search={search}
      onSearchChange={setSearch}
      onSelectPartner={(id) => openDetail(id)}
      onCreatePartner={() => {
        setIsCreate(true);
        setSelectedPartnerId(null);
        setViewMode("detail");
        onFeedback?.("新規協力会社の登録画面を開きました", undefined, "info");
      }}
    />
  );
}
