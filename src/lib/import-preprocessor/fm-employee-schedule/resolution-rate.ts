import type { FmEmployeeScheduleStagingRecord } from "./types";
import {
  countDismissedWarnings,
  getActionableWarnings,
  getOriginalWarnings,
  NON_ACTIONABLE_WARNING_CODES,
} from "./warning-tracking";

function countTotalOriginalWarnings(
  records: FmEmployeeScheduleStagingRecord[],
): number {
  return records.reduce((sum, r) => {
    const flags = getOriginalWarnings(r).filter(
      (f) => !NON_ACTIONABLE_WARNING_CODES.has(f),
    );
    return sum + flags.length;
  }, 0);
}

/** 手動修正により消えた警告（問題なし・保留以外） */
export function countFixedByEditWarnings(
  records: FmEmployeeScheduleStagingRecord[],
): number {
  return records.reduce((sum, r) => {
    const original = getOriginalWarnings(r).filter(
      (f) => !NON_ACTIONABLE_WARNING_CODES.has(f),
    );
    const current = new Set(getActionableWarnings(r));
    const dismissed = new Set(r.resolvedWarningFlags ?? []);
    const onHold = new Set(r.onHoldWarningFlags ?? []);

    let fixed = 0;
    for (const flag of original) {
      if (!current.has(flag) && !dismissed.has(flag) && !onHold.has(flag)) {
        fixed++;
      }
    }
    return sum + fixed;
  }, 0);
}

export function computeWarningResolutionRate(
  records: FmEmployeeScheduleStagingRecord[],
): {
  totalOriginalWarningCount: number;
  dismissedWarningCount: number;
  fixedByEditWarningCount: number;
  resolvedWarningCount: number;
  resolutionRatePercent: number;
} {
  const total = countTotalOriginalWarnings(records);
  const dismissed = countDismissedWarnings(records);
  const fixed = countFixedByEditWarnings(records);
  const resolved = dismissed + fixed;
  const rate = total > 0 ? Math.round((resolved / total) * 100) : 100;

  return {
    totalOriginalWarningCount: total,
    dismissedWarningCount: dismissed,
    fixedByEditWarningCount: fixed,
    resolvedWarningCount: resolved,
    resolutionRatePercent: rate,
  };
}
