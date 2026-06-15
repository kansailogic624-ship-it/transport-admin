/**
 * FM不足 UI メッセージテスト
 * npx tsx scripts/test-fm-shortage-ui-messages.ts
 */
import {
  formatRecommendedPartnersHint,
  FM_SHORTAGE_EXPLANATION,
  PARTNER_LEDGER_CONTRACT_SAVED_SHIGA_FM_NOTE,
  SHIPPER_BILLING_CONTRACT_SAVED_SHIGA_FM_NOTE,
  withPartnerLedgerShigaFmNote,
  withShipperBillingLedgerShigaFmNote,
} from "../src/lib/shiga-fm/fm-shortage-ui-messages";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function main() {
  assert(FM_SHORTAGE_EXPLANATION.includes("自動では確定しません"), "explanation");

  assert(
    PARTNER_LEDGER_CONTRACT_SAVED_SHIGA_FM_NOTE.includes("再突合が必要"),
    "ledger note",
  );
  assert(
    PARTNER_LEDGER_CONTRACT_SAVED_SHIGA_FM_NOTE.includes("傭車・アルバイト入力"),
    "ledger note input",
  );

  const combined = withPartnerLedgerShigaFmNote("潤生輸送 / SHIGA_03");
  assert(combined.includes("潤生輸送"), combined);
  assert(combined.includes("再突合が必要"), combined);

  const noteOnly = withPartnerLedgerShigaFmNote();
  assert(noteOnly === PARTNER_LEDGER_CONTRACT_SAVED_SHIGA_FM_NOTE, noteOnly);

  assert(
    SHIPPER_BILLING_CONTRACT_SAVED_SHIGA_FM_NOTE.includes("荷主請求契約"),
    "shipper billing note",
  );
  assert(
    SHIPPER_BILLING_CONTRACT_SAVED_SHIGA_FM_NOTE.includes("再突合が必要"),
    "shipper billing reconcile",
  );
  assert(
    SHIPPER_BILLING_CONTRACT_SAVED_SHIGA_FM_NOTE.includes("傭車・アルバイト入力"),
    "shipper billing fm shortage",
  );
  assert(
    !SHIPPER_BILLING_CONTRACT_SAVED_SHIGA_FM_NOTE.includes("台帳の契約単価"),
    "shipper billing must not use partner wording",
  );

  const shipperCombined = withShipperBillingLedgerShigaFmNote("テスト荷主 / SHIGA_01");
  assert(shipperCombined.includes("テスト荷主"), shipperCombined);
  assert(shipperCombined.includes("荷主請求契約"), shipperCombined);
  assert(
    !shipperCombined.includes("台帳の契約単価"),
    "shipper combined must not use partner wording",
  );

  const shipperNoteOnly = withShipperBillingLedgerShigaFmNote();
  assert(
    shipperNoteOnly === SHIPPER_BILLING_CONTRACT_SAVED_SHIGA_FM_NOTE,
    shipperNoteOnly,
  );

  const withRec = formatRecommendedPartnersHint(["潤生輸送"], true);
  assert(withRec.includes("推奨候補：潤生輸送"), withRec);

  const noRec = formatRecommendedPartnersHint([], true);
  assert(noRec.includes("推奨候補なし"), noRec);

  const empty = formatRecommendedPartnersHint([], false);
  assert(empty.includes("協力会社台帳"), empty);

  console.log("OK fm shortage ui messages");
}

main();
