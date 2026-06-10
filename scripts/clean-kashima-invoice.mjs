/**
 * 加島燃料請求書テキストから伝票NO・給油SS列を除去し、
 * 日付 車番 商品 数量 単価 金額 の並びに整形する。
 */
import { readFileSync, writeFileSync } from "fs";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node clean-kashima-invoice.mjs <input.txt>");
  process.exit(1);
}

const raw = readFileSync(inputPath, "utf8");
const out = [];

for (const line of raw.split(/\r?\n/)) {
  const s = line.trim().replace(/\u3000/g, " ");
  if (!s) continue;
  if (/^-- \d+ of \d+ --$/.test(s)) continue;

  // 給油明細: 伝票NO 日付 単価 金額 車番 カード 軽油 数量
  const fuel = s.match(
    /^(\d+)\s+(\d{2}\/\d{2})\s+([\d.]+)\s+([\d,]+)\s+(\d{4}\s+\d{5})\s+軽油\s+([\d.]+)$/,
  );
  if (fuel) {
    out.push(
      `${fuel[2]} ${fuel[5]} 軽油 ${fuel[6]} ${fuel[3]} ${fuel[4]}`,
    );
    continue;
  }

  // 軽油税行: 単価 金額 ***** 軽油税 数量
  const tax = s.match(
    /^([\d.]+)\s+([\d,]+)\s+\*+\s+軽油税\s+([\d.]+)$/,
  );
  if (tax) {
    out.push(`***** 軽油税 ${tax[3]} ${tax[1]} ${tax[2]}`);
    continue;
  }

  // 車番計行: 金額 ***** 車番計
  const kei = s.match(/^([\d,]+)\s+\*+\s+車番計$/);
  if (kei) {
    out.push(`***** 車番計 ${kei[1]}`);
    continue;
  }
}

process.stdout.write(out.join("\n") + "\n");
writeFileSync(
  new URL("./kashima-cleaned-output.txt", import.meta.url),
  out.join("\n") + "\n",
  "utf8",
);
