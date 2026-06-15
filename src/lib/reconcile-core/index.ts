export type {
  MasterKind,
  ReconcileIssue,
  ReconcileIssueSeverity,
  ReconcileNavigation,
  ReconcileNavigationTarget,
  ReconcileSourceId,
  ReconcileSuggestedAction,
  UnmatchedItem,
} from "./types";

export {
  RECONCILE_ISSUE_CODE_LABELS,
  RESOLVED_RECONCILE_ISSUE_CODES,
  type ReconcileIssueCode,
} from "./issue-codes";

export {
  enrichShigaFmReconciliationResult,
  enrichShigaFmRowWithReconcileIssues,
  enrichShigaFmRowsWithReconcileIssues,
  isShigaFmRowResolved,
  reconcileIssuesFromShigaFmRow,
  shigaFmRowToUnmatchedItem,
  shigaFmRowsToUnmatchedItems,
  shigaFmUnresolvedItems,
  type ShigaFmUnmatchedItem,
} from "./shiga-fm-adapter";

export {
  buildDetailDialogIssueView,
  type DetailDialogIssueView,
} from "./shiga-fm-detail-view";
