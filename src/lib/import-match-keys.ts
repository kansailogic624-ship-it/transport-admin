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

  if (pureVehicleDigitsMatch(ta, tb)) return true;

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

/** 数字列の先頭ゼロを除去（0600→600） */
export function stripLeadingZerosDigits(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (!d) return "";
  const stripped = d.replace(/^0+/, "");
  return stripped || "0";
}

/** 全角数字・英字を半角に変換 */
export function toHalfWidthAlnum(raw: string): string {
  return (raw ?? "").replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

/**
 * 照合用の純粋半角数字キー。
 * 「京都400あ・６００」も「0600」も「600」もすべて「600」に正規化する。
 */
export function extractPureVehicleDigits(raw: string): string {
  let text = toHalfWidthAlnum((raw ?? "").trim());
  if (!text) return "";

  const dotParts = text.split(/[・･]/);
  if (dotParts.length > 1) {
    text = dotParts[dotParts.length - 1]!;
  } else {
    const internal = text.match(/(\d{2,3})-(\d{1,4})\s*$/);
    if (internal) {
      text = `${internal[1]}${internal[2]}`;
    } else {
      text = text
        .replace(/[・･\s\u3000()（）]/g, "")
        .replace(/[－ー−‐‑–—-]/g, "")
        .replace(/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/g, "")
        .replace(/[a-zA-Z]/g, "");
    }
  }

  const digits = text.replace(/[^0-9]/g, "");
  return stripLeadingZerosDigits(digits);
}

/** 短い数字コード（AI抽出・カードNo.）かどうか */
export function isShortVehicleDigitCode(raw: string): boolean {
  const text = (raw ?? "").trim();
  if (!text || /[\u3040-\u9fff]/.test(text)) return false;
  const digits = text.replace(/\D/g, "");
  return digits.length > 0 && digits.length <= 4;
}

/** 純数字キーが完全一致すれば同一車両（600≠6000 を誤マッチしない） */
export function pureVehicleDigitsMatch(a: string, b: string): boolean {
  const pa = extractPureVehicleDigits(a);
  const pb = extractPureVehicleDigits(b);
  return Boolean(pa && pb && pa === pb);
}

/**
 * 車両照合用インデックスキー集合。
 * ハイフン除去・全半角統一・先頭0除去・4桁カード(0600→60-00)候補を含む。
 */
export function buildVehicleIndexKeys(raw: string): string[] {
  const keys = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) keys.add(t);
  };

  const pure = extractPureVehicleDigits(raw);
  if (pure) {
    add(pure);
    add(pure.padStart(4, "0"));
  }

  const norm = normalizeVehicleNumber(raw);
  add(norm);

  if (/[・･]/.test(raw)) {
    return [...keys];
  }

  const digits = extractVehicleDigits(norm);
  if (!digits) return [...keys];

  add(digits);
  add(stripLeadingZerosDigits(digits));

  const digitVariants = new Set<string>([
    digits,
    digits.padStart(4, "0"),
  ]);
  if (digits.length === 3) digitVariants.add(`${digits}0`);

  for (const d of digitVariants) {
    const d4 = d.padStart(4, "0").slice(-4);
    const head = d4.slice(0, 2);
    const tail = d4.slice(2, 4);
    add(d4);
    add(head + tail);
    add(stripLeadingZerosDigits(d4));
    add(stripLeadingZerosDigits(head) + stripLeadingZerosDigits(tail));
    add(`${head}-${tail}`);
    add(`${stripLeadingZerosDigits(head)}-${stripLeadingZerosDigits(tail)}`);
  }

  for (const h of hyphenCodeCandidatesFromDigits(digits)) {
    add(normalizeVehicleNumber(h));
    add(stripLeadingZerosDigits(extractVehicleDigits(normalizeVehicleNumber(h))));
  }
  for (const h of hyphenCodeCandidatesFromDigits(digits.padStart(4, "0"))) {
    add(normalizeVehicleNumber(h));
  }

  return [...keys];
}

/** 数字のみ入力からハイフン付き社内コード候補（600→60-0, 0600→06-00/60-00） */
export function hyphenCodeCandidatesFromDigits(digits: string): string[] {
  const d = digits.replace(/\D/g, "");
  if (d.length < 3) return [];
  const out: string[] = [];
  if (d.length === 3) {
    out.push(`${d.slice(0, 2)}-${d.slice(2)}`);
    const p4 = d.padStart(4, "0");
    out.push(`${p4.slice(0, 2)}-${p4.slice(2)}`);
    const d4 = `${d}0`;
    out.push(`${d4.slice(0, 2)}-${d4.slice(2)}`);
  }
  if (d.length === 4) {
    out.push(`${d.slice(0, 2)}-${d.slice(2)}`);
  }
  if (d.length === 5) {
    out.push(`${d.slice(0, 2)}-${d.slice(2)}`);
    out.push(`${d.slice(0, 3)}-${d.slice(3)}`);
  }
  if (d.length === 6) {
    out.push(`${d.slice(0, 3)}-${d.slice(3)}`);
  }
  return [...new Set(out)];
}

/** インデックスキー同士の一致（完全一致・末尾一致で 600↔6000 を許容） */
export function vehicleIndexKeysOverlap(a: string, b: string): boolean {
  if (pureVehicleDigitsMatch(a, b)) return true;

  const ka = buildVehicleIndexKeys(a);
  const kb = buildVehicleIndexKeys(b);
  const allowSuffix =
    isShortVehicleDigitCode(a) || isShortVehicleDigitCode(b);

  for (const x of ka) {
    for (const y of kb) {
      if (x === y) return true;
      if (
        allowSuffix &&
        x.length >= 2 &&
        y.length >= 2 &&
        (x.endsWith(y) || y.endsWith(x))
      ) {
        return true;
      }
    }
  }
  return false;
}

/** 車両番号のソート用数値（社内コード XX-YY → XX*10000+YY、中黒形式は純数字） */
export function extractVehiclePlateSortNumber(raw: string): number {
  const text = toHalfWidthAlnum((raw ?? "").trim());
  if (/[・･]/.test(text)) {
    return parseInt(extractPureVehicleDigits(raw), 10) || 0;
  }

  const dashAll = [...text.matchAll(/(\d{2,3})-(\d{1,4})/g)];
  if (dashAll.length > 0) {
    const last = dashAll[dashAll.length - 1]!;
    return (
      parseInt(last[1]!, 10) * 10000 + parseInt(last[2]!, 10)
    );
  }

  return parseInt(extractPureVehicleDigits(raw), 10) || 0;
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
  if (pureVehicleDigitsMatch(a, b)) return true;
  if (isSameVehicle(a, b)) return true;

  const na = normalizeVehicleNumber(a);
  const nb = normalizeVehicleNumber(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const da = extractVehicleDigits(na);
  const db = extractVehicleDigits(nb);
  if (da && db && da === db) return true;

  if (na.includes(nb) || nb.includes(na)) {
    if (/^\d+$/.test(da) && /^\d+$/.test(db)) {
      const short = da.length <= db.length ? da : db;
      const long = da.length <= db.length ? db : da;
      if (short.length < 4 && long.includes(short)) {
        // 60⊂6030, 600⊂6030 等の誤マッチを防ぐ
      } else {
        return true;
      }
    } else {
      return true;
    }
  }

  if (da.length >= 3 && db.length >= 3 && da === db) return true;

  if (vehicleIndexKeysOverlap(a, b)) return true;

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

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 日付文字列を YYYY-MM-DD に正規化（時刻・タイムゾーンは捨てる） */
export function normalizeIsoDate(raw: string): string {
  if (!raw?.trim()) return "";
  const trimmed = raw.trim();

  const isoDateTime = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:T|\s)/);
  if (isoDateTime) return isoDateTime[1]!;

  const parsed = parseIsoDateFromCell(trimmed);
  if (parsed) return parsed;

  const slashPrefix = trimmed.match(
    /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
  );
  if (slashPrefix) {
    return `${slashPrefix[1]}-${slashPrefix[2]!.padStart(2, "0")}-${slashPrefix[3]!.padStart(2, "0")}`;
  }

  return trimmed;
}

/** 日付のフォーマット差異を吸収し、YYYY-MM-DD 文字列同士だけで比較 */
export function datesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeIsoDate(a ?? "");
  const nb = normalizeIsoDate(b ?? "");
  if (!ISO_DATE_ONLY_RE.test(na) || !ISO_DATE_ONLY_RE.test(nb)) return false;
  return na === nb;
}

/**
 * ドライバー名のあいまい照合。
 * 空白除去後の完全一致に加え、苗字のみ／フルネームの差（山崎 ↔ 山崎太郎）を吸収する。
 */
export function driverNamesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeDriverName(a);
  const nb = normalizeDriverName(b);
  if (!na || !nb) return na === nb;
  if (na === nb) return true;

  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length < 2) return false;

  return longer.startsWith(shorter) || longer.includes(shorter);
}

/** 融合マッチング用キー（日付・運転手・車両） */
export function fusionMatchKey(
  date: string,
  driverName: string,
  vehicleNumber: string,
): string {
  return `${normalizeIsoDate(date)}|${normalizeDriverName(driverName)}|${normalizeVehicleNumber(vehicleNumber)}`;
}

/** Excel日付シリアル（例: 45819）→ YYYY-MM-DD */
export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 30000 || serial > 60000) {
    return null;
  }
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 数値または5桁の数値文字列を Excel シリアル日付として解釈 */
export function tryExcelSerialFromUnknown(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToIsoDate(value);
  }
  const text = String(value ?? "").trim();
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    return excelSerialToIsoDate(parseFloat(text));
  }
  return null;
}

export function parseIsoDateFromCell(value: unknown): string | null {
  if (value == null || value === "") return null;

  const serialIso = tryExcelSerialFromUnknown(value);
  if (serialIso) return serialIso;

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
