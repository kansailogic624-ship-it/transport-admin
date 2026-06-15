"use client";

import { useMemo } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MasterSearchInput } from "@/components/master-search-input";
import {
  formatBillingRates,
  summarizeShipperBillingContracts,
} from "@/lib/shipper-billing-display";
import { matchesTextSearch } from "@/lib/master-search";
import {
  ensureShipperProfiles,
  getShipperProfiles,
} from "@/lib/shipper-company-utils";
import type { ShipperCompanyProfile } from "@/lib/shipper-company-types";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import type { MasterData } from "@/lib/types";
import { cn } from "@/lib/utils";

type ShipperCompanyListViewProps = {
  masters: MasterData;
  contracts: ShipperBillingContract[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelectShipper: (shipperId: string) => void;
  onCreateShipper: () => void;
};

export function ShipperCompanyListView({
  masters,
  contracts,
  search,
  onSearchChange,
  onSelectShipper,
  onCreateShipper,
}: ShipperCompanyListViewProps) {
  const profiles = useMemo(
    () => getShipperProfiles(ensureShipperProfiles(masters)),
    [masters],
  );

  const filtered = profiles.filter(
    (p) =>
      matchesTextSearch(search, p.name) ||
      p.assignedJobNames.some((j) => matchesTextSearch(search, j)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MasterSearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="荷主・対象業務で検索..."
        />
        <button
          type="button"
          className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={onCreateShipper}
        >
          荷主を追加
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
          荷主が登録されていません。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium">会社名</th>
                <th className="px-4 py-2 text-left font-medium">対象業務</th>
                <th className="px-4 py-2 text-left font-medium">契約状態</th>
                <th className="px-4 py-2 text-right font-medium">運賃請求率</th>
                <th className="px-4 py-2 text-right font-medium">高速請求率</th>
                <th className="px-4 py-2 text-left font-medium">請求率</th>
                <th className="px-4 py-2 text-left font-medium">適用開始日</th>
                <th className="px-4 py-2 text-left font-medium">最終更新日</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((profile) => (
                <ShipperListRow
                  key={profile.id}
                  profile={profile}
                  contracts={contracts}
                  onSelect={() => onSelectShipper(profile.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ShipperListRow({
  profile,
  contracts,
  onSelect,
}: {
  profile: ShipperCompanyProfile;
  contracts: ShipperBillingContract[];
  onSelect: () => void;
}) {
  const summary = summarizeShipperBillingContracts(contracts, profile.id);
  const jobs =
    profile.assignedJobNames.length > 0
      ? profile.assignedJobNames.join("、")
      : "—";

  return (
    <tr
      className={cn(
        "cursor-pointer border-b transition-colors last:border-b-0 hover:bg-indigo-50/60",
        !summary.hasContract && "bg-amber-50/40",
      )}
      onClick={onSelect}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {!summary.hasContract && (
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          )}
          <span className="font-medium text-indigo-950">{profile.name}</span>
        </div>
      </td>
      <td className="max-w-[12rem] truncate px-4 py-3 text-muted-foreground">
        {jobs}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          <Badge
            variant="outline"
            className={cn(
              summary.hasContract
                ? "border-emerald-400 text-emerald-800"
                : "border-amber-500 bg-amber-100 text-amber-900",
            )}
          >
            {summary.hasContract ? summary.statusLabel : "請求契約未登録"}
          </Badge>
          {!profile.activeFlag && <Badge variant="secondary">無効</Badge>}
          {profile.assignedJobNames.length === 0 && (
            <Badge variant="outline" className="text-muted-foreground">
              業務未設定
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {summary.freightInvoiceRatePercent != null
          ? `${summary.freightInvoiceRatePercent}%`
          : "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {summary.tollInvoiceRatePercent != null
          ? `${summary.tollInvoiceRatePercent}%`
          : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {formatBillingRates(summary)}
      </td>
      <td className="px-4 py-3 text-xs whitespace-nowrap">
        {summary.effectiveFrom ?? "—"}
      </td>
      <td className="px-4 py-3 text-xs whitespace-nowrap">
        {summary.lastUpdatedAt
          ? summary.lastUpdatedAt.slice(0, 10)
          : "—"}
      </td>
      <td className="px-2 py-3 text-muted-foreground">
        <ChevronRight className="size-4" />
      </td>
    </tr>
  );
}
