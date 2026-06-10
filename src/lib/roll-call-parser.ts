import type { SheetMatrix } from "./driving-report-parser";
import { normalizeDriverName } from "./driving-report-parser";

/** 点呼記録簿から抽出した1ドライバー×1日分 */
export type ParsedRollCallEntry = {
  date: string;
  driverName: string;
  employeeId?: string;
  clockIn: string;
  clockOut: string;
  rollCallTime: string;
  vehicleNumber: string;
  hasPreRollCall: boolean;
  hasPostRollCall: boolean;
  sourceSheet?: string;
};

export type RollCallParseResult = {
  entries: ParsedRollCallEntry[];
  warnings: string[];
};

const EXCEL_DATA_START_ROW = 8;
const COL_DRIVER = 0;
const COL_PRE = 1;
const COL_POST = 31;

function cellStr(cell: unknown): string {
  if (cell == null) return "";
  return String(cell).replace(/\r/g, "").trim().replace(/^\ufeff/, "");
}

/** Excel シリアル日付（xlsx が CSV 読込時に日時セルを数値化する） */
function parseExcelSerialDateTime(
  serial: number,
): { date: string; time: string } | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;

  const wholeDays = Math.floor(serial);
  const dayFraction = serial - wholeDays;

  const epochUtc = Date.UTC(1899, 11, 30);
  const d = new Date(epochUtc + wholeDays * 86400 * 1000);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");

  const totalMinutes = Math.round(dayFraction * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const mi = totalMinutes % 60;

  return {
    date: `${y}-${mo}-${day}`,
    time: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`,
  };
}

/** セル値 → 点呼日時（文字列 / Excel数値 / Date 対応） */
export function parseCellAsRollCallDateTime(
  cell: unknown,
  fallbackDate?: string,
): { date: string; time: string } | null {
  if (cell == null || cell === "") return null;

  if (typeof cell === "number") {
    // serial < 1 → 日付なし・時刻のみの Excel シリアル値
    if (cell > 0 && cell < 1) {
      if (!fallbackDate) return null;
      const totalMinutes = Math.round(cell * 24 * 60);
      const h = Math.floor(totalMinutes / 60) % 24;
      const mi = totalMinutes % 60;
      return {
        date: fallbackDate,
        time: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`,
      };
    }
    return parseExcelSerialDateTime(cell);
  }

  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const y = cell.getFullYear();
    const h = String(cell.getHours()).padStart(2, "0");
    const mi = String(cell.getMinutes()).padStart(2, "0");
    const time = `${h}:${mi}`;
    // year < 1950 → Excel の時刻のみセル（1900 年起点エポック日付）
    if (y < 1950) {
      if (!fallbackDate) return null;
      return { date: fallbackDate, time };
    }
    const mo = String(cell.getMonth() + 1).padStart(2, "0");
    const day = String(cell.getDate()).padStart(2, "0");
    return { date: `${y}-${mo}-${day}`, time };
  }

  const raw = cellStr(cell);
  if (!raw) return null;
  // 文字列セルに「予定」が含まれる場合はスケジュール値（未実施）として除外
  if (raw.includes("予定")) return null;
  return parseRollCallDateTime(raw, fallbackDate);
}

/** Shift_JIS CSV テキスト → 二次元配列（クォート・カンマ対応） */
export function parseCsvTextToMatrix(text: string): SheetMatrix {
  const lines = text.split(/\r?\n/).filter((line, i, arr) => {
    if (line.length > 0) return true;
    return i < arr.length - 1;
  });

  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
          continue;
        }
        inQ = !inQ;
        continue;
      }
      if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  });
}

/** シート名から日付（例: 本社_2026-05-01, 2026年5月1日） */
export function dateFromSheetName(sheetName: string): string | null {
  // YYYY-MM-DD
  const m = sheetName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // YYYY/MM/DD or YYYY.MM.DD
  const m2 = sheetName.match(/(\d{4})[\/._](\d{1,2})[\/._](\d{1,2})/);
  if (m2) {
    return `${m2[1]}-${m2[2]!.padStart(2, "0")}-${m2[3]!.padStart(2, "0")}`;
  }
  // 「2026年5月1日」「2026年05月01日」
  const m3 = sheetName.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/);
  if (m3) {
    return `${m3[1]}-${m3[2]!.padStart(2, "0")}-${m3[3]!.padStart(2, "0")}`;
  }
  return null;
}

export function parseDriverCell(raw: string): {
  driverName: string;
  employeeId?: string;
} {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const joined = lines.join(" ");
  const idMatch = joined.match(/\((\d+)\)\s*$/);
  const employeeId = idMatch?.[1];
  let namePart = joined.replace(/\s*\(\d+\)\s*$/, "").trim();
  if (!namePart && lines[0]) namePart = lines[0]!.replace(/\(\d+\)/, "").trim();
  return {
    driverName: normalizeDriverName(namePart.replace(/\s+/g, " ")),
    employeeId,
  };
}

/**
 * 点呼日時の文字列パーサー。以下の形式に対応:
 * - "2026/05/01 20:08" / "2026-05-01 20:08" （年月日 + 時刻）
 * - "20:08" / "6:37"  （時刻のみ — Excel が時刻書式で返す場合。fallbackDate を使用）
 * - "05/01\n20:08"    （月日 + 改行 + 時刻）
 */
export function parseRollCallDateTime(
  raw: string,
  fallbackDate?: string,
): { date: string; time: string } | null {
  const s = raw.replace(/\r/g, "\n").trim();
  if (!s) return null;

  // 「予定」を含む時刻は実施前のスケジュール値（未確定）なので点呼時刻として扱わない
  if (s.includes("予定")) return null;

  // ① 「YYYY/MM/DD HH:MM」または「YYYY-MM-DD HH:MM」
  const oneLine = s.match(
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})/,
  );
  if (oneLine) {
    const [, y, mo, d, h, mi] = oneLine;
    return {
      date: `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`,
      time: `${h!.padStart(2, "0")}:${mi}`,
    };
  }

  // ② 「HH:MM」または「H:MM」のみ（Excel が時刻書式セルを文字列化した場合）
  const timeOnly = s.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly && fallbackDate) {
    return {
      date: fallbackDate,
      time: `${timeOnly[1]!.padStart(2, "0")}:${timeOnly[2]!}`,
    };
  }

  // ③ 「M/D H:MM」または「MM/DD HH:MM」（短い日付＋スペース＋時刻）
  // See-Drive の業務後点呼セルが "05/02 06:37" 形式で出力される場合に対応
  const shortDatetime = s.match(/^(\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (shortDatetime) {
    // fallbackDate がない場合は当年を使用（業務データは常に直近）
    const year = fallbackDate
      ? fallbackDate.slice(0, 4)
      : String(new Date().getFullYear());
    return {
      date: `${year}-${shortDatetime[1]!.padStart(2, "0")}-${shortDatetime[2]!.padStart(2, "0")}`,
      time: `${shortDatetime[3]!.padStart(2, "0")}:${shortDatetime[4]!}`,
    };
  }

  // ⑤ 「MM/DD\nHH:MM\n(車両)」（改行区切り — See-Drive Excel 点呼記録簿の標準形式）
  const lines = s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const md = lines[0]?.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  const hm = lines.find((l) => /^\d{1,2}:\d{2}$/.test(l));
  if (md && hm) {
    // fallbackDate がない場合は当年を使用
    const year = fallbackDate
      ? fallbackDate.slice(0, 4)
      : String(new Date().getFullYear());
    return {
      date: `${year}-${md[1]!.padStart(2, "0")}-${md[2]!.padStart(2, "0")}`,
      time: hm.length === 4 ? `0${hm}` : hm,
    };
  }

  return null;
}

function vehicleFromRollCallBlock(raw: string): string {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^\d{1,2}[\/\-]\d{1,2}$/.test(line)) continue;
    if (/^\d{1,2}:\d{2}$/.test(line)) continue;
    if (/^\d{4}[\/\-]/.test(line)) continue;
    if (line.length >= 4 && /[\u3040-\u9fff\u30a0-\u9fff]/.test(line)) {
      return line.replace(/\s+/g, "");
    }
  }
  return "";
}

function entryFromPrePost(
  driverName: string,
  employeeId: string | undefined,
  preCell: unknown,
  postCell: unknown,
  fallbackDate?: string,
  sourceSheet?: string,
): ParsedRollCallEntry | null {
  if (!driverName) return null;

  const pre = parseCellAsRollCallDateTime(preCell, fallbackDate);
  // post のフォールバック日付: pre の日付 → シートのフォールバック の優先順
  // （夜勤では業務後時刻が時刻のみで記録される場合、業務開始日を使う）
  const postFallback = pre?.date ?? fallbackDate;
  const post = parseCellAsRollCallDateTime(postCell, postFallback);
  if (!pre && !post) return null;

  const date = pre?.date ?? post?.date ?? fallbackDate ?? "";
  if (!date) return null;

  const clockIn = pre?.time ?? "";
  const clockOut = post?.time ?? "";
  const vehicleNumber =
    vehicleFromRollCallBlock(cellStr(preCell)) ||
    vehicleFromRollCallBlock(cellStr(postCell));

  return {
    date,
    driverName,
    employeeId,
    clockIn,
    clockOut,
    rollCallTime: clockIn || clockOut,
    vehicleNumber,
    hasPreRollCall: Boolean(pre),
    hasPostRollCall: Boolean(post),
    sourceSheet,
  };
}

export function isCsvExportFormat(matrix: SheetMatrix): boolean {
  const header = matrix[0];
  if (!header) return false;
  const joined = header.map((c) => cellStr(c)).join(",");
  return (
    (joined.includes("業務前点呼") || joined.includes("業務後点呼")) &&
    joined.includes("運転者")
  );
}

function findHeaderIndex(headers: string[], ...needles: string[]): number {
  return headers.findIndex((h) =>
    needles.some((n) => h.replace(/\s/g, "").includes(n.replace(/\s/g, ""))),
  );
}

/** See-Drive 点呼簿 CSV エクスポート（1行目ヘッダー） */
export function parseRollCallCsvExport(matrix: SheetMatrix): RollCallParseResult {
  const warnings: string[] = [];
  const entries: ParsedRollCallEntry[] = [];

  if (matrix.length < 2) {
    return { entries, warnings: ["データ行がありません"] };
  }

  const headers = matrix[0]!.map((c) => cellStr(c));
  const iDriver = findHeaderIndex(headers, "運転者名", "運転者");
  const iPre = findHeaderIndex(headers, "業務前点呼日時", "業務前点呼");
  const iPost = findHeaderIndex(headers, "業務後点呼日時", "業務後点呼");
  const iPreVehicle = findHeaderIndex(headers, "業務前車両");
  const iPostVehicle = findHeaderIndex(headers, "業務後車両");

  if (iDriver < 0) {
    return { entries, warnings: ["運転者名列が見つかりません"] };
  }
  if (iPre < 0 && iPost < 0) {
    return { entries, warnings: ["業務前/業務後点呼日時列が見つかりません"] };
  }

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    const driverRaw = cellStr(row[iDriver]);
    if (!driverRaw) continue;

    const { driverName, employeeId } = parseDriverCell(driverRaw);
    const preCell = iPre >= 0 ? row[iPre] : "";
    const postCell = iPost >= 0 ? row[iPost] : "";

    let entry = entryFromPrePost(
      driverName,
      employeeId,
      preCell,
      postCell,
    );

    if (entry && !entry.vehicleNumber) {
      const vPre = iPreVehicle >= 0 ? cellStr(row[iPreVehicle]) : "";
      const vPost = iPostVehicle >= 0 ? cellStr(row[iPostVehicle]) : "";
      entry = {
        ...entry,
        vehicleNumber: (vPre || vPost).replace(/\s+/g, ""),
      };
    }

    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    warnings.push("有効な点呼行が0件でした");
  }

  return { entries, warnings };
}

/**
 * ヘッダー行を走査して「業務前点呼」「業務後点呼」セクションを動的に検出し、
 * その下にある「点呼日時」サブ列のインデックスを返す。
 * 検出できなかった場合は既定値（COL_DRIVER/COL_PRE/COL_POST）にフォールバック。
 */
function detectGridColumns(matrix: SheetMatrix): {
  colDriver: number;
  colPre: number;
  colPost: number;
  dataStartRow: number;
} {
  let colDriver = COL_DRIVER;
  let colPre = COL_PRE;
  let colPost = COL_POST;
  let dataStartRow = EXCEL_DATA_START_ROW;

  let preSectionCol = -1;
  let postSectionCol = -1;
  let sectionHeaderRow = -1;

  // ① 上位ヘッダー行（最大 12 行）から「業務前点呼」「業務後点呼」を探す
  for (let r = 0; r < Math.min(12, matrix.length); r++) {
    const row = matrix[r];
    if (!row) continue;
    let foundPre = false;
    let foundPost = false;
    for (let c = 0; c < row.length; c++) {
      const cell = cellStr(row[c]);
      // 運転者列の候補
      if (
        (cell.includes("運転者") || cell === "氏名" || cell === "名前") &&
        colDriver === COL_DRIVER
      ) {
        colDriver = c;
      }
      if (cell.includes("業務前点呼") && !cell.includes("業務後")) {
        preSectionCol = c;
        foundPre = true;
      }
      if (cell.includes("業務後点呼")) {
        postSectionCol = c;
        foundPost = true;
      }
    }
    if (foundPre && foundPost) {
      sectionHeaderRow = r;
    }
  }

  // ② セクションヘッダーが見つかった場合、直下の行から「点呼日時」サブ列を検索
  if (sectionHeaderRow >= 0) {
    for (
      let r = sectionHeaderRow + 1;
      r < Math.min(sectionHeaderRow + 6, matrix.length);
      r++
    ) {
      const row = matrix[r];
      if (!row) continue;

      // 業務前セクション内の「点呼日時」列
      if (preSectionCol >= 0 && colPre === COL_PRE) {
        for (
          let c = Math.max(0, preSectionCol - 1);
          c < Math.min(preSectionCol + 20, row.length);
          c++
        ) {
          if (
            cellStr(row[c]).includes("点呼日時") ||
            cellStr(row[c]).includes("点呼時間")
          ) {
            colPre = c;
            break;
          }
        }
      }

      // 業務後セクション内の「点呼日時」列
      if (postSectionCol >= 0 && colPost === COL_POST) {
        for (
          let c = Math.max(0, postSectionCol - 1);
          c < Math.min(postSectionCol + 20, row.length);
          c++
        ) {
          if (
            cellStr(row[c]).includes("点呼日時") ||
            cellStr(row[c]).includes("点呼時間")
          ) {
            colPost = c;
            break;
          }
        }
      }

      // 両方見つかったら終了
      if (colPre !== COL_PRE && colPost !== COL_POST) break;
    }

    // データ開始行はセクションヘッダーより下（最低でも EXCEL_DATA_START_ROW）
    dataStartRow = Math.max(EXCEL_DATA_START_ROW, sectionHeaderRow + 2);
  }

  return { colDriver, colPre, colPost, dataStartRow };
}

/** Excel 原票（業務前点呼・業務後点呼ブロックを動的検出） */
export function parseRollCallExcelGrid(
  matrix: SheetMatrix,
  sheetName: string,
): RollCallParseResult {
  const warnings: string[] = [];
  const entries: ParsedRollCallEntry[] = [];
  const fallbackDate = dateFromSheetName(sheetName) ?? undefined;

  const { colDriver, colPre, colPost, dataStartRow } =
    detectGridColumns(matrix);

  if (colPre !== COL_PRE || colPost !== COL_POST) {
    warnings.push(
      `列自動検出: ドライバー列=${colDriver}, 業務前=${colPre}, 業務後=${colPost}, データ開始行=${dataStartRow + 1}`,
    );
  }

  for (let r = dataStartRow; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    const driverRaw = cellStr(row[colDriver]);
    if (!driverRaw) continue;

    const { driverName, employeeId } = parseDriverCell(driverRaw);
    const entry = entryFromPrePost(
      driverName,
      employeeId,
      row[colPre],
      row[colPost],
      fallbackDate,
      sheetName,
    );
    if (entry) entries.push(entry);
  }

  if (entries.length === 0 && matrix.length > dataStartRow) {
    warnings.push(
      `${sheetName}: データ行（${dataStartRow + 1}行目以降）に点呼データが見つかりませんでした。列位置: 業務前=${colPre}, 業務後=${colPost}`,
    );
  }

  return { entries, warnings };
}

export function parseRollCallSheet(
  matrix: SheetMatrix,
  sheetName: string,
): RollCallParseResult {
  if (isCsvExportFormat(matrix)) {
    return parseRollCallCsvExport(matrix);
  }
  return parseRollCallExcelGrid(matrix, sheetName);
}

export function mergeRollCallEntries(
  lists: ParsedRollCallEntry[],
): ParsedRollCallEntry[] {
  const map = new Map<string, ParsedRollCallEntry>();

  for (const e of lists) {
    const key = `${e.date}|${normalizeDriverName(e.driverName)}|${e.employeeId ?? ""}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...e });
      continue;
    }
    map.set(key, {
      ...existing,
      clockIn: existing.clockIn || e.clockIn,
      clockOut: e.clockOut || existing.clockOut,
      rollCallTime: existing.rollCallTime || e.rollCallTime,
      vehicleNumber: existing.vehicleNumber || e.vehicleNumber,
      hasPreRollCall: existing.hasPreRollCall || e.hasPreRollCall,
      hasPostRollCall: existing.hasPostRollCall || e.hasPostRollCall,
      employeeId: existing.employeeId ?? e.employeeId,
    });
  }

  return [...map.values()];
}
