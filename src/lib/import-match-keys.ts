import { normalizeDriverName } from "./driving-report-parser";

/** 画面表示用（括弧・余分な空白を除去、ハイフンは半角に統一） */
export function displayVehicleNumber(raw: string): string {
  return (raw ?? "")
    .replace(/undefined/gi, "")
    .replace(/[（）()]/g, "")
    .replace(/[\s\u3000]/g, "")
    .replace(/[－ー−‐‑–—]/g, "-")
    .trim();
}

/**
 * 車両番号の表記ゆれを吸収して比較用キーに変換。
 * 括弧・空白・ハイフン（全半角）を除去し、英数字は半角に統一する。
 */
export function normalizeVehicleNumber(raw: string): string {
  return displayVehicleNumber(raw)
    .replace(/-/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .toLowerCase();
}

/** 下4桁が一致すれば同一車両（例: 59-39 ↔ 京都400あ59-39） */
export function isSameVehicle(a: string, b: string): boolean {
  const ta = (a ?? "").trim();
  const tb = (b ?? "").trim();
  if (!ta || !tb) return false;

  const la = extractVehicleLast4(ta);
  const lb = extractVehicleLast4(tb);
  if (la.length >= 4 && lb.length >= 4 && la === lb) return true;

  const na = normalizeVehicleNumber(ta);
  const nb = normalizeVehicleNumber(tb);
  return na.length > 0 && na === nb;
}

/** 末尾4桁の数字列を抽出 */
export function extractVehicleLast4(raw: string): string {
  const digits = extractVehicleDigits(normalizeVehicleNumber(raw));
  if (digits.length < 4) return digits;
  return digits.slice(-4);
}

/** マスタ登録済み車両があればその表記を正とし、なければ表示用に正規化 */
export function resolveVehicleMasterLabel(
  raw: string,
  masterVehicles: string[],
  fallback = "（車両未入力）",
): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;

  const matches = masterVehicles.filter((v) => isSameVehicle(v, trimmed));
  if (matches.length > 0) {
    return matches.reduce((best, cur) => {
      const score = (label: string) =>
        label.length + (/[\u3040-\u9fff]/.test(label) ? 30 : 0);
      return score(cur) > score(best) ? cur : best;
    });
  }

  return displayVehicleNumber(trimmed) || fallback;
}

/**
 * 車両番号から数字のみを抽出する。
 * 「91-44」→「9144」, 「京都9144」→「9144」, 「品川500あ1234」→「5001234」
 * 末尾4桁での照合用に使う。
 */
export function extractVehicleDigits(normalized: string): string {
  return normalized.replace(/[^0-9]/g, "");
}

export function vehiclesMatch(a: string, b: string): boolean {
  if (isSameVehicle(a, b)) return true;

  const na = normalizeVehicleNumber(a);
  const nb = normalizeVehicleNumber(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const da = extractVehicleDigits(na);
  const db = extractVehicleDigits(nb);
  if (da.length >= 3 && db.length >= 3 && da === db) return true;

  return false;
}

/** 社員コード・ドライバーIDの型ゆれを吸収（"001" と 1 を同一視） */
export function normalizeEmployeeId(raw: unknown): string {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

/** 社員IDが両方ある場合のみ厳密比較。どちらか欠けていれば照合を妨げない */
export function employeeIdsMatch(
  a: unknown,
  b: unknown,
): boolean {
  const na = normalizeEmployeeId(a);
  const nb = normalizeEmployeeId(b);
  if (!na || !nb) return true;
  return na === nb;
}

/** 日付文字列を YYYY-MM-DD に正規化（パース不能時は入力をそのまま返す） */
export function normalizeIsoDate(raw: string): string {
  if (!raw?.trim()) return "";
  const parsed = parseIsoDateFromCell(raw.trim());
  if (parsed) return parsed;
  return raw.trim();
}

/** 日付のフォーマット差異（スラッシュ/ハイフン等）を吸収して比較 */
export function datesMatch(a: string, b: string): boolean {
  const na = normalizeIsoDate(a);
  const nb = normalizeIsoDate(b);
  if (!na || !nb) return a.trim() === b.trim();
  return na === nb;
}

/** ドライバー名の表記ゆれ（スペース有無等）を吸収して比較 */
export function driverNamesMatch(a: string, b: string): boolean {
  return normalizeDriverName(a) === normalizeDriverName(b);
}

/** 融合マッチング用キー（日付・運転手・車両） */
export function fusionMatchKey(
  date: string,
  driverName: string,
  vehicleNumber: string,
): string {
  return `${normalizeIsoDate(date)}|${normalizeDriverName(driverName)}|${normalizeVehicleNumber(vehicleNumber)}`;
}

export function parseIsoDateFromCell(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "number" && value > 40000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + value * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const text = String(value).replace(/\u3000/g, " ").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  const slash = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (slash) {
    return `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
  }

  const jp = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (jp) {
    return `${jp[1]}-${jp[2].padStart(2, "0")}-${jp[3].padStart(2, "0")}`;
  }

  return null;
}

/** ファイル名から日付を推定（例: 20260530.xlsx → 2026-05-30） */
export function parseIsoDateFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, "");
  const compact = base.match(/(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?:[^\d]|$)/);
  if (!compact) return null;
  return `${compact[1]}-${compact[2]}-${compact[3]}`;
}

/**
 * FileMaker の出退勤セルを "HH:MM" 文字列に変換する。
 * - 数値（Excel シリアル値の小数部）: 0.354167 → "08:30"
 * - 文字列 "08:30" / "8:30" そのまま
 * - 日時文字列 "2026/05/01 08:30" の時刻部分を抽出
 */
export function parseTimecardTimeCell(value: unknown): string {
  if (value == null || value === "") return "";

  // Excel 時刻シリアル値（0〜1 の小数、または 日付+時刻の小数部）
  if (typeof value === "number") {
    const fraction = value - Math.floor(value);
    const totalMinutes = Math.round(fraction * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    if (h === 0 && m === 0 && fraction < 0.0001) return "";
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const s = String(value).trim();

  // "HH:MM" / "H:MM"
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    return `${hm[1]!.padStart(2, "0")}:${hm[2]}`;
  }

  // 日時文字列 "2026/05/01 08:30" などから時刻部分を抽出
  const dt = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (dt) {
    return `${dt[1]!.padStart(2, "0")}:${dt[2]}`;
  }

  return "";
}
