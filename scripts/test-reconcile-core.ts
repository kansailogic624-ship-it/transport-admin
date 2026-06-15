/**
 * reconcile-core Phase 1 テスト
 * npx tsx scripts/test-reconcile-core.ts
 */
import {
  RECONCILE_ISSUE_CODE_LABELS,
  RESOLVED_RECONCILE_ISSUE_CODES,
  enrichShigaFmReconciliationResult,
  enrichShigaFmRowWithReconcileIssues,
  reconcileIssuesFromShigaFmRow,
  shigaFmRowToUnmatchedItem,
  shigaFmRowsToUnmatchedItems,
  shigaFmUnresolvedItems,
  type ReconcileIssue,
} from "../src/lib/reconcile-core";
import type {
  ShigaFmReconciliationResult,
  ShigaFmReconciliationRow,
} from "../src/lib/import-preprocessor/shiga-fm-reconciliation/types";
import {
  stripReconcileIssuesFromResult,
  stripReconcileIssuesFromRow,
} from "../src/lib/shiga-fm/session-utils";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function baseRow(
  overrides: Partial<ShigaFmReconciliationRow> = {},
): ShigaFmReconciliationRow {
  return {
    id: "row-1",
    matchKey: "2026-04-01|SHIGA_02|1",
    businessDate: "2026-04-01",
    courseId: "SHIGA_02",
    courseName: "滋賀地区②",
    vendorCode: "V1",
    vendorName: "業者A",
    slotKey: "2026-04-01|SHIGA_02|1",
    assignmentId: null,
    slotIndex: 1,
    unitCount: 1,
    jobName: "Joshin②",
    status: "matched",
    costCategory: "partner",
    billingParty: "エフエートラック",
    paymentParty: "潤生輸送",
    contractTypeLabel: null,
    contractId: null,
    paymentContractId: null,
    billingContractId: null,
    paymentContractLabel: null,
    billingContractLabel: null,
    billingPartyId: null,
    paymentPartyId: null,
    businessMonth: "2026-04",
    salesAmount: 1000,
    paymentAmount: 800,
    grossProfitAmount: 200,
    grossProfitRate: 20,
    notes: [],
    shigaRecord: null,
    fmRecords: [],
    fmJobNames: [],
    mismatchReasons: [],
    matchNotes: [],
    ...overrides,
  };
}

function hasCode(issues: ReconcileIssue[], code: string): boolean {
  return issues.some((i) => i.code === code);
}

function main() {
  assert(RECONCILE_ISSUE_CODE_LABELS.matched === "一致", "labels");
  assert(RESOLVED_RECONCILE_ISSUE_CODES.has("matched"), "resolved set");

  const matched = reconcileIssuesFromShigaFmRow(
    baseRow({ status: "matched", mismatchReasons: [] }),
  );
  assert(matched.length === 1 && matched[0]!.code === "matched", "matched");

  const paymentGap = reconcileIssuesFromShigaFmRow(
    baseRow({
      status: "mapping_failed",
      mismatchReasons: ["潤生輸送 の支払契約が未登録です"],
    }),
  );
  assert(hasCode(paymentGap, "mapping_failed"), "primary mapping_failed");
  assert(hasCode(paymentGap, "contract_not_registered"), paymentGap.toString());
  assert(
    paymentGap.find((i) => i.code === "contract_not_registered")?.masterKind ===
      "payment_contract",
    "payment masterKind",
  );

  const billingGap = reconcileIssuesFromShigaFmRow(
    baseRow({
      status: "mapping_failed",
      mismatchReasons: ["エフエートラック の請求契約が未登録です"],
    }),
  );
  assert(
    billingGap.find((i) => i.code === "contract_not_registered")?.masterKind ===
      "billing_contract",
    "billing masterKind",
  );

  const fmShortage = shigaFmRowToUnmatchedItem(
    baseRow({
      status: "fm_shortage",
      costCategory: "fm_shortage",
      paymentParty: "—",
      mismatchReasons: [
        "業務名 Joshin② のFM行が不足しています（スロット 1/1）",
      ],
    }),
  );
  assert(fmShortage.sourceId === "shiga_fm", "sourceId");
  assert(fmShortage.domainStatus === "fm_shortage", "domainStatus");
  assert(!fmShortage.resolved, "fm_shortage unresolved");
  assert(hasCode(fmShortage.issues, "requires_manual_input"), "fm shortage");
  assert(
    fmShortage.issues.find((i) => i.code === "requires_manual_input")
      ?.navigation?.target === "assignment_dialog",
    "assignment nav",
  );

  const resolved = shigaFmRowToUnmatchedItem(
    baseRow({ status: "matched_sum", mismatchReasons: [] }),
  );
  assert(resolved.resolved, "matched_sum resolved");

  const batch = shigaFmRowsToUnmatchedItems([
    baseRow({ id: "a", status: "matched" }),
    baseRow({ id: "b", status: "fm_shortage", mismatchReasons: ["FM不足"] }),
  ]);
  assert(batch.length === 2, "batch length");

  const unresolved = shigaFmUnresolvedItems([
    baseRow({ id: "a", status: "matched" }),
    baseRow({ id: "b", status: "fm_only", mismatchReasons: [] }),
  ]);
  assert(unresolved.length === 1 && unresolved[0]!.id === "b", "unresolved");

  const enriched = enrichShigaFmRowWithReconcileIssues(
    baseRow({
      status: "mapping_failed",
      mismatchReasons: ["潤生輸送 の支払契約が未登録です"],
    }),
  );
  assert(
    enriched.reconcileIssues != null && enriched.reconcileIssues.length >= 2,
    "enriched issues",
  );
  assert(hasCode(enriched.reconcileIssues!, "contract_not_registered"), "enriched code");

  const enrichedTwice = enrichShigaFmRowWithReconcileIssues(enriched);
  assert(
    JSON.stringify(enrichedTwice.reconcileIssues) ===
      JSON.stringify(enriched.reconcileIssues),
    "enrich idempotent",
  );

  const stripped = stripReconcileIssuesFromRow(enriched);
  assert(stripped.reconcileIssues === undefined, "strip row");

  const result: ShigaFmReconciliationResult = {
    createdAt: "2026-01-01",
    inputMode: "both",
    fileStatus: {
      shigaLoaded: true,
      fmLoaded: true,
      shigaFileName: "a",
      fmFileName: "b",
    },
    shigaFileName: "a",
    fmFileName: "b",
    monthPeriod: "2026-04",
    rows: [enriched],
    totals: {} as ShigaFmReconciliationResult["totals"],
    warnings: [],
    notices: [],
  };
  const strippedResult = stripReconcileIssuesFromResult(result);
  assert(
    strippedResult?.rows[0]?.reconcileIssues === undefined,
    "strip result",
  );
  const restored = enrichShigaFmReconciliationResult(strippedResult!);
  assert(
    hasCode(restored.rows[0]!.reconcileIssues ?? [], "contract_not_registered"),
    "restore after strip",
  );

  console.log("OK reconcile-core phase1+phase2");
}

main();
