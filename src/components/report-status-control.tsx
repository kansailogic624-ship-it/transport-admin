"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DAILY_REPORT_STATUS_OPTIONS,
  reportStatusBadgeClass,
  reportStatusLabel,
  type DailyReportStatus,
} from "@/lib/report-status";
import { cn } from "@/lib/utils";

type ReportStatusBadgeProps = {
  status: DailyReportStatus;
  className?: string;
};

export function ReportStatusBadge({ status, className }: ReportStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal whitespace-nowrap",
        reportStatusBadgeClass(status),
        className,
      )}
    >
      {reportStatusLabel(status)}
    </Badge>
  );
}

type ReportStatusSelectProps = {
  value: DailyReportStatus;
  onChange: (status: DailyReportStatus) => void;
  compact?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
};

export function ReportStatusSelect({
  value,
  onChange,
  compact = false,
  className,
  onClick,
}: ReportStatusSelectProps) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => {
        if (
          v === "submitted" ||
          v === "not_submitted" ||
          v === "not_required"
        ) {
          onChange(v);
        }
      }}
    >
      <SelectTrigger
        size={compact ? "sm" : "default"}
        className={cn(
          compact
            ? "h-6 w-[5.5rem] border-0 bg-transparent px-1 py-0 text-xs shadow-none focus-visible:ring-1"
            : "h-8 w-[7rem]",
          reportStatusBadgeClass(value),
          className,
        )}
        onClick={onClick}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={compact ? "text-xs" : undefined}>
        {DAILY_REPORT_STATUS_OPTIONS.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className={compact ? "py-1 text-xs" : undefined}
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
