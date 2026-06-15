/**
 * 突合詳細ダイアログ — 確認事項表示モデルテスト
 * npx tsx scripts/test-shiga-fm-detail-dialog-issues.ts
 */
import { buildDetailDialogIssueView } from "../src/lib/reconcile-core/shiga-fm-detail-view";
import type { ShigaFmReconciliationRow } from "../src/lib/import-preprocessor/shiga-fm-reconciliation/types";

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

function main() {
  const matched = buildDetailDialogIssueView(
    baseRow({ status: "matched", mismatchReasons: [] }),
  );
  assert(!matched.showIssueSection, "matched hides section");
  assert(matched.displayIssues.length === 0, "matched no display issues");

  const paymentGap = buildDetailDialogIssueView(
    baseRow({
      status: "mapping_failed",
      mismatchReasons: ["潤生輸送 の支払契約が未登録です"],
    }),
  );
  assert(paymentGap.paymentContractGap, "payment gap");
  assert(paymentGap.showIssueSection, "payment gap section");
  assert(
    paymentGap.displayIssues.some((i) => i.message.includes("支払契約が未登録")),
    "payment message in issues",
  );
  assert(paymentGap.fallbackReasons.length === 0, "payment no fallback");

  const billingGap = buildDetailDialogIssueView(
    baseRow({
      status: "mapping_failed",
      mismatchReasons: ["エフエートラック の請求契約が未登録です"],
    }),
  );
  assert(billingGap.billingContractGap, "billing gap");

  const fmShortage = buildDetailDialogIssueView(
    baseRow({
      status: "fm_shortage",
      costCategory: "fm_shortage",
      paymentParty: "—",
      mismatchReasons: [
        "業務名 Joshin② のFM行が不足しています（スロット 1/1）",
      ],
    }),
  );
  assert(fmShortage.showIssueSection, "fm_shortage section");
  assert(
    fmShortage.displayIssues.some((i) => i.code === "requires_manual_input"),
    "fm_shortage manual input",
  );
  assert(
    fmShortage.displayIssues.some((i) =>
      i.message.includes("FM行が不足しています"),
    ),
    "fm_shortage detail message",
  );

  const partialEnriched = buildDetailDialogIssueView(
    baseRow({
      status: "mapping_failed",
      mismatchReasons: [
        "潤生輸送 の支払契約が未登録です",
        "将来追加される独自メッセージ",
      ],
      reconcileIssues: [
        {
          code: "contract_not_registered",
          severity: "warning",
          message: "潤生輸送 の支払契約が未登録です",
          masterKind: "payment_contract",
          suggestedAction: "register_contract",
        },
      ],
    }),
  );
  assert(partialEnriched.fallbackReasons.length === 1, "partial fallback");
  assert(
    partialEnriched.fallbackReasons[0] === "将来追加される独自メッセージ",
    "uncovered text preserved",
  );

  const enriched = buildDetailDialogIssueView(
    baseRow({
      status: "mapping_failed",
      mismatchReasons: ["潤生輸送 の支払契約が未登録です"],
      reconcileIssues: [
        {
          code: "mapping_failed",
          severity: "warning",
          message: "マッピング失敗",
          suggestedAction: "human_review",
        },
        {
          code: "contract_not_registered",
          severity: "warning",
          message: "潤生輸送 の支払契約が未登録です",
          masterKind: "payment_contract",
          suggestedAction: "register_contract",
        },
      ],
    }),
  );
  assert(enriched.paymentContractGap, "enriched payment gap");
  assert(enriched.fallbackReasons.length === 0, "enriched no fallback dup");

  console.log("OK shiga-fm detail dialog issues");
}

main();
