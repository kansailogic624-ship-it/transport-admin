"use client";

import { Badge } from "@/components/ui/badge";
import {
  OPERATION_TYPE_LABELS,
  type PreprocessOperationType,
} from "@/lib/import-preprocessor";

const BADGE_CLASS: Record<PreprocessOperationType, string> = {
  own: "border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-100",
  partner: "border-violet-300 bg-violet-100 text-violet-900 hover:bg-violet-100",
  unknown: "border-orange-300 bg-orange-100 text-orange-900 hover:bg-orange-100",
};

export function OperationTypeBadge({
  type,
}: {
  type: PreprocessOperationType;
}) {
  return (
    <Badge variant="outline" className={BADGE_CLASS[type]}>
      {OPERATION_TYPE_LABELS[type]}
    </Badge>
  );
}
