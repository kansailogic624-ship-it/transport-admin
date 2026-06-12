import {
  computeRowTaxBreakdown,
  computeVehicleRowTotal,
  inferMaintenanceTypeFromText,
  inferTaxFromInclusiveTotal,
  parseBillText,
  parseVehicleTable,
  resolveBillTaxBreakdown,
} from "../src/lib/maintenance-bill-parser";

function safeNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const daisabuSample = `
株式会社ダイサブ
株式会社カンサイロジック 御中
明細請求書
御請求額 ¥333,431
請求年月日 R 8. 5. 31
発行年月日 R 8. 6. 2
整備費用請求小計 286,341
諸費用請求小計 47,090
整備費用
今回売上金額 260,310
消費税 26,031
諸費用
今回売上金額 46,090
消費税 1,000
京都 101 あ 600 FK 一般整備
京都 100 い 9821 Forward 一般整備
登録番号: 38-12
`;

const parsed = parseBillText(daisabuSample);
if (safeNumber(parsed.totalAmount) !== 333431) {
  throw new Error(`total expected 333431 got ${parsed.totalAmount}`);
}
const exTax =
  safeNumber(parsed.maintenanceSubtotalExTax) +
  safeNumber(parsed.expensesSubtotal);
if (exTax !== 306400) {
  throw new Error(`exTax expected 306400 got ${exTax}`);
}
if (safeNumber(parsed.taxAmount) !== 27031) {
  throw new Error(`tax expected 27031 got ${parsed.taxAmount}`);
}

const inferredOnly = resolveBillTaxBreakdown({ totalAmount: 333431 });
if (!inferredOnly.taxInferred) {
  throw new Error("expected taxInferred for total-only input");
}
const { exTax: iEx, tax: iTax } = inferTaxFromInclusiveTotal(333431);
if (iEx + iTax !== 333431) {
  throw new Error("infer split should sum to total");
}

const exTaxRow = computeRowTaxBreakdown(10000, 0, 0, "ex_tax");
if (exTaxRow.totalIncl !== 11000) {
  throw new Error(`ex_tax row expected 11000 got ${exTaxRow.totalIncl}`);
}
const inclRow = computeRowTaxBreakdown(11000, 0, 0, "incl_tax");
if (inclRow.totalIncl !== 11000) {
  throw new Error(`incl_tax row expected 11000 got ${inclRow.totalIncl}`);
}
const exemptRow = computeRowTaxBreakdown(0, 0, 5000, "exempt");
if (exemptRow.totalIncl !== 5000 || exemptRow.tax !== 0) {
  throw new Error("exempt row should have no tax");
}

const daisabuVehicles = parseVehicleTable(daisabuSample, "整備費");
if (daisabuVehicles.length < 2) {
  throw new Error(`expected multiple daisabu vehicles got ${daisabuVehicles.length}`);
}
if (daisabuVehicles[0]!.taxCategory !== "ex_tax") {
  throw new Error("daisabu should default ex_tax");
}

const yasuiSample = `
安井自動車
工賃部品計（税込）
京都100き1577 3カ月点検 88000 43030
`;
const yasuiVehicles = parseVehicleTable(yasuiSample, "一括");
if (yasuiVehicles.length === 0) {
  throw new Error("yasui vehicles not parsed");
}

const shakenTotal = computeVehicleRowTotal({
  laborFee: 123090,
  partsFee: 0,
  commonExpense: 0,
  consumptionTax: 8700,
  taxCategory: "ex_tax",
});
if (shakenTotal !== 131790) {
  throw new Error(`shaken total expected 131790 got ${shakenTotal}`);
}

const autoTaxTotal = computeVehicleRowTotal({
  laborFee: 12000,
  partsFee: 0,
  commonExpense: 0,
  taxCategory: "ex_tax",
});
if (autoTaxTotal !== 13200) {
  throw new Error(`auto tax total expected 13200 got ${autoTaxTotal}`);
}

if (inferMaintenanceTypeFromText("車検 京都400あ5288 デュトロ") !== "車検") {
  throw new Error("expected 車検 maintenance type");
}
if (inferMaintenanceTypeFromText("法定 ３ヶ月点検") !== "3か月点検（法定）") {
  throw new Error("expected 3か月点検（法定） maintenance type");
}
if (inferMaintenanceTypeFromText("一般整備") !== "一般整備") {
  throw new Error("expected 一般整備 maintenance type");
}

const shakenSample = `
株式会社ダイサブ
R 8. 5.29 000101384 車検 京都 400あ5288 デュトロ 123,090 8,700
`;
const shakenVehicles = parseVehicleTable(shakenSample, "整備費");
if (shakenVehicles.length === 0) {
  throw new Error("shaken vehicle not parsed");
}
const shakenRow = shakenVehicles[0]!;
if (shakenRow.maintenanceType !== "車検") {
  throw new Error(`shaken maintenanceType expected 車検 got ${shakenRow.maintenanceType}`);
}
if (safeNumber(shakenRow.consumptionTax) !== 8700) {
  throw new Error(`shaken consumptionTax expected 8700 got ${shakenRow.consumptionTax}`);
}
if (safeNumber(shakenRow.totalAmount) !== 131790) {
  throw new Error(`shaken row total expected 131790 got ${shakenRow.totalAmount}`);
}

console.log("test-maintenance-bill-parser: OK");
console.log("  parsed total:", parsed.totalAmount);
console.log("  exTax:", exTax, "tax:", parsed.taxAmount);
console.log("  daisabu vehicles:", daisabuVehicles.length);
console.log("  yasui vehicles:", yasuiVehicles.length);
