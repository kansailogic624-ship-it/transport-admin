import { AlertTriangle } from "lucide-react";
import type { AlertItem } from "@/lib/alerts";

type AlertListProps = {
  alerts: AlertItem[];
  className?: string;
};

export function AlertList({ alerts, className = "" }: AlertListProps) {
  if (alerts.length === 0) return null;

  return (
    <ul className={`space-y-1 ${className}`}>
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className="flex items-start gap-1.5 text-sm font-medium text-red-600"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="break-words">⚠️ {alert.message}</span>
        </li>
      ))}
    </ul>
  );
}
