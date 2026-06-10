import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";

const pdfPath =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/ガソリン代/13340-01-20260520-株式会社　カンサイロジック.pdf";

const require = createRequire(import.meta.url);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");

async function extractNativeText(filePath) {
  const data = new Uint8Array(readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const pageTexts = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((item) => "str" in item);
    if (items.length === 0) continue;

    const LINE_TOLERANCE = 3;
    const lines = [];
    let currentLineY = null;
    let currentLine = [];

    const sorted = [...items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > LINE_TOLERANCE) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    for (const item of sorted) {
      const y = item.transform[5];
      if (
        currentLineY === null ||
        Math.abs(y - currentLineY) > LINE_TOLERANCE
      ) {
        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [];
        currentLineY = y;
      }
      if (item.str.trim()) currentLine.push(item.str.trim());
    }
    if (currentLine.length > 0) lines.push(currentLine);

    pageTexts.push(lines.map((l) => l.join("\t")).join("\n"));
  }

  return pageTexts.join("\n\n");
}

function cleanLine(line) {
  const s = line.trim().replace(/\u3000/g, " ").replace(/\t+/g, " ");
  if (!s || /^-- \d+ of \d+ --$/.test(s) || /^─/.test(s)) return null;

  // pdfjs形式: 日付 車番 軽油 数量 単価 金額 伝票NO
  const fuelA = s.match(
    /^(\d{2}\/\d{2})\s+(\d{4}\s+\d{5})\s+軽油\s+([\d,.]+)\s+([\d,.]+)\s+([\d,]+)(?:\s+\d+)?$/,
  );
  if (fuelA) {
    return `${fuelA[1]} ${fuelA[2]} 軽油 ${fuelA[3]} ${fuelA[4]} ${fuelA[5]}`;
  }

  // テキスト貼付形式: 伝票NO 日付 単価 金額 車番 軽油 数量
  const fuelB = s.match(
    /^\d+\s+(\d{2}\/\d{2})\s+([\d.]+)\s+([\d,]+)\s+(\d{4}\s+\d{5})\s+軽油\s+([\d.]+)$/,
  );
  if (fuelB) {
    return `${fuelB[1]} ${fuelB[4]} 軽油 ${fuelB[5]} ${fuelB[2]} ${fuelB[3]}`;
  }

  // pdfjs 軽油税: ***** 軽油税 数量 単価 金額
  const taxA = s.match(/^\*+\s+軽油税\s+([\d,.]+)\s+([\d,.]+)\s+([\d,]+)$/);
  if (taxA) {
    return `***** 軽油税 ${taxA[1]} ${taxA[2]} ${taxA[3]}`;
  }

  // テキスト貼付 軽油税: 単価 金額 ***** 軽油税 数量
  const taxB = s.match(/^([\d.]+)\s+([\d,]+)\s+\*+\s+軽油税\s+([\d.]+)$/);
  if (taxB) {
    return `***** 軽油税 ${taxB[3]} ${taxB[1]} ${taxB[2]}`;
  }

  // pdfjs 車番計: ***** 車番計 金額
  const keiA = s.match(/^\*+\s+車番計\s+([\d,]+)$/);
  if (keiA) {
    return `***** 車番計 ${keiA[1]}`;
  }

  // テキスト貼付 車番計: 金額 ***** 車番計
  const keiB = s.match(/^([\d,]+)\s+\*+\s+車番計$/);
  if (keiB) {
    return `***** 車番計 ${keiB[1]}`;
  }

  return null;
}

const raw = await extractNativeText(pdfPath);
writeFileSync(new URL("./kashima-raw-pdfjs.txt", import.meta.url), raw, "utf8");

const out = [];
for (const line of raw.split(/\r?\n/)) {
  const cleaned = cleanLine(line);
  if (cleaned) out.push(cleaned);
}

const output = out.join("\n") + "\n";
writeFileSync(
  new URL("./kashima-cleaned-output.txt", import.meta.url),
  output,
  "utf8",
);
console.log("lines:", out.length);
console.log(out.slice(0, 5).join("\n"));
console.log("...");
console.log(out.slice(-3).join("\n"));
