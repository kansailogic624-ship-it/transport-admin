"use client";

import type { PreprocessResult } from "@/lib/import-preprocessor";

export type ReviewTabId = "warnings" | "duplicates" | "company";

type PreprocessStickyNavProps = {
  result: PreprocessResult | null;
  onNavigate: (tab: ReviewTabId) => void;
};

export function PreprocessStickyNav({
  result,
  onNavigate,
}: PreprocessStickyNavProps) {
  if (!result) return null;

  const statusSummary = result.warningStatusSummary ?? {
    pending: 0,
    confirmedDuplicate: 0,
    confirmedValid: 0,
    ignored: 0,
  };
  const unknown = result.records.filter((r) => r.operationType === "unknown").length;
  const companyGroups = new Set(
    result.records.map((r) => r.companyOriginal || "（空欄）"),
  ).size;

  const scrollToReview = (tab: ReviewTabId) => {
    onNavigate(tab);
    document.getElementById("review-fix-area")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="sticky top-0 z-30 -mx-1 border-b bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap gap-2">
        <NavChip
          label={`警告${statusSummary.pending}件`}
          active={statusSummary.pending > 0}
          onClick={() => scrollToReview("warnings")}
        />
        <NavChip
          label={`重複${result.duplicateRows}件`}
          active={result.duplicateRows > 0}
          onClick={() => scrollToReview("duplicates")}
        />
        <NavChip
          label={`判定不明${unknown}件`}
          active={unknown > 0}
          onClick={() => scrollToReview("company")}
        />
        <NavChip
          label="会社名修正"
          onClick={() => scrollToReview("company")}
        />
        {companyGroups > 0 && (
          <span className="self-center text-xs text-muted-foreground">
            {companyGroups} 社
          </span>
        )}
      </div>
    </div>
  );
}

function NavChip({
  label,
  onClick,
  active = true,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
          : "border-muted bg-muted/40 text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
