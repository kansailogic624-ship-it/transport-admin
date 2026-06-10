import { Badge } from "@/components/ui/badge";
import {
  dayStatusBadgeClass,
  type DayStatus,
} from "@/lib/schedule-day-status";
import { cn } from "@/lib/utils";

type DayStatusBadgeProps = {
  status: DayStatus;
  className?: string;
};

export function DayStatusBadge({ status, className }: DayStatusBadgeProps) {
  return (
    <Badge
      className={cn(
        "whitespace-nowrap text-[10px] font-semibold",
        dayStatusBadgeClass(status),
        className,
      )}
    >
      {status}
    </Badge>
  );
}
