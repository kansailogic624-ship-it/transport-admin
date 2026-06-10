"use client";

import { ShipperExpenseBreakdownContent } from "@/components/shipper-expense-breakdown-content";
import {
  Popover,
  PopoverArrow,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatYen } from "@/lib/currency-format";
import type { ShipperExpenseBreakdown } from "@/lib/shipper-expense-breakdown";

type ShipperExpensePopoverProps = {
  amount: number;
  shipperName: string;
  yearMonth: string;
  jobName?: string;
  breakdown: ShipperExpenseBreakdown;
  className?: string;
  onTriggerClick?: (e: React.MouseEvent) => void;
};

export function ShipperExpensePopover({
  amount,
  shipperName,
  yearMonth,
  jobName,
  breakdown,
  className = "",
  onTriggerClick,
}: ShipperExpensePopoverProps) {
  if (amount <= 0) {
    return (
      <span className={`tabular-nums text-muted-foreground ${className}`}>
        {formatYen(amount)}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={`cursor-pointer border-0 bg-transparent p-0 text-blue-600 underline-offset-2 hover:underline tabular-nums ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          onTriggerClick?.(e);
        }}
      >
        {formatYen(amount)}
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverPositioner side="top" align="end">
          <PopoverPopup>
            <PopoverArrow />
            <ShipperExpenseBreakdownContent
              shipperName={shipperName}
              yearMonth={yearMonth}
              jobName={jobName}
              breakdown={breakdown}
            />
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </Popover>
  );
}
