"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  PreprocessResult,
  PreprocessWarningStatus,
} from "@/lib/import-preprocessor";
import { buildDuplicateGroupDetails } from "@/lib/import-preprocessor/duplicate-groups";
import type { ReviewTabId } from "./PreprocessStickyNav";
import { BulkCompanyEditPanel } from "./BulkCompanyEditPanel";
import { DuplicateGroupsTab } from "./DuplicateGroupsTab";
import { WarningDetailTable } from "./WarningDetailTable";

type ReviewFixPanelProps = {
  result: PreprocessResult | null;
  activeTab: ReviewTabId;
  onTabChange: (tab: ReviewTabId) => void;
  onSetWarningStatus: (
    recordIds: string[],
    status: PreprocessWarningStatus,
  ) => void;
  onEditRow: (recordId: string) => void;
  onBulkApply: Parameters<typeof BulkCompanyEditPanel>[0]["onBulkApply"];
};

const TABS: { id: ReviewTabId; label: string }[] = [
  { id: "warnings", label: "警告" },
  { id: "duplicates", label: "重複候補" },
  { id: "company", label: "会社名一括修正" },
];

export function ReviewFixPanel({
  result,
  activeTab,
  onTabChange,
  onSetWarningStatus,
  onEditRow,
  onBulkApply,
}: ReviewFixPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const statusSummary = result?.warningStatusSummary ?? {
    pending: 0,
    confirmedDuplicate: 0,
    confirmedValid: 0,
    ignored: 0,
  };
  const unknownCount =
    result?.records.filter((r) => r.operationType === "unknown").length ?? 0;
  const duplicateGroups = useMemo(
    () => (result ? buildDuplicateGroupDetails(result.records) : []),
    [result],
  );

  const needsReview =
    statusSummary.pending > 0 ||
    (result?.duplicateRows ?? 0) > 0 ||
    unknownCount > 0;

  useEffect(() => {
    if (needsReview) setCollapsed(false);
  }, [needsReview, result?.sourceFileName]);

  if (!result) return null;

  const warningDetails = result.warningDetails ?? [];

  return (
    <Card id="review-fix-area" className="scroll-mt-16">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">4. 要確認・修正</CardTitle>
            <CardDescription>
              警告・重複・会社名をここで確認（メモリのみ）
            </CardDescription>
          </div>
          {!needsReview && (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {collapsed ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
              {collapsed ? "展開" : "折りたたむ"}
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge label="未確認" value={statusSummary.pending} />
          <Badge label="確認済み重複" value={statusSummary.confirmedDuplicate} />
          <Badge label="確認済み正常" value={statusSummary.confirmedValid} />
        </div>
      </CardHeader>

      {(!collapsed || needsReview) && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1 border-b pb-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
                {tab.id === "warnings" && statusSummary.pending > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-200 px-1.5 text-xs text-amber-900">
                    {statusSummary.pending}
                  </span>
                )}
                {tab.id === "duplicates" && duplicateGroups.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-200 px-1.5 text-xs text-amber-900">
                    {duplicateGroups.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab === "warnings" && (
            <div>
              {warningDetails.length > 0 ? (
                <WarningDetailTable
                  rows={warningDetails}
                  onSetStatus={onSetWarningStatus}
                  onEditRow={onEditRow}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  未確認の警告はありません。
                </p>
              )}
            </div>
          )}

          {activeTab === "duplicates" && (
            <DuplicateGroupsTab
              result={result}
              onSetWarningStatus={onSetWarningStatus}
            />
          )}

          {activeTab === "company" && (
            <BulkCompanyEditPanel
              result={result}
              onBulkApply={onBulkApply}
              embedded
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Badge({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-md border bg-muted/30 px-2 py-1">
      {label}: <strong className="tabular-nums">{value}</strong>
    </span>
  );
}
