/**
 * 契約単価マスタ初期登録（Firestore）
 * npx tsx scripts/seed-partner-contracts.ts
 *
 * 要: ログイン済み Firebase 環境、または手動で UI の「初期契約を登録」を使用
 */
import { buildDefaultPartnerContractDrafts } from "../src/lib/shiga-fm/default-contracts";
import type { PartnerContractRate } from "../src/lib/shiga-fm/partner-contract-types";

function main() {
  const drafts = buildDefaultPartnerContractDrafts();
  const now = new Date().toISOString();
  const contracts: PartnerContractRate[] = drafts.map((d) => ({
    id: crypto.randomUUID(),
    ...d,
    createdAt: now,
    updatedAt: now,
  }));

  console.log("Default partner contracts (register via UI or Firestore):");
  for (const c of contracts) {
    const sample = {
      invoice: Math.round(c.baseUnitPrice * c.invoiceRate),
      payment: c.baseUnitPrice,
      profit: Math.round(c.baseUnitPrice * c.invoiceRate) - c.baseUnitPrice,
    };
    console.log(`- ${c.vendorName} / ${c.courseName}`, sample);
  }
  console.log("\nUse データ前処理 → 滋賀店配×FM突合 → 契約単価マスタ → 初期契約を登録");
}

main();
