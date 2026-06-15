/**
 * 契約単価計算テスト
 * npx tsx scripts/test-partner-contract-calc.ts
 */
import { calcContractAmounts, allocatePerUnitAmounts } from "../src/lib/shiga-fm";
import { buildDefaultPartnerContractDrafts } from "../src/lib/shiga-fm/default-contracts";
import { buildDefaultShipperBillingDraft } from "../src/lib/shiga-fm/contract-migrate";
import { resolvePartnerPaymentContract } from "../src/lib/shiga-fm/contract-resolve";
import type { PartnerPaymentContract } from "../src/lib/shiga-fm/partner-payment-types";
import type { ShipperBillingContract } from "../src/lib/shiga-fm/shipper-billing-types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function toPaymentContract(
  draft: ReturnType<typeof buildDefaultPartnerContractDrafts>[number],
  id = "test",
): PartnerPaymentContract {
  const now = new Date().toISOString();
  return { id, ...draft, createdAt: now, updatedAt: now };
}

function defaultBillingContract(): ShipperBillingContract {
  const now = new Date().toISOString();
  return {
    id: "test-billing",
    ...buildDefaultShipperBillingDraft("test-shipper", "エフエートラック"),
    createdAt: now,
    updatedAt: now,
  };
}

function main() {
  const drafts = buildDefaultPartnerContractDrafts();
  const billing = defaultBillingContract();
  const junsei = toPaymentContract(
    drafts.find((d) => d.partnerName === "潤生輸送")!,
  );
  const shiga04 = toPaymentContract(
    drafts.find((d) => d.courseId === "SHIGA_04")!,
  );

  const baseOnly = calcContractAmounts(junsei, billing, {
    overtimeHours: 0,
    tollAmount: 0,
  });
  assert(baseOnly.invoiceAmount === 26_950, `invoice ${baseOnly.invoiceAmount}`);
  assert(baseOnly.paymentAmount === 27_500, `payment ${baseOnly.paymentAmount}`);
  assert(baseOnly.grossProfitAmount === -550, `profit ${baseOnly.grossProfitAmount}`);

  const withOt = calcContractAmounts(junsei, billing, {
    overtimeHours: 2,
    tollAmount: 1_000,
  });
  assert(
    withOt.invoiceAmount === Math.round((27_500 + 2_800) * 0.98) + 1_000,
    `invoice ot ${withOt.invoiceAmount}`,
  );
  assert(
    withOt.paymentAmount === 27_500 + 2_800 + 1_000,
    `payment ot ${withOt.paymentAmount}`,
  );

  const shiga04Base = calcContractAmounts(shiga04, billing, {
    overtimeHours: 0,
    tollAmount: 0,
  });
  assert(
    shiga04Base.invoiceAmount === Math.round(25_740 * 0.98),
    `shiga04 invoice ${shiga04Base.invoiceAmount}`,
  );
  assert(shiga04Base.paymentAmount === 25_740, "shiga04 payment");

  const alloc1 = allocatePerUnitAmounts(3, 900, 3, 1);
  const alloc2 = allocatePerUnitAmounts(3, 900, 3, 2);
  const alloc3 = allocatePerUnitAmounts(3, 900, 3, 3);
  assert(
    Math.abs(alloc1.overtimeHours + alloc2.overtimeHours + alloc3.overtimeHours - 3) <
      0.01,
    "overtime split",
  );
  assert(alloc1.tollAmount + alloc2.tollAmount + alloc3.tollAmount === 900, "toll split");

  const contracts: PartnerPaymentContract[] = [
    {
      ...junsei,
      id: "old",
      baseUnitPrice: 26_000,
      effectiveFrom: "2020-01-01",
      effectiveTo: "2025-12-31",
    },
    {
      ...junsei,
      id: "new",
      baseUnitPrice: 28_000,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    },
  ];
  const resolved2025 = resolvePartnerPaymentContract(contracts, {
    partnerName: "潤生輸送",
    courseId: "SHIGA_02",
    businessDate: "2025-06-01",
  });
  assert(resolved2025?.baseUnitPrice === 26_000, "history 2025");

  const resolved2026 = resolvePartnerPaymentContract(contracts, {
    partnerName: "潤生輸送",
    courseId: "SHIGA_02",
    businessDate: "2026-06-01",
  });
  assert(resolved2026?.baseUnitPrice === 28_000, "history 2026");

  const default04 = resolvePartnerPaymentContract([shiga04], {
    courseId: "SHIGA_04",
    businessDate: "2026-04-28",
  });
  assert(default04?.baseUnitPrice === 25_740, "default shiga04");

  console.log("OK partner contract calc", {
    junseiBase: baseOnly,
    junseiOt: withOt,
    shiga04: shiga04Base,
  });
}

main();
