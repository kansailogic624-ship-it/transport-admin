"use client";

import { useCallback, useEffect, useState } from "react";
import type { ShipperDetailSectionId } from "@/lib/shipper-ledger-navigation";
import {
  PENDING_SHIPPER_DETAIL_ID_KEY,
  PENDING_SHIPPER_DETAIL_SECTION_KEY,
} from "@/lib/shipper-ledger-navigation";
import { findShipperProfileById } from "@/lib/shipper-company-utils";
import type { ShipperCompanyProfile } from "@/lib/shipper-company-types";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import type { MasterData } from "@/lib/types";
import { ShipperCompanyDetailView } from "./shipper-company-detail-view";
import { ShipperCompanyListView } from "./shipper-company-list-view";

type ShipperCompanyListProps = {
  masters: MasterData;
  contracts: ShipperBillingContract[];
  onMastersChange: (masters: MasterData) => void;
  onContractsChange: (contracts: ShipperBillingContract[]) => void;
  onNavigateToJobLedger?: () => void;
  onFeedback?: (
    message: string,
    detail?: string,
    tone?: "success" | "warn" | "info",
  ) => void;
  initialShipperId?: string | null;
  initialScrollSection?: ShipperDetailSectionId | null;
  onInitialNavigationApplied?: () => void;
};

type ViewMode = "list" | "detail";

export function ShipperCompanyList({
  masters,
  contracts,
  onMastersChange,
  onContractsChange,
  onNavigateToJobLedger,
  onFeedback,
  initialShipperId,
  initialScrollSection,
  onInitialNavigationApplied,
}: ShipperCompanyListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [selectedShipperId, setSelectedShipperId] = useState<string | null>(
    null,
  );
  const [isCreate, setIsCreate] = useState(false);
  const [scrollSection, setScrollSection] =
    useState<ShipperDetailSectionId | null>(null);

  const openDetail = useCallback(
    (shipperId: string, section?: ShipperDetailSectionId | null) => {
      setSelectedShipperId(shipperId);
      setIsCreate(false);
      setViewMode("detail");
      setScrollSection(section ?? null);
      const profile = findShipperProfileById(masters, shipperId);
      onFeedback?.("詳細画面を開きました", profile?.name, "info");
    },
    [masters, onFeedback],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pendingId = sessionStorage.getItem(PENDING_SHIPPER_DETAIL_ID_KEY);
    const pendingSection = sessionStorage.getItem(
      PENDING_SHIPPER_DETAIL_SECTION_KEY,
    ) as ShipperDetailSectionId | null;
    if (pendingId) {
      openDetail(pendingId, pendingSection ?? "billing");
      sessionStorage.removeItem(PENDING_SHIPPER_DETAIL_ID_KEY);
      sessionStorage.removeItem(PENDING_SHIPPER_DETAIL_SECTION_KEY);
    }
  }, [openDetail]);

  useEffect(() => {
    if (!initialShipperId) return;
    openDetail(initialShipperId, initialScrollSection ?? "billing");
    onInitialNavigationApplied?.();
  }, [
    initialShipperId,
    initialScrollSection,
    onInitialNavigationApplied,
    openDetail,
  ]);

  const selectedProfile: ShipperCompanyProfile | null = selectedShipperId
    ? findShipperProfileById(masters, selectedShipperId)
    : null;

  if (viewMode === "detail") {
    return (
      <ShipperCompanyDetailView
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
          setSelectedShipperId(null);
          setIsCreate(false);
          onFeedback?.("一覧に戻りました", undefined, "info");
        }}
        onNavigateToJobLedger={onNavigateToJobLedger}
        onFeedback={(message, detail, tone) =>
          onFeedback?.(message, detail, tone)
        }
        onProfileSaved={(p) => {
          setSelectedShipperId(p.id);
          setIsCreate(false);
        }}
      />
    );
  }

  return (
    <ShipperCompanyListView
      masters={masters}
      contracts={contracts}
      search={search}
      onSearchChange={setSearch}
      onSelectShipper={(id) => openDetail(id)}
      onCreateShipper={() => {
        setIsCreate(true);
        setSelectedShipperId(null);
        setViewMode("detail");
        onFeedback?.("新規荷主の登録画面を開きました", undefined, "info");
      }}
    />
  );
}
