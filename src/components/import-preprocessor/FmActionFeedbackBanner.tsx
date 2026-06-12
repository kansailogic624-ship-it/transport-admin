"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FmActionFeedback = {
  message: string;
  detail?: string;
  tone?: "info" | "success" | "warn";
};

type FmActionFeedbackBannerProps = {
  feedback: FmActionFeedback | null;
  onDismiss?: () => void;
};

export function FmActionFeedbackBanner({
  feedback,
  onDismiss,
}: FmActionFeedbackBannerProps) {
  if (!feedback) return null;

  const toneClass =
    feedback.tone === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
      : feedback.tone === "warn"
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : "border-sky-300 bg-sky-50 text-sky-950";

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm",
        toneClass,
      )}
      role="status"
      aria-live="polite"
    >
      <div>
        <p className="font-medium">{feedback.message}</p>
        {feedback.detail && (
          <p className="mt-0.5 text-sm opacity-90">{feedback.detail}</p>
        )}
      </div>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2"
          onClick={onDismiss}
          aria-label="閉じる"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
