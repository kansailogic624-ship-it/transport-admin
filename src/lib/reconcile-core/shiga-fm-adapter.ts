/**
 * 滋賀FM突合行 → 共通 UnmatchedItem への読み取り専用アダプタ。
 * 既存の ShigaFmReconciliationRow / 突合エンジンは変更しない。
 */

import type {
  ShigaFmMatchedFmRow,
  ShigaFmMatchStatus,
  ShigaFmReconciliationResult,
  ShigaFmReconciliationRow,
} from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import type { ShigaDeliveryStagingRecord } from "@/lib/import-preprocessor/shiga-delivery/types";
import {
  RESOLVED_RECONCILE_ISSUE_CODES,
  type ReconcileIssueCode,
} from "./issue-codes";
import type {
  MasterKind,
  ReconcileIssue,
  ReconcileIssueSeverity,
  ReconcileSuggestedAction,
  UnmatchedItem,
} from "./types";

export type ShigaFmUnmatchedItem = UnmatchedItem<
  ShigaDeliveryStagingRecord,
  ShigaFmMatchedFmRow[]
>;

function severityForCode(code: ReconcileIssueCode): ReconcileIssueSeverity {
  switch (code) {
    case "matched":
    case "matched_aggregate":
      return "info";
    case "amount_mismatch":
    case "mapping_failed":
    case "master_not_found":
    case "contract_not_registered":
      return "warning";
    case "requires_manual_input":
    case "source_only_left":
    case "source_only_right":
      return "needs_action";
    case "requires_reconcile_refresh":
      return "warning";
    default:
      return "warning";
  }
}

function suggestedActionForCode(
  code: ReconcileIssueCode,
  masterKind?: MasterKind,
): ReconcileSuggestedAction {
  switch (code) {
    case "matched":
    case "matched_aggregate":
      return "none";
    case "contract_not_registered":
      return "register_contract";
    case "master_not_found":
      return "register_master";
    case "requires_manual_input":
      return masterKind === "partner" || masterKind === "employee"
        ? "manual_input"
        : "human_review";
    case "requires_reconcile_refresh":
      return "re_reconcile";
    case "amount_mismatch":
    case "mapping_failed":
    case "source_only_left":
    case "source_only_right":
      return "human_review";
    default:
      return "human_review";
  }
}

function issueFromMismatchReason(message: string): ReconcileIssue {
  const trimmed = message.trim();

  if (trimmed.includes("支払契約が未登録")) {
    return buildIssue("contract_not_registered", trimmed, "payment_contract");
  }
  if (trimmed.includes("請求契約が未登録")) {
    return buildIssue("contract_not_registered", trimmed, "billing_contract");
  }
  if (trimmed.includes("業者名の正規化に失敗")) {
    return buildIssue("mapping_failed", trimmed, "partner");
  }
  if (trimmed.includes("社員・傭車の判定ができませんでした")) {
    return buildIssue("mapping_failed", trimmed);
  }
  if (
    trimmed.includes("FM行が不足") ||
    trimmed.includes("FM側に該当行がありません")
  ) {
    return buildIssue("requires_manual_input", trimmed);
  }
  if (trimmed.includes("滋賀店配側に該当支払がありません")) {
    return buildIssue("source_only_left", trimmed);
  }
  if (trimmed.includes("FM側の該当行はすべて他明細で消費済み")) {
    return buildIssue("source_only_right", trimmed);
  }
  if (trimmed.includes("協力会社が選択されていません")) {
    return buildIssue("requires_manual_input", trimmed, "partner");
  }

  return buildIssue("unknown", trimmed);
}

function buildIssue(
  code: ReconcileIssueCode,
  message: string,
  masterKind?: MasterKind,
): ReconcileIssue {
  const issue: ReconcileIssue = {
    code,
    severity: severityForCode(code),
    message,
    suggestedAction: suggestedActionForCode(code, masterKind),
  };
  if (masterKind) {
    issue.masterKind = masterKind;
  }
  if (code === "contract_not_registered" && masterKind === "payment_contract") {
    issue.navigation = { target: "partner_ledger", section: "contract" };
  }
  if (code === "contract_not_registered" && masterKind === "billing_contract") {
    issue.navigation = { target: "shipper_ledger", section: "billing" };
  }
  if (code === "requires_manual_input" && message.includes("FM行")) {
    issue.navigation = { target: "assignment_dialog" };
  }
  return issue;
}

function primaryIssueFromStatus(status: ShigaFmMatchStatus): ReconcileIssue {
  switch (status) {
    case "matched":
      return buildIssue("matched", "突合一致");
    case "matched_sum":
      return buildIssue("matched_aggregate", "合算一致");
    case "shiga_only":
      return buildIssue("source_only_left", "滋賀店配側のみに存在");
    case "fm_only":
      return buildIssue("source_only_right", "FM側のみに存在");
    case "amount_mismatch":
      return buildIssue("amount_mismatch", "金額不一致");
    case "mapping_failed":
      return buildIssue("mapping_failed", "マッピング失敗");
    case "unregistered":
      return buildIssue("master_not_found", "未登録");
    case "fm_shortage":
      return buildIssue("requires_manual_input", "FM不足（手入力が必要）");
    default:
      return buildIssue("unknown", status);
  }
}

/** mismatchReasons から構造化課題を生成（空なら status から1件） */
export function reconcileIssuesFromShigaFmRow(
  row: Pick<ShigaFmReconciliationRow, "status" | "mismatchReasons">,
): ReconcileIssue[] {
  const reasons = row.mismatchReasons
    .map((m) => m.trim())
    .filter((m) => m.length > 0);

  if (reasons.length === 0) {
    return [primaryIssueFromStatus(row.status)];
  }

  const issues = reasons.map(issueFromMismatchReason);

  if (
    row.status === "matched" ||
    row.status === "matched_sum"
  ) {
    return [primaryIssueFromStatus(row.status), ...issues];
  }

  const primary = primaryIssueFromStatus(row.status);
  const hasSameCode = issues.some((i) => i.code === primary.code);
  return hasSameCode ? issues : [primary, ...issues];
}

/** 単一行に派生 reconcileIssues を付与（常に再計算） */
export function enrichShigaFmRowWithReconcileIssues(
  row: ShigaFmReconciliationRow,
): ShigaFmReconciliationRow {
  return {
    ...row,
    reconcileIssues: reconcileIssuesFromShigaFmRow(row),
  };
}

/** 複数行に派生 reconcileIssues を付与 */
export function enrichShigaFmRowsWithReconcileIssues(
  rows: ShigaFmReconciliationRow[],
): ShigaFmReconciliationRow[] {
  return rows.map(enrichShigaFmRowWithReconcileIssues);
}

/** 突合結果全体に派生 reconcileIssues を付与 */
export function enrichShigaFmReconciliationResult(
  result: ShigaFmReconciliationResult,
): ShigaFmReconciliationResult {
  return {
    ...result,
    rows: enrichShigaFmRowsWithReconcileIssues(result.rows),
  };
}

/** 行が確定済みか（共通型の観点） */
export function isShigaFmRowResolved(
  row: Pick<ShigaFmReconciliationRow, "status">,
): boolean {
  return row.status === "matched" || row.status === "matched_sum";
}

/** 単一行を UnmatchedItem に変換 */
export function shigaFmRowToUnmatchedItem(
  row: ShigaFmReconciliationRow,
): ShigaFmUnmatchedItem {
  const issues = reconcileIssuesFromShigaFmRow(row);
  const resolved =
    isShigaFmRowResolved(row) ||
    issues.every((i) => RESOLVED_RECONCILE_ISSUE_CODES.has(i.code));

  return {
    id: row.id,
    sourceId: "shiga_fm",
    matchKey: row.matchKey,
    businessDate: row.businessDate,
    domainStatus: row.status,
    issues,
    leftSource: row.shigaRecord,
    rightSource: row.fmRecords.length > 0 ? row.fmRecords : null,
    resolved,
    manualOverrideId: row.assignmentId,
  };
}

/** 複数行を一括変換 */
export function shigaFmRowsToUnmatchedItems(
  rows: ShigaFmReconciliationRow[],
): ShigaFmUnmatchedItem[] {
  return rows.map(shigaFmRowToUnmatchedItem);
}

/** 未確定行のみ */
export function shigaFmUnresolvedItems(
  rows: ShigaFmReconciliationRow[],
): ShigaFmUnmatchedItem[] {
  return shigaFmRowsToUnmatchedItems(rows).filter((item) => !item.resolved);
}
