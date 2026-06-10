import { normalizeVehicleNumber } from "./import-match-keys";
import { withInferredReportStatus } from "./report-status";
import type { DailyRecord, TripEntry } from "./types";
import { normalizeRecord } from "./trip-normalize";
import { newCrewMember } from "./crew-utils";

/** 運転日報（See-Drive F09 Excel/CSV）1ファイル分の解析結果 */
export type ParsedDrivingReport = {
  sourceFileName: string;
  date: string;
  driverName: string;
  vehicleNumber: string;
  clockIn: string;
  clockOut: string;
  rollCallTime: string;
  dailyReportSubmitted: boolean;
  startMeter: string;
  endMeter: string;
  distanceKm: number;
  trips: Array<{
    shipperName: string;
    jobName: string;
    tollFee: string;
    origin: string;
    destination: string;
    /** 出発地/到着地を持つ配送明細行か（件数カウント対象） */
    isDeliveryDrop: boolean;
  }>;
  warnings: string[];
};

export type SheetMatrix = unknown[][];

const COL = {
  shipper: 0,
  job: 29,
  origin: 58,
  destination: 90,
  toll: 122,
  vehicle: 0,
  clockIn: 68,
  clockOut: 106,
  distance: 118,
  driverValue: 152,
  startMeter: 52,
  endMeter: 106,
} as const;

const TRIP_START_ROW = 9;
/** 連結日報で次ブロックまでの最小行数（これより近い日付行は同一ブロックとみなさない） */
const MIN_ROWS_BETWEEN_BLOCKS = 10;

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\u3000/g, " ").trim();
}

/** 苗字と名前の間のスペース（半角・全角）を除去し、全角英数字も半角に統一 */
export function normalizeDriverName(raw: string): string {
  return raw
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[\s\u3000]+/g, "")
    .trim();
}

/** Excelシリアル or 「00:15:00」「0:15」形式 */
export function parseTimeCell(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "number" && !Number.isNaN(value)) {
    const frac = value - Math.floor(value);
    const totalMin = Math.round(frac * 24 * 60) % (24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const text = cellText(value).replace(/[^\d:]/g, "");
  const parts = text.split(":").filter(Boolean);
  if (parts.length >= 2) {
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  return null;
}

export function parseNumberCell(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const text = cellText(value)
    .replace(/,/g, "")
    .replace(/km/gi, "")
    .replace(/[^\d.-]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
}

/** 1行目「2026年5月30日」形式から ISO 日付 (YYYY-MM-DD) */
export function parseReportDateFromRow1(row: unknown[]): string | null {
  const numbers = row.filter(
    (c): c is number => typeof c === "number" && !Number.isNaN(c),
  );
  if (numbers.length >= 3) {
    const [y, m, d] = numbers;
    if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  const joined = row.map(cellText).join("");
  const m = joined.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function rowJoined(row: unknown[]): string {
  return row.map(cellText).join(" ");
}

/** 行内ラベルの右隣または同一セル内の値を取得 */
function valueAfterLabel(row: unknown[], label: string): string {
  for (let i = 0; i < row.length; i++) {
    const text = cellText(row[i]);
    if (!text.includes(label)) continue;

    const inline = text.replace(label, "").trim();
    if (inline && inline !== label) return inline;

    for (let j = i + 1; j < Math.min(i + 8, row.length); j++) {
      const next = cellText(row[j]);
      if (next && !next.includes("時刻") && next.length < 40) return next;
    }
  }
  return "";
}

function findDriverName(headerRow: unknown[], dataRow: unknown[]): string {
  const fromHeader = cellText(headerRow[COL.driverValue]);
  if (fromHeader && fromHeader !== "助手") {
    return normalizeDriverName(fromHeader);
  }

  for (let i = 0; i < headerRow.length; i++) {
    if (cellText(headerRow[i]).includes("運転手")) {
      for (let j = i + 1; j < Math.min(i + 20, headerRow.length); j++) {
        const candidate = cellText(headerRow[j]);
        if (candidate && !candidate.includes("運転手") && candidate !== "助手") {
          return normalizeDriverName(candidate);
        }
      }
    }
  }

  const labelDriver = valueAfterLabel(headerRow, "運転手");
  if (labelDriver) return normalizeDriverName(labelDriver);

  for (const row of [dataRow, headerRow]) {
    const joined = rowJoined(row);
    const m = joined.match(/運転手\s*([^\s助手]{2,20})/);
    if (m) return normalizeDriverName(m[1]);
  }

  return "";
}

function findVehicleNumber(dataRow: unknown[]): string {
  const direct = cellText(dataRow[COL.vehicle]);
  if (direct && !direct.includes("登録")) return direct;

  const labeled = valueAfterLabel(dataRow, "登録番号");
  if (labeled) return labeled;

  const joined = rowJoined(dataRow);
  const m = joined.match(/登録番号\s*([0-9０-９a-zA-Zぁ-んァ-ン\-ー]+)/);
  return m ? m[1].trim() : "";
}

function findDistanceKm(dataRow: unknown[]): number {
  const fromCol = parseNumberCell(dataRow[COL.distance]);
  if (fromCol != null && fromCol > 0 && fromCol < 2000) return Math.round(fromCol);

  const labeled = parseNumberCell(valueAfterLabel(dataRow, "走行距離"));
  if (labeled != null && labeled > 0) return Math.round(labeled);

  const joined = rowJoined(dataRow);
  const m = joined.match(/走行距離\s*(\d+)/);
  if (m) return Number(m[1]);

  return 0;
}

function findClockTimes(dataRow: unknown[]): { clockIn: string; clockOut: string } {
  let clockIn = parseTimeCell(dataRow[COL.clockIn]) ?? "";
  let clockOut = parseTimeCell(dataRow[COL.clockOut]) ?? "";

  if (!clockIn) {
    for (let i = 0; i < dataRow.length; i++) {
      if (cellText(dataRow[i]).includes("出庫")) {
        clockIn =
          parseTimeCell(dataRow[i + 1]) ??
          parseTimeCell(valueAfterLabel(dataRow, "出庫")) ??
          "";
        break;
      }
    }
  }

  if (!clockOut) {
    for (let i = 0; i < dataRow.length; i++) {
      const t = cellText(dataRow[i]);
      if (t.includes("最終帰庫") || t.includes("帰庫地")) {
        clockOut =
          parseTimeCell(dataRow[i + 1]) ??
          parseTimeCell(valueAfterLabel(dataRow, "最終帰庫")) ??
          "";
        break;
      }
    }
  }

  return { clockIn, clockOut };
}

const INVALID_TRIP_LABEL =
  /^(事項|運\s*転\s*時\s*間|作\s*業\s*時\s*間|休\s*憩\s*時\s*間|待\s*機\s*時\s*間|アルコール|出社|退社|日常点検|点検表|合計|備考)/;

function isTripSectionEndMarker(text: string): boolean {
  return (
    text.includes("日常点検") ||
    text.includes("点検表") ||
    /運\s*転\s*日\s*報/.test(text)
  );
}

function isValidTripLine(shipperName: string, jobName: string): boolean {
  const s = shipperName.replace(/\s/g, "").trim();
  const j = jobName.replace(/\s/g, "").trim();
  if (!s && !j) return false;
  if (INVALID_TRIP_LABEL.test(s) || INVALID_TRIP_LABEL.test(j)) return false;
  if (/^(運転|作業|休憩|待機)時間?$/.test(s)) return false;
  return true;
}

/** 出発地・到着地に具体的な地名・拠点名があるか（時刻シリアル等は除外） */
function isConcreteLocation(text: string): boolean {
  const t = cellText(text);
  if (!t) return false;
  if (INVALID_TRIP_LABEL.test(t)) return false;
  if (/^\d{4,}(\.\d+)?$/.test(t.replace(/,/g, ""))) return false;
  return true;
}

/** 配送件数（ドロップ数）のカウント対象となる明細行か */
export function isCountableDeliveryDetailRow(
  shipperName: string,
  jobName: string,
  origin: string,
  destination: string,
): boolean {
  const s = shipperName.replace(/\s/g, "").trim();
  if (!s) return false;
  if (!isValidTripLine(shipperName, jobName)) return false;
  return isConcreteLocation(origin) || isConcreteLocation(destination);
}

/** 明細行サブセットの配送件数。対象行がなければ 1（事務所待機・ピストン等） */
export function countDeliveryDropsForReportTripSubset(
  trips: ParsedDrivingReport["trips"],
): number {
  const n = trips.filter((t) => t.isDeliveryDrop).length;
  return n > 0 ? n : 1;
}

/** 荷主ごとの配送件数 */
export function countDeliveryDropsByShipper(
  trips: ParsedDrivingReport["trips"],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of trips) {
    if (!t.isDeliveryDrop) continue;
    const key = t.shipperName.trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** 日報の「4行目」相当（登録番号・走行距離・出庫） */
function rowIsReportDataRow(row: unknown[]): boolean {
  const joined = rowJoined(row);
  if (!/登録番号/.test(joined)) return false;
  return (
    /走行距離|出庫|最終帰庫/.test(joined) ||
    Boolean(findVehicleNumber(row)) ||
    findDistanceKm(row) > 0
  );
}

function parseTrips(
  rows: SheetMatrix,
  tripStartRow = TRIP_START_ROW,
  endRow = rows.length,
): ParsedDrivingReport["trips"] {
  const trips: ParsedDrivingReport["trips"] = [];

  for (let i = tripStartRow; i < endRow; i++) {
    const row = rows[i];
    if (!row) continue;

    const joined = rowJoined(row);
    if (isTripSectionEndMarker(joined)) break;

    const shipperName = cellText(row[COL.shipper]);
    const jobName = cellText(row[COL.job]);
    const origin = cellText(row[COL.origin]);
    const destination = cellText(row[COL.destination]);

    if (shipperName && isTripSectionEndMarker(shipperName)) break;

    if (!isValidTripLine(shipperName, jobName)) {
      if (trips.length > 0) break;
      continue;
    }

    const tollNum = parseNumberCell(row[COL.toll]);
    const tollFee =
      tollNum != null && tollNum > 0 && tollNum < 1_000_000
        ? String(Math.round(tollNum))
        : "";

    trips.push({
      shipperName: shipperName || jobName,
      jobName,
      tollFee,
      origin,
      destination,
      isDeliveryDrop: isCountableDeliveryDetailRow(
        shipperName,
        jobName,
        origin,
        destination,
      ),
    });
  }

  return trips;
}

/** 行が「運転日報」タイトル行か */
export function rowIsDrivingReportTitle(row: unknown[]): boolean {
  return /運\s*転\s*日\s*報/.test(rowJoined(row));
}

function blockHasDriverHeader(rows: SheetMatrix, startRow: number): boolean {
  const limit = Math.min(startRow + 10, rows.length);
  for (let i = startRow; i < limit; i++) {
    const joined = rowJoined(rows[i] ?? []);
    if (/運転手|登録番号/.test(joined)) return true;
    const headerRow = rows[startRow + 2] ?? [];
    const dataRow = rows[startRow + 3] ?? [];
    if (findDriverName(headerRow, dataRow)) return true;
  }
  return false;
}

/**
 * 縦連結された運転日報シート内の各ドライバーブロック先頭行インデックス
 */
function resolveBlockStartFromIndex(
  rows: SheetMatrix,
  index: number,
): number {
  if (rowIsDrivingReportTitle(rows[index] ?? [])) {
    for (let d = index; d < Math.min(index + 6, rows.length); d++) {
      if (parseReportDateFromRow1(rows[d] ?? [])) return d;
    }
    return index;
  }
  if (parseReportDateFromRow1(rows[index] ?? [])) return index;
  for (let d = index; d >= Math.max(0, index - 6); d--) {
    if (parseReportDateFromRow1(rows[d] ?? [])) return d;
    if (rowIsDrivingReportTitle(rows[d] ?? [])) return d;
  }
  return index;
}

function pushBlockStart(starts: number[], candidate: number): void {
  const last = starts[starts.length - 1];
  if (last != null && candidate - last < MIN_ROWS_BETWEEN_BLOCKS) return;
  if (!starts.includes(candidate)) starts.push(candidate);
}

/**
 * 縦連結された運転日報シート内の各ドライバーブロック先頭行インデックス
 */
export function findDrivingReportBlockStarts(rows: SheetMatrix): number[] {
  const starts: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    let candidate: number | null = null;

    if (rowIsDrivingReportTitle(row)) {
      candidate = resolveBlockStartFromIndex(rows, i);
    } else if (
      parseReportDateFromRow1(row) &&
      blockHasDriverHeader(rows, i)
    ) {
      candidate = i;
    } else if (rowIsReportDataRow(row) && i >= TRIP_START_ROW) {
      candidate = resolveBlockStartFromIndex(rows, i);
    }

    if (candidate == null) continue;
    pushBlockStart(starts, candidate);
  }

  if (starts.length === 0) starts.push(0);
  return starts.sort((a, b) => a - b);
}

/**
 * 1ファイル内の全ドライバー分の運転日報を抽出（縦連結形式対応）
 */
export function parseAllDrivingReportsFromSheet(
  rows: SheetMatrix,
  sourceFileName = "",
): ParsedDrivingReport[] {
  if (rows.length === 0) return [];

  const starts = findDrivingReportBlockStarts(rows);
  const reports: ParsedDrivingReport[] = [];

  for (let b = 0; b < starts.length; b++) {
    const start = starts[b]!;
    const end = starts[b + 1] ?? rows.length;
    const slice = rows.slice(start, end);
    if (slice.length < 6) continue;

    const label =
      starts.length > 1
        ? `${sourceFileName} [${b + 1}/${starts.length}]`
        : sourceFileName;

    const report = parseDrivingReportSheet(slice, label, b);
    if (report.driverName || report.date) {
      reports.push(report);
    }
  }

  if (reports.length === 0) {
    const single = parseDrivingReportSheet(rows, sourceFileName, 0);
    if (single.driverName || single.date) {
      return mergeParsedReportsByDriverDay([single]);
    }
    return [];
  }

  return mergeParsedReportsByDriverDay(reports);
}

/**
 * 同一「日付＋運転手＋車両」の分割ブロックを1日分に統合（個配30件など）
 */
export function mergeParsedReportsByDriverDay(
  reports: ParsedDrivingReport[],
): ParsedDrivingReport[] {
  const map = new Map<string, ParsedDrivingReport>();

  for (const r of reports) {
    if (!r.date || !r.driverName) continue;
    const key = `${r.date}|${normalizeDriverName(r.driverName)}|${normalizeVehicleNumber(r.vehicleNumber)}`;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...r,
        trips: [...r.trips],
        warnings: [...r.warnings],
      });
      continue;
    }

    existing.trips.push(...r.trips);
    existing.warnings.push(...r.warnings);
    if (r.distanceKm > existing.distanceKm) existing.distanceKm = r.distanceKm;
    if (r.clockOut && (!existing.clockOut || r.clockOut > existing.clockOut)) {
      existing.clockOut = r.clockOut;
    }
    if (r.clockIn && !existing.clockIn) existing.clockIn = r.clockIn;
  }

  return [...map.values()];
}

/** 「メーター指数」ラベル直後の数値を順に収集（1つ目＝開始、2つ目＝終了） */
function parseMetersFromRows(
  rows: SheetMatrix,
  startRow = 0,
  endRow = rows.length,
): { startMeter: string; endMeter: string } {
  const meterValues: number[] = [];

  for (let i = startRow; i < endRow; i++) {
    const row = rows[i];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const text = cellText(row[c]);
      if (!text.includes("メーター指数")) continue;

      const inline = text.replace(/メーター指数/g, "").trim();
      const inlineNum = parseNumberCell(inline);
      if (inlineNum != null && inlineNum >= 1000 && inlineNum < 10_000_000) {
        meterValues.push(inlineNum);
        continue;
      }

      for (let k = c + 1; k < Math.min(c + 12, row.length); k++) {
        const n = parseNumberCell(row[k]);
        if (n != null && n >= 1000 && n < 10_000_000) {
          meterValues.push(n);
          break;
        }
      }
    }
  }

  if (meterValues.length >= 2) {
    const start = meterValues[0]!;
    const end = meterValues[1]!;
    return {
      startMeter: String(Math.round(Math.min(start, end))),
      endMeter: String(Math.round(Math.max(start, end))),
    };
  }

  const meterRow = rows[5] ?? [];
  const nums: number[] = [];
  for (const cell of meterRow) {
    const n = parseNumberCell(cell);
    if (n != null && n >= 1000 && n < 10_000_000) nums.push(n);
  }
  if (nums.length >= 2) {
    return {
      startMeter: String(Math.round(Math.min(nums[0]!, nums[1]!))),
      endMeter: String(Math.round(Math.max(nums[0]!, nums[1]!))),
    };
  }

  const start = parseNumberCell(meterRow[COL.startMeter]);
  const end = parseNumberCell(meterRow[COL.endMeter]);
  return {
    startMeter: start != null ? String(Math.round(start)) : "",
    endMeter: end != null ? String(Math.round(end)) : "",
  };
}

/**
 * 運転日報シート（2次元配列）を解析する。
 * xlsx で Excel / CSV を sheet_to_json(..., { header: 1 }) した結果を渡す。
 */
export function parseDrivingReportSheet(
  rows: SheetMatrix,
  sourceFileName = "",
  blockIndex = 0,
): ParsedDrivingReport {
  const warnings: string[] = [];

  let date: string | null = null;
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const row = rows[i] ?? [];
    if (rowIsDrivingReportTitle(row) || parseReportDateFromRow1(row)) {
      date = parseReportDateFromRow1(row);
      if (date) break;
    }
  }
  if (!date) date = parseReportDateFromRow1(rows[0] ?? []);
  if (!date) warnings.push("日付を読み取れませんでした（運転日報行）");

  const headerRow = rows[2] ?? [];
  const dataRow = rows[3] ?? [];
  const driverName = findDriverName(headerRow, dataRow);
  if (!driverName) warnings.push("運転手名を読み取れませんでした（3行目付近）");

  const vehicleNumber = findVehicleNumber(dataRow);
  if (!vehicleNumber) warnings.push("登録番号を読み取れませんでした（4行目）");

  const { clockIn, clockOut } = findClockTimes(dataRow);
  if (!clockIn) warnings.push("出庫時刻を読み取れませんでした");
  if (!clockOut) warnings.push("最終帰庫地時刻を読み取れませんでした");

  const distanceKm = findDistanceKm(dataRow);
  if (distanceKm <= 0) {
    warnings.push("走行距離を読み取れませんでした（3〜4行目）");
  }

  const { startMeter, endMeter } = parseMetersFromRows(rows);
  if (!startMeter || !endMeter) {
    if (distanceKm > 0) {
      warnings.push(
        `メーター指数は未入力ですが、走行距離 ${distanceKm}km を記録します`,
      );
    } else {
      warnings.push("メーター指数を読み取れませんでした（6行目）");
    }
  } else if (distanceKm > 0) {
    const calc = Number(endMeter) - Number(startMeter);
    if (Math.abs(calc - distanceKm) > 2) {
      warnings.push(
        `走行距離(${distanceKm}km)とメーター差(${calc}km)が一致しません`,
      );
    }
  }

  const trips = parseTrips(rows, TRIP_START_ROW, rows.length);
  if (trips.length === 0) {
    warnings.push("荷主・品名の明細行が見つかりませんでした（10行目以降）");
  }
  if (blockIndex > 0 && !sourceFileName.includes("[")) {
    warnings.push(`連結ファイル内の ${blockIndex + 1} 件目のブロック`);
  }

  return {
    sourceFileName,
    date: date ?? "",
    driverName,
    vehicleNumber,
    clockIn,
    clockOut,
    rollCallTime: clockIn,
    dailyReportSubmitted: true,
    startMeter,
    endMeter,
    distanceKm,
    trips,
    warnings,
  };
}

export function parsedReportToDailyRecord(
  parsed: ParsedDrivingReport,
): DailyRecord {
  const trips: TripEntry[] = parsed.trips.map((t) => {
    const label = t.jobName.trim() || t.shipperName.trim();
    return {
    id: crypto.randomUUID(),
    runType: "own" as const,
    vehicleNumber: parsed.vehicleNumber,
    shipperName: t.shipperName,
    jobName: t.jobName,
    reportSourceLabel: label,
    revenue: "",
    tollFee: t.tollFee,
    dropCount: t.isDeliveryDrop ? 1 : 1,
    startMeter: "",
    endMeter: "",
    crew: [
      (() => {
        const m = newCrewMember("employee");
        m.name = parsed.driverName;
        return m;
      })(),
    ],
    partnerName: "",
    partnerFee: "",
  };
  });

  if (trips.length > 0 && (parsed.startMeter || parsed.endMeter)) {
    trips[0] = {
      ...trips[0]!,
      startMeter: parsed.startMeter,
      endMeter: parsed.endMeter,
    };
  }

  if (trips.length === 0) {
    trips.push({
      id: crypto.randomUUID(),
      runType: "own",
      vehicleNumber: parsed.vehicleNumber,
      shipperName: "",
      jobName: "",
      revenue: "",
      tollFee: "",
      startMeter: parsed.startMeter,
      endMeter: parsed.endMeter,
      crew: [
        (() => {
          const m = newCrewMember("employee");
          m.name = parsed.driverName;
          return m;
        })(),
      ],
      partnerName: "",
      partnerFee: "",
    });
  }

  return withInferredReportStatus(
    normalizeRecord({
      date: parsed.date,
      operationType: "own",
      driverName: parsed.driverName,
      clockIn: parsed.clockIn,
      clockOut: parsed.clockOut,
      rollCallTime: parsed.rollCallTime,
      reportedDistanceKm: parsed.distanceKm > 0 ? parsed.distanceKm : undefined,
      trips,
      createdAt: new Date().toISOString(),
    }),
    { importedSubmitted: parsed.dailyReportSubmitted },
  );
}
