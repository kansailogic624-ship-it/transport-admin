import {
  buildVehicleRowsFromBillSummary,
  extractOcrBillSummary,
  parseMaintenanceBillOcr,
} from "../src/lib/maintenance-bill-ocr-summary";
import {
  extractVehicleLinesFromPdfText,
  parseInvoiceFromPdfText,
} from "../src/lib/invoice-text-extractor";
import {
  computeAmountsFromExtractedLine,
  mapNormalizedInvoiceLine,
  normalizeInvoiceLines,
  parseAiResponseToVehicleEntries,
  parseInvoiceOcrResponse,
  parseTaxType,
  toNumber,
} from "../src/lib/invoice-ocr-normalize";
import {
  isValidInvoiceVehicleNumber,
  parseBillText,
} from "../src/lib/maintenance-bill-parser";
import { isKashimaBillText } from "../src/lib/fuel-bill-parser";
import { safeNumber } from "../src/lib/currency-format";

// --- normalizeInvoiceLines 防御テスト ---
const cases: { name: string; input: unknown; expectLen: number }[] = [
  { name: "undefined", input: undefined, expectLen: 0 },
  { name: "null", input: null, expectLen: 0 },
  { name: "empty object", input: {}, expectLen: 1 },
  { name: "single object", input: { vehicle_number: "41-79", base_amount: 1000 }, expectLen: 1 },
  { name: "array", input: [{ vehicle_number: "a" }, { vehicle_number: "b" }], expectLen: 2 },
  { name: "data single", input: { data: { vehicle_number: "38-12" } }, expectLen: 1 },
  { name: "lines array", input: { lines: [{ vehicle_number: "x" }] }, expectLen: 1 },
  { name: "items array", input: { items: [{ vehicleNo: "y" }] }, expectLen: 1 },
  { name: "no data/lines", input: { vendor_name: "安井" }, expectLen: 1 },
];

for (const c of cases) {
  const lines = normalizeInvoiceLines(c.input);
  if (c.name === "no data/lines" && lines.length !== 1) {
    throw new Error(`${c.name}: expected 1 got ${lines.length}`);
  } else if (c.name !== "no data/lines" && lines.length !== c.expectLen) {
    throw new Error(`${c.name}: expected ${c.expectLen} got ${lines.length}`);
  }
}

// map は必ずクラッシュしない
normalizeInvoiceLines(undefined).map((line) => mapNormalizedInvoiceLine(line));
normalizeInvoiceLines({ data: { vehicle_number: "1" } }).map((line) =>
  mapNormalizedInvoiceLine(line),
);

const partial = mapNormalizedInvoiceLine({});
if (
  partial.vehicle_number !== "" ||
  partial.repair_type !== "" ||
  partial.base_amount !== 0 ||
  partial.tax_amount !== 0 ||
  partial.total_amount !== 0
) {
  throw new Error("partial defaults failed");
}

if (toNumber("86,774円") !== 86774) {
  throw new Error("toNumber comma yen failed");
}

const aiWrapped = parseInvoiceOcrResponse({
  vendor_name: "ダイサブ",
  invoice_total: 333431,
  lines: [
    {
      vehicle_number: "京都400あ5288",
      repair_type: "車検",
      base_amount: "260,310",
      tax_amount: "26,031",
      total_amount: 286341,
    },
  ],
});
if (aiWrapped.length !== 1 || aiWrapped[0]!.base_amount !== 260310) {
  throw new Error("AI wrapped parse failed");
}

// --- 加島宛名の整備請求書は燃料代と誤判定しない ---
const yasuiWithKashimaClient = `
安井自動車
有限会社加島 御中
工賃部品計（税込）
京都100き1577 3カ月点検 88000 43030
`;
if (isKashimaBillText(yasuiWithKashimaClient)) {
  throw new Error("安井+加島御中 should not be kashima fuel bill");
}

// --- 安井自動車（単一） ---
const yasuiSample = `
安井自動車
工賃部品計（税込）
登録番号: 38-12
京都100き1577 3カ月点検 88000 43030
今回売上金額 119118
消費税 11912
`;

// --- 安井自動車（複数台: 1577 / 5939 / 5936） ---
const yasuiMultiSample = `
安井自動車
有限会社加島 御中
工賃部品計（税込）
京都100き1577 車検 88000 43030
京都100き5939 3カ月点検 55000 28000
京都100き5936 一般整備 32000 16000
今回売上金額 250000
消費税 25000
`;
const yasuiMultiParsed = parseBillText(yasuiMultiSample);
const yasuiMultiOcr = parseMaintenanceBillOcr(
  yasuiMultiSample,
  "一括",
  yasuiMultiParsed,
);
if (yasuiMultiOcr.vehicles.length !== 3) {
  throw new Error(
    `yasui multi expected 3 vehicles got ${yasuiMultiOcr.vehicles.length}`,
  );
}
const multiPlates = yasuiMultiOcr.vehicles.map((v) => v.vehicleNumber);
if (
  !multiPlates.some((p) => p.includes("1577")) ||
  !multiPlates.some((p) => p.includes("5939")) ||
  !multiPlates.some((p) => p.includes("5936"))
) {
  throw new Error(`yasui multi plates missing: ${multiPlates.join(", ")}`);
}
if (isKashimaBillText(yasuiMultiSample)) {
  throw new Error("yasui multi must not trigger kashima detection");
}

const yasuiParsed = parseBillText(yasuiSample);
const yasuiOcr = parseMaintenanceBillOcr(yasuiSample, "一括", yasuiParsed);
if (!yasuiOcr.hasData || yasuiOcr.vehicles.length !== 1) {
  throw new Error(`yasui expected 1 vehicle got ${yasuiOcr.vehicles.length}`);
}
const yr = yasuiOcr.vehicles[0]!;
if (yr.maintenanceType !== "3か月点検（法定）") {
  throw new Error(`yasui maintenance type ${yr.maintenanceType}`);
}
const yasuiBase = toNumber(yr.laborFee) + toNumber(yr.partsFee);
if (yasuiBase <= 0) {
  throw new Error("yasui base_amount missing");
}
if (yasuiBase < 50000) {
  throw new Error(`yasui base should be ~80000 not ${yasuiBase}`);
}

// --- ダイサブ ---
const daisabuSample = `
株式会社ダイサブ
登録番号: 38-12
御請求額 ¥333,431
整備費用請求小計 286,341
今回売上金額 260,310
消費税 26,031
諸費用
今回売上金額 46,090
消費税 1,000
R 8. 5.29 車検 京都 400あ5288 123,090 8,700
`;

const daisabuParsed = parseBillText(daisabuSample);
const daisabuOcr = parseMaintenanceBillOcr(daisabuSample, "整備費", daisabuParsed);
if (!daisabuOcr.hasData || daisabuOcr.vehicles.length !== 1) {
  throw new Error(`daisabu expected 1 vehicle got ${daisabuOcr.vehicles.length}`);
}
const dr = daisabuOcr.vehicles[0]!;
if (dr.maintenanceType !== "車検") {
  throw new Error(`daisabu maintenance ${dr.maintenanceType}`);
}

// --- 三菱ふそう ---
const fusoSample = `
三菱ふそうトラック・バス株式会社
登録番号: 41-79
京都101あ1234 一般整備
請求金額（税抜） 85,000
消費税 8,500
御請求額 93,500
`;

const fusoParsed = parseBillText(fusoSample);
const fusoOcr = parseMaintenanceBillOcr(
  fusoSample,
  fusoParsed.billType ?? "一括",
  fusoParsed,
  {
    vendor_name: "三菱ふそうトラック・バス株式会社",
    invoice_total: 93500,
    lines: [{ vehicle_number: "41-79", repair_type: "一般整備", base_amount: 85000, tax_amount: 8500 }],
  },
);
if (!fusoOcr.hasData) throw new Error("fuso no data");
const fr = fusoOcr.vehicles[0]!;
if (fr.maintenanceType !== "一般整備") {
  throw new Error(`fuso maintenance ${fr.maintenanceType}`);
}
if (toNumber(fr.laborFee) + toNumber(fr.partsFee) !== 85000) {
  throw new Error(`fuso base ${fr.laborFee}`);
}

// buildVehicleRowsFromBillSummary は常に配列を返す
const fallbackRows = buildVehicleRowsFromBillSummary("", "その他");
if (!Array.isArray(fallbackRows)) {
  throw new Error("buildVehicleRows must return array");
}
fallbackRows.map((r) => r.vehicleNumber ?? "");

const summary = extractOcrBillSummary(yasuiSample, yasuiParsed);
if (!summary.vehicle_number && summary.base_amount <= 0) {
  throw new Error("yasui summary empty");
}

// --- 加島宛名 + 複数登録番号（合体バグ再現防止） ---
const multiVehicleSample = `
株式会社ダイサブ
有限会社加島 御中
登録番号: 34-88
34-88 一般整備 50000 5000
登録番号: 41-79
41-79 車検 80000 8000
`;

const multiParsed = parseBillText(multiVehicleSample);
const multiOcr = parseMaintenanceBillOcr(multiVehicleSample, "整備費", multiParsed);
if (multiOcr.vehicles.length !== 2) {
  throw new Error(
    `multi-vehicle expected 2 rows got ${multiOcr.vehicles.length}`,
  );
}
for (const v of multiOcr.vehicles) {
  if (!isValidInvoiceVehicleNumber(v.vehicleNumber)) {
    throw new Error(`invalid plate in multi: ${v.vehicleNumber}`);
  }
  if (/加島/.test(v.vehicleNumber)) {
    throw new Error("加島 must not appear as vehicle number");
  }
}
const m34 = multiOcr.vehicles.find((v) => v.vehicleNumber.includes("34"));
const m79 = multiOcr.vehicles.find((v) => v.vehicleNumber.includes("41"));
if (!m34 || toNumber(m34.laborFee) !== 50000) {
  throw new Error("34-88 amounts wrong");
}
if (!m79 || toNumber(m79.laborFee) !== 80000) {
  throw new Error("41-79 amounts wrong");
}
const plates = multiOcr.vehicles.map((v) => v.vehicleNumber).sort();
if (!plates.some((p) => p.includes("34") && p.includes("88"))) {
  throw new Error(`missing 34-88 in ${plates.join(",")}`);
}
if (!plates.some((p) => p.includes("41") && p.includes("79"))) {
  throw new Error(`missing 41-79 in ${plates.join(",")}`);
}
const totalBase = multiOcr.vehicles.reduce(
  (s, v) => s + toNumber(v.laborFee) + toNumber(v.partsFee),
  0,
);
if (totalBase !== 130000) {
  throw new Error(`multi base should be 130000 not ${totalBase}`);
}

// AIレスポンスでも異なる車両をマージしない
const aiMulti = parseInvoiceOcrResponse({
  vendor_name: "ダイサブ",
  lines: [
    { vehicle_number: "34-88", repair_type: "一般整備", base_amount: 50000, tax_amount: 5000 },
    { vehicle_number: "41-79", repair_type: "車検", base_amount: 80000, tax_amount: 8000 },
    { vehicle_number: "加島", repair_type: "", base_amount: 130000, tax_amount: 13000 },
  ],
});
if (aiMulti.length !== 2) {
  throw new Error(`AI multi filter expected 2 got ${aiMulti.length}`);
}

// --- テキストベース抽出（主軸） ---
const textLines = extractVehicleLinesFromPdfText(yasuiMultiSample);
if (textLines.length !== 3) {
  throw new Error(`text extract multi expected 3 got ${textLines.length}`);
}
const textParse = parseInvoiceFromPdfText(yasuiMultiSample, "一括");
if (textParse.vehicles.length !== 3) {
  throw new Error(
    `text parse multi expected 3 got ${textParse.vehicles.length}`,
  );
}
const yasuiOcrMode = parseMaintenanceBillOcr(yasuiMultiSample, "一括", yasuiMultiParsed);
if (yasuiOcrMode.extractionMode !== "text") {
  throw new Error(`expected text mode got ${yasuiOcrMode.extractionMode}`);
}

// --- AI JSON + フロント計算 ---
if (parseTaxType("税込") !== "税込") throw new Error("parseTaxType incl");
const inclAmounts = computeAmountsFromExtractedLine(
  { vehicle_number: "京都100き1577", repair_type: "車検", amount_text: "88,000", tax_type: "税込" },
  "一括",
);
if (inclAmounts.labor_fee !== 80000) {
  throw new Error(`incl split labor ${inclAmounts.labor_fee}`);
}
const aiEntries = parseAiResponseToVehicleEntries(
  {
    vendor_name: "安井自動車",
    lines: [
      { vehicle_number: "京都100き1577", repair_type: "車検", amount_text: "88,000", tax_type: "税込", common_text: "43,030" },
    ],
  },
  "一括",
);
if (aiEntries.length !== 1 || safeNumber(aiEntries[0]!.laborFee) < 50000) {
  throw new Error("parseAiResponseToVehicleEntries failed");
}

// normalizeInvoiceLines は undefined でも map 可能
(normalizeInvoiceLines(undefined) ?? []).map((l) => mapNormalizedInvoiceLine(l));

console.log("test-ocr-bill-summary: OK");
console.log("  yasui:", yr.vehicleNumber, yr.laborFee, yr.consumptionTax);
console.log("  daisabu:", dr.vehicleNumber, dr.laborFee, dr.consumptionTax);
console.log("  fuso:", fr.vehicleNumber, fr.laborFee, fr.consumptionTax);
