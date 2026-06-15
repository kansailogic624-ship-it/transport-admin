import type { ShigaFmReconciliationRow } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import { RESOLVED_RECONCILE_ISSUE_CODES } from "./issue-codes";
import { reconcileIssuesFromShigaFmRow } from "./shiga-fm-adapter";
import type { ReconcileIssue } from "./types";

export type DetailDialogIssueView = {
  /** matched / matched_aggregate を除く表示用課題 */
  displayIssues: ReconcileIssue[];
  /** reconcileIssues に未反映の mismatchReasons */
  fallbackReasons: string[];
  paymentContractGap: boolean;
  billingContractGap: boolean;
  /** 確認事項セクションを表示するか */
  showIssueSection: boolean;
};

function resolveRowIssues(row: ShigaFmReconciliationRow): ReconcileIssue[] {
  if (row.reconcileIssues && row.reconcileIssues.length > 0) {
    return row.reconcileIssues;
  }
  return reconcileIssuesFromShigaFmRow(row);
}

/** 突合詳細ダイアログ用の課題表示モデル */
export function buildDetailDialogIssueView(
  row: ShigaFmReconciliationRow,
): DetailDialogIssueView {
  const issues = resolveRowIssues(row);
  const displayIssues = issues.filter(
    (issue) => !RESOLVED_RECONCILE_ISSUE_CODES.has(issue.code),
  );

  const coveredMessages = new Set(
    displayIssues.map((issue) => issue.message.trim()).filter(Boolean),
  );
  const fallbackReasons = row.mismatchReasons
    .map((reason) => reason.trim())
    .filter((reason) => reason.length > 0 && !coveredMessages.has(reason));

  const paymentContractGap = displayIssues.some(
    (issue) =>
      issue.code === "contract_not_registered" &&
      issue.masterKind === "payment_contract",
  );
  const billingContractGap = displayIssues.some(
    (issue) =>
      issue.code === "contract_not_registered" &&
      issue.masterKind === "billing_contract",
  );

  return {
    displayIssues,
    fallbackReasons,
    paymentContractGap,
    billingContractGap,
    showIssueSection: displayIssues.length > 0 || fallbackReasons.length > 0,
  };
}
