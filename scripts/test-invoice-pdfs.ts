/**
 * 実請求書PDFのネイティブテキスト抽出 + OCRパース検証
 */
import * as fs from "fs";
import * as path from "path";
import { parseMaintenanceBillOcr } from "../src/lib/maintenance-bill-ocr-summary";
import { parseBillText } from "../src/lib/maintenance-bill-parser";

const pdfs = [
  "c:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/整備請求書/doc13693020260608155703.pdf",
  "c:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/整備請求書/doc13693120260608155715.pdf",
  "c:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/整備請求書/doc13694120260608162528.pdf",
];

async function extractNativeText(filePath: string): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const parts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const items = tc.items.filter((x): x is { str: string } => "str" in x);
    parts.push(items.map((x) => x.str).join(" "));
  }
  return parts.join("\n");
}

async function main() {
  for (const p of pdfs) {
    const name = path.basename(p);
    console.log(`\n=== ${name} ===`);
    if (!fs.existsSync(p)) {
      console.log("  SKIP: file not found");
      continue;
    }

    const text = await extractNativeText(p);
    console.log(`  text length: ${text.length}`);
    console.log(`  preview: ${text.slice(0, 400).replace(/\s+/g, " ")}`);

    const parsed = parseBillText(text);
    const billType = parsed.billType ?? "その他";
    const result = parseMaintenanceBillOcr(text, billType, parsed);

    console.log(`  vendor: ${parsed.vendorName ?? "(unknown)"}`);
    console.log(`  hasData: ${result.hasData}`);
    console.log(`  vehicles: ${result.vehicles.length}`);

    // .map がクラッシュしないこと
    result.vehicles.map((v) => ({
      plate: v.vehicleNumber ?? "",
      base: v.laborFee + v.partsFee,
      tax: v.consumptionTax,
    }));

    for (const v of result.vehicles.slice(0, 3)) {
      console.log(
        `    - ${v.vehicleNumber} | ${v.maintenanceType} | ${v.laborFee + v.partsFee} + ${v.consumptionTax}`,
      );
    }
  }
  console.log("\ntest-invoice-pdfs: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
