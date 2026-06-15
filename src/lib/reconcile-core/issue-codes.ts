/**
 * 突合課題コード（共通突合基盤 Phase 1）
 */

export type ReconcileIssueCode =
  | "matched"
  | "matched_aggregate"
  | "master_not_found"
  | "contract_not_registered"
  | "mapping_failed"
  | "amount_mismatch"
  | "source_only_left"
  | "source_only_right"
  | "requires_manual_input"
  | "requires_reconcile_refresh"
  | "unknown";

export const RECONCILE_ISSUE_CODE_LABELS: Record<ReconcileIssueCode, string> = {
  matched: "一致",
  matched_aggregate: "合算一致",
  master_not_found: "マスタ未登録",
  contract_not_registered: "契約未登録",
  mapping_failed: "マップ失敗",
  amount_mismatch: "金額不一致",
  source_only_left: "左ソースのみ",
  source_only_right: "右ソースのみ",
  requires_manual_input: "手入力が必要",
  requires_reconcile_refresh: "再突合が必要",
  unknown: "要確認",
};

/** 確定済みとみなす課題コード */
export const RESOLVED_RECONCILE_ISSUE_CODES: ReadonlySet<ReconcileIssueCode> =
  new Set(["matched", "matched_aggregate"]);
