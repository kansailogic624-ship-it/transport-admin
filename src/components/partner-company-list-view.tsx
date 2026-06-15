"use client";

import { useMemo } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MasterSearchInput } from "@/components/master-search-input";
import { formatYen } from "@/lib/currency-format";
import { matchesTextSearch } from "@/lib/master-search";
import {
  courseLabelsForProfile,
  ensurePartnerProfiles,
  getPartnerProfiles,
} from "@/lib/partner-company-utils";
import { summarizePartnerPaymentContracts } from "@/lib/partner-contract-display";
import type { PartnerCompanyProfile } from "@/lib/partner-company-types";
import type { PartnerContractRate } from "@/lib/shiga-fm/partner-contract-types";
import type { MasterData } from "@/lib/types";
import { cn } from "@/lib/utils";

type PartnerCompanyListViewProps = {
  masters: MasterData;
  contracts: PartnerContractRate[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelectPartner: (partnerId: string) => void;
  onCreatePartner: () => void;
};

export function PartnerCompanyListView({
  masters,
  contracts,
  search,
  onSearchChange,
  onSelectPartner,
  onCreatePartner,
}: PartnerCompanyListViewProps) {
  const profiles = useMemo(
    () => getPartnerProfiles(ensurePartnerProfiles(masters)),
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
          placeholder="協力会社・依頼業務で検索..."
        />
        <button
          type="button"
          className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={onCreatePartner}
        >
          協力会社を追加
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
          協力会社が登録されていません。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium">会社名</th>
                <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">
                  依頼業務
                </th>
                <th className="hidden px-4 py-2 text-left font-medium md:table-cell">
                  対象コース
                </th>
                <th className="px-4 py-2 text-left font-medium">契約状態</th>
                <th className="px-4 py-2 text-right font-medium">基本単価</th>
                <th className="px-4 py-2 text-right font-medium">残業単価</th>
                <th className="px-4 py-2 text-left font-medium">適用開始日</th>
                <th className="px-4 py-2 text-left font-medium">最終更新日</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((profile) => (
                <PartnerListRow
                  key={profile.id}
                  profile={profile}
                  contracts={contracts}
                  onSelect={() => onSelectPartner(profile.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PartnerListRow({
  profile,
  contracts,
  onSelect,
}: {
  profile: PartnerCompanyProfile;
  contracts: PartnerContractRate[];
  onSelect: () => void;
}) {
  const summary = summarizePartnerPaymentContracts(contracts, profile.id);
  const courses = courseLabelsForProfile(profile);
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
      <td className="hidden max-w-[12rem] truncate px-4 py-3 text-muted-foreground sm:table-cell">
        {jobs}
      </td>
      <td className="hidden max-w-[10rem] truncate px-4 py-3 text-muted-foreground md:table-cell">
        {courses.length > 0 ? courses.join("、") : "—"}
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
            {summary.hasContract ? summary.statusLabel : "支払契約未登録"}
          </Badge>
          {!profile.activeFlag && (
            <Badge variant="secondary">無効</Badge>
          )}
          {profile.assignedJobNames.length === 0 && (
            <Badge variant="outline" className="text-muted-foreground">
              業務未設定
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {summary.baseUnitPrice != null ? formatYen(summary.baseUnitPrice) : "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {summary.overtimeUnitPrice != null
          ? formatYen(summary.overtimeUnitPrice)
          : "—"}
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
