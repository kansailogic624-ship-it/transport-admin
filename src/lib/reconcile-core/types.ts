/**
 * 共通突合基盤 — Phase 1 型定義
 * 既存の滋賀FM型は変更せず、読み取り専用アダプタ用の共通型のみ。
 */

import type { ReconcileIssueCode } from "./issue-codes";

/** 突合ソース識別子（Phase 1 は shiga_fm のみ） */
export type ReconcileSourceId = "shiga_fm";

/** マスタ種別（課題の navigation / masterKind 用） */
export type MasterKind =
  | "shipper"
  | "partner"
  | "job"
  | "employee"
  | "vehicle"
  | "billing_contract"
  | "payment_contract";

/** 課題の重大度 */
export type ReconcileIssueSeverity =
  | "info"
  | "warning"
  | "error"
  | "needs_action";

/** 推奨アクション（UI 導線は Phase 3 以降） */
export type ReconcileSuggestedAction =
  | "register_master"
  | "register_contract"
  | "manual_input"
  | "re_reconcile"
  | "human_review"
  | "none";

/** 台帳・画面への導線（将来フェーズ用。Phase 1 では設定のみ） */
export type ReconcileNavigationTarget =
  | "shipper_ledger"
  | "partner_ledger"
  | "job_ledger"
  | "assignment_dialog";

export type ReconcileNavigation = {
  target: ReconcileNavigationTarget;
  entityId?: string;
  section?: string;
};

/**
 * 構造化された突合課題。
 * Phase 1 では滋賀FM行の status / mismatchReasons から生成する。
 */
export type ReconcileIssue = {
  code: ReconcileIssueCode;
  severity: ReconcileIssueSeverity;
  message: string;
  masterKind?: MasterKind;
  suggestedAction?: ReconcileSuggestedAction;
  navigation?: ReconcileNavigation;
};

/**
 * 未確定・要確認行の共通表現。
 * leftSource / rightSource はソース種別ごとの生データ（Phase 1: 滋賀 / FM）。
 */
export type UnmatchedItem<TLeft = unknown, TRight = unknown> = {
  id: string;
  sourceId: ReconcileSourceId;
  matchKey: string;
  businessDate: string;
  /** ドメイン固有ステータス（表示ラベルはソース側マップを参照） */
  domainStatus: string;
  issues: ReconcileIssue[];
  leftSource: TLeft | null;
  rightSource: TRight | null;
  resolved: boolean;
  manualOverrideId: string | null;
};
