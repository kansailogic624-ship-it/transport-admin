/**
 * 燃料代請求書 AI 抽出（車番計ブロック専用・文字起こしのみ）
 */

import { safeNumber } from "./currency-format";
import type { FuelVehicleSummary } from "./fuel-bill-parser";
import { parseAmount } from "./maintenance-bill-parser";

export type FuelAiVehicleRaw = {
  vehicle_code?: string;
  total_quantity?: unknown;
  total_amount?: unknown;
};

export const FUEL_INVOICE_EXTRACTION_PROMPT = `
あなたは有限会社加島様の燃料代請求書を処理するデータ入力担当です。
入力テキストは、PDF各ページから切り出した「車番計」集計ブロックのみです。

【絶対禁止】
- 日次の給油明細を読み取る・推測する・生成すること
- 足し算・引き算・按分・再計算など、いかなる計算もしないこと
- 紙面にない数字を推測・補完すること
- 説明文・Markdown・コードブロック

【やること — 車番計ブロックの文字起こしのみ】
「車番計」という文字を含む行だけを対象に、紙面に書かれている数字をそのまま転記する:

1. vehicle_code
   - 同じブロック内の「車番:」行、または直前の明細ブロックに対応する4桁コード（例: "0600", "9766"）
   - 00101 等の枝番は含めない

2. total_quantity
   - 同じブロックの「***** 軽油税」行にある【数量】の数値（例: 1643.40）
   - 軽油税行が無い場合は 0

3. total_amount
   - 「***** 車番計」行の【金額】数値をそのまま（例: 221202）
   - カンマは除去して数値のみ

4. fuel_tax_rate（請求書全体で1つ）
   - 「***** 軽油税」行の【単価】列（数量と金額の間の数値。例: 32.1 や 15.00）
   - 複数行ある場合は同一単価を転記（異なる場合は最頻値）
   - 紙面に単価が無い場合は null

【返却形式 — JSONのみ】
{
  "vendor_name": "有限会社加島",
  "fuel_tax_rate": 32.1,
  "vehicles": [
    {
      "vehicle_code": "0600",
      "total_quantity": 1643.40,
      "total_amount": 221202
    }
  ]
}
`.trim();

export const FUEL_AI_USER_PREFIX =
  "以下は「車番計」集計ブロックのみを切り出したテキストです。車番計行に書かれた数字をそのまま文字起こししてJSONで返してください。計算は禁止です。\n\n";

function parseFuelNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value ?? "").replace(/,/g, "").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeVehicleCode(raw: string): string {
  const t = raw.trim();
  const four = t.match(/^(\d{4})/);
  if (four) return four[1]!;
  return t;
}

export function normalizeFuelAiVehicle(
  raw: FuelAiVehicleRaw,
): FuelVehicleSummary | null {
  const vehicleCode = normalizeVehicleCode(String(raw.vehicle_code ?? ""));
  const totalQuantity = parseFuelNumber(raw.total_quantity);
  const totalAmount =
    typeof raw.total_amount === "number"
      ? safeNumber(raw.total_amount)
      : parseAmount(String(raw.total_amount ?? ""));

  if (!vehicleCode || totalAmount <= 0) return null;
  if (/車番計|軽油税|入金|合計/i.test(vehicleCode)) return null;

  return { vehicleCode, totalQuantity, totalAmount };
}

/** AI JSON を車番ごとの集計配列に変換 */
export function parseFuelAiResponse(data: unknown): FuelVehicleSummary[] {
  if (!data || typeof data !== "object") return [];

  const obj = data as { vehicles?: unknown; lines?: unknown };
  const rawList = Array.isArray(obj.vehicles)
    ? obj.vehicles
    : Array.isArray(obj.lines)
      ? obj.lines
      : Array.isArray(data)
        ? data
        : [];

  const result: FuelVehicleSummary[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const row = item as FuelAiVehicleRaw & {
      vehicle_number?: string;
      amount?: unknown;
      quantity?: unknown;
    };
    const normalized = normalizeFuelAiVehicle({
      vehicle_code: row.vehicle_code ?? row.vehicle_number,
      total_quantity: row.total_quantity ?? row.quantity,
      total_amount: row.total_amount ?? row.amount,
    });
    if (normalized) result.push(normalized);
  }
  return result;
}
