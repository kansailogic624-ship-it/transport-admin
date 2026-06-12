"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getFmFilterDisplayLabel,
  type FmScheduleViewFilter,
} from "@/lib/import-preprocessor/fm-employee-schedule/filters";
import type { FmScheduleWarningCode } from "@/lib/import-preprocessor/fm-employee-schedule/types";

type FmScheduleFilterBarProps = {
  activeFilter: FmScheduleViewFilter;
  activeWarningFlag?: FmScheduleWarningCode | null;
  onClear: () => void;
  filteredCount?: number;
  totalCount?: number;
};

export function FmScheduleFilterBar({
  activeFilter,
  activeWarningFlag,
  onClear,
  filteredCount,
  totalCount,
}: FmScheduleFilterBarProps) {
  if (activeFilter === "all" && !activeWarningFlag) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm">
      <span className="text-sky-950">
        現在の表示:{" "}
        <span className="font-medium">
          {getFmFilterDisplayLabel(activeFilter, activeWarningFlag ?? undefined)}
        </span>
        {filteredCount != null && totalCount != null && (
          <span className="ml-1 text-sky-800/80">
            （{filteredCount} / {totalCount} 行）
          </span>
        )}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 border-sky-300 text-xs"
        onClick={onClear}
      >
        <X className="size-3" />
        フィルタ解除
      </Button>
    </div>
  );
}
