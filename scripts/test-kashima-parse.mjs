import { readFileSync } from "fs";

const pdfPath =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/ガソリン代/13340-01-20260520-株式会社　カンサイロジック.pdf";
const text = readFileSync(pdfPath, "utf8");

function normalizeFuelText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u3000/g, " ")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[￥¥]/g, "")
    .replace(/^-- \d+ of \d+ --$/gm, "");
}

function parseAmount(s) {
  return Number(String(s).replace(/[^\d]/g, "")) || 0;
}

const normalized = normalizeFuelText(text);
const lines = normalized.split("\n");

const vehicles = new Map();
let currentShaban = null;
let pendingAmount = null;

for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;

  // 給油明細: 伝票NO 日付 単価 金額 車番 カード 軽油 数量
  const fuel = line.match(
    /^\d+\s+\d{2}\/\d{2}\s+[\d.]+\s+([\d,]+)\s+(\d{4})\s+\d{5}\s+軽油/,
  );
  if (fuel) {
    currentShaban = fuel[2];
    continue;
  }

  const onlyAmount = line.match(/^([\d,]+)$/);
  if (onlyAmount) pendingAmount = parseAmount(onlyAmount[1]);

  if (/車番計/.test(line)) {
    const m1 = line.match(/^([\d,]+)\s+\*+\s*車番計/);
    const m2 = line.match(/([\d,]+)\s+\*+\s*車番計/);
    const amt = m1 ? parseAmount(m1[1]) : m2 ? parseAmount(m2[1]) : pendingAmount;
    if (currentShaban && amt > 0) {
      vehicles.set(currentShaban, amt);
    }
    currentShaban = null;
    pendingAmount = null;
  }
}

console.log("vehicles:", vehicles.size);
for (const [k, v] of [...vehicles.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`車番：${k}\n車番計：${v}`);
}
console.log("total:", [...vehicles.values()].reduce((a, b) => a + b, 0));
