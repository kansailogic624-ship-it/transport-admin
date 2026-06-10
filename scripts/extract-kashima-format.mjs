import { readFileSync, writeFileSync } from "fs";

const pdfPath =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/ガソリン代/13340-01-20260520-株式会社　カンサイロジック.pdf";
const text = readFileSync(pdfPath, "utf8");
const lines = text.split(/\r?\n/);

const vehicles = new Map();
let currentKey = null;
let pendingAmount = null;

function parseAmount(s) {
  return Number(String(s).replace(/[^\d]/g, "")) || 0;
}

for (const raw of lines) {
  const line = raw.trim();
  if (!line || /^-- \d+ of \d+ --$/.test(line)) continue;

  const fuel = line.match(/(\d{4})\s+(\d{5})\s+軽油\s+([\d.]+)/);
  if (fuel) {
    currentKey = `${fuel[1]} ${fuel[2]}`;
    const liters = parseFloat(fuel[3]);
    if (!vehicles.has(currentKey)) vehicles.set(currentKey, { liters: 0, amount: 0 });
    vehicles.get(currentKey).liters += liters;
  }

  const onlyNum = line.match(/^([\d,]+)$/);
  if (onlyNum && !line.includes("/")) pendingAmount = parseAmount(onlyNum[1]);

  if (/車番計/.test(line) && currentKey) {
    const m = line.match(/([\d,]+)\s+\*+\s*車番計/);
    const amt = m ? parseAmount(m[1]) : pendingAmount;
    if (amt > 0) {
      if (!vehicles.has(currentKey)) vehicles.set(currentKey, { liters: 0, amount: 0 });
      vehicles.get(currentKey).amount += amt;
    }
    pendingAmount = null;
    currentKey = null;
  }
}

const rows = [...vehicles.entries()]
  .filter(([, v]) => v.amount > 0)
  .sort((a, b) => a[0].localeCompare(b[0], "ja"));

let out = `有限会社加島 燃料代請求書（2026年5月度）\n請求月：2026-05\n\n`;
for (const [key, v] of rows) {
  out += `車番：${key}\n`;
  out += `車番計：${v.liters.toFixed(1)} L / ￥${v.amount.toLocaleString("ja-JP")}\n\n`;
}
out += `合計：￥${rows.reduce((s, [, v]) => s + v.amount, 0).toLocaleString("ja-JP")}\n`;

writeFileSync("scripts/kashima-formatted-output.txt", out, "utf8");
console.log(`vehicles: ${rows.length}`);
console.log(out);
