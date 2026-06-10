/**

 * 高速代CSV（KJS明細 / コーポ明細）解析

 *

 * コーポ明細: 各カード末尾の「カード 利用金額計」行の【差引金額】を車両合計とする

 * （通行料金・定価は使用しない）

 */



import { parseJapaneseBillingMonth } from "./maintenance-bill-parser";

import type { BillType } from "./types";



export type TollCsvKind = "kjs" | "corpo";



export type ParsedTollVehicleEntry = {

  rawPlate: string;

  vehicleNumber: string;

  totalAmount: number;

};



export type ParsedTollCsv = {

  kind: TollCsvKind;

  vendorName: string;

  billType: BillType;

  billingMonth: string;

  totalAmount: number;

  vehicles: ParsedTollVehicleEntry[];

};



const KJS_VENDOR = "KJS高速明細";

const CORPO_VENDOR = "コーポ高速明細";



/** 簡易CSV行パース（ダブルクォート対応） */

export function parseCsvText(text: string): string[][] {

  const rows: string[][] = [];

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {

    const line = rawLine.trim();

    if (!line) continue;

    const cells: string[] = [];

    let cur = "";

    let inQuote = false;

    for (let i = 0; i < line.length; i++) {

      const ch = line[i]!;

      if (ch === '"') {

        inQuote = !inQuote;

        continue;

      }

      if ((ch === "," || ch === "\t") && !inQuote) {

        cells.push(cur.trim());

        cur = "";

        continue;

      }

      cur += ch;

    }

    cells.push(cur.trim());

    rows.push(cells);

  }

  return rows;

}



export function detectTollCsvKind(

  text: string,

  fileName?: string,

): TollCsvKind | null {

  const fn = fileName ?? "";

  if (/KJS/i.test(fn)) return "kjs";

  if (/ｺｰﾎﾟ|コーポ|CORPO/i.test(fn)) return "corpo";



  const scanLines = text.split(/\r?\n/).slice(0, 40);

  for (const line of scanLines) {

    if (/差引金額|ｻｲﾋｷ金額/.test(line)) return "corpo";

    if (/利用金額/.test(line)) return "kjs";

  }



  const joined = scanLines.join("\n");

  if (/差引金額|ｻｲﾋｷ金額/.test(joined)) return "corpo";

  if (/利用金額/.test(joined)) return "kjs";

  return null;

}



function normalizeHeaderCell(raw: string): string {

  return (raw ?? "")

    .replace(/\u3000/g, "")

    .replace(/\s/g, "")

    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>

      String.fromCharCode(c.charCodeAt(0) - 0xfee0),

    );

}



function findColumnIndex(header: string[], candidates: string[]): number {

  for (let i = 0; i < header.length; i++) {

    const h = normalizeHeaderCell(header[i]!);

    for (const c of candidates) {

      const key = c.replace(/\s/g, "");

      if (h === key || h.includes(key)) return i;

    }

  }

  return -1;

}



type TollColumns = {

  headerIdx: number;

  plateCol: number;

  /** 実質負担額（差引金額） */

  netCol: number;

  /** KJS 利用金額 */

  usageCol: number;

};



function resolveColumns(rows: string[][]): TollColumns | null {

  for (let i = 0; i < Math.min(rows.length, 40); i++) {

    const row = rows[i]!;

    const plateCol = findColumnIndex(row, [

      "車番",

      "車両番号",

      "ナンバー",

      "車両No",

    ]);

    const netCol = findColumnIndex(row, [

      "差引金額",

      "差引き金額",

      "ｻｲﾋｷ金額",

      "ｻｲﾋｷ",

    ]);

    const usageCol = findColumnIndex(row, ["利用金額", "利用料金"]);

    const hasTollHeader =

      plateCol >= 0 &&

      (netCol >= 0 || usageCol >= 0) &&

      /車番|車両番号/.test(row.join(","));



    if (hasTollHeader) {

      return {

        headerIdx: i,

        plateCol,

        netCol,

        usageCol,

      };

    }

  }

  return null;

}



function parseAmountCell(raw: string): number {

  const s = (raw ?? "").replace(/[^\d.-]/g, "");

  const n = Number(s);

  return Number.isFinite(n) ? n : 0;

}



function guessBillingMonth(text: string, fileName?: string): string {

  for (const line of text.split("\n").slice(0, 20)) {

    const m = parseJapaneseBillingMonth(line);

    if (m) return m;

  }

  const fn = fileName ?? "";

  const ym = fn.match(/(\d{4})[-_]?(\d{2})/);

  if (ym) return `${ym[1]}-${ym[2]}`;

  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

}



function isCardTotalRow(row: string[]): boolean {

  const joined = row.join(" ").replace(/\s/g, "");

  return /カード.*利用金額計|利用金額計/.test(joined);

}



function isCardSubtotalRow(row: string[]): boolean {

  const joined = row.join(" ").replace(/\s/g, "");

  return /カード.*大口|大口・多頻度|多頻度対象額/.test(joined);

}



function isSkippablePlate(plate: string): boolean {

  return (

    !plate ||

    plate === "手渡" ||

    /^合計/.test(plate) ||

    /カード|利用金額|大口|多頻度/.test(plate)

  );

}



function extractPlateFromRow(

  row: string[],

  plateCol: number,

): string | null {

  const plate = (row[plateCol] ?? "").trim();

  if (isSkippablePlate(plate)) return null;

  if (/京都|大阪|兵庫|滋賀|奈良|和歌山|\d{2,3}[-－]\d{2,4}/.test(plate)) {

    return plate;

  }

  return plate.length >= 4 ? plate : null;

}



/** カード利用金額計行から実質負担額を取得 */

function amountFromCardTotalRow(

  row: string[],

  kind: TollCsvKind,

  cols: TollColumns,

): number {

  if (kind === "corpo" && cols.netCol >= 0) {

    return parseAmountCell(row[cols.netCol] ?? "");

  }

  if (cols.usageCol >= 0) {

    return parseAmountCell(row[cols.usageCol] ?? "");

  }

  if (cols.netCol >= 0) {

    return parseAmountCell(row[cols.netCol] ?? "");

  }

  return 0;

}



/** 明細行から差引金額（フォールバック用） */

function amountFromDetailRow(

  row: string[],

  kind: TollCsvKind,

  cols: TollColumns,

): number {

  if (kind === "corpo" && cols.netCol >= 0) {

    return parseAmountCell(row[cols.netCol] ?? "");

  }

  if (cols.usageCol >= 0) {

    return parseAmountCell(row[cols.usageCol] ?? "");

  }

  if (cols.netCol >= 0) {

    return parseAmountCell(row[cols.netCol] ?? "");

  }

  return 0;

}



export function parseTollCsv(

  text: string,

  kind: TollCsvKind,

  fileName?: string,

): ParsedTollCsv {

  const rows = parseCsvText(text);

  const empty: ParsedTollCsv = {

    kind,

    vendorName: kind === "kjs" ? KJS_VENDOR : CORPO_VENDOR,

    billType: "高速代",

    billingMonth: guessBillingMonth(text, fileName),

    totalAmount: 0,

    vehicles: [],

  };



  if (rows.length === 0) return empty;



  const cols = resolveColumns(rows);

  if (!cols || cols.plateCol < 0) return empty;



  const totals = new Map<string, number>();

  let currentPlate: string | null = null;

  let usedCardTotals = false;



  for (let i = cols.headerIdx + 1; i < rows.length; i++) {

    const row = rows[i]!;



    if (isCardSubtotalRow(row)) continue;



    if (isCardTotalRow(row)) {

      const plate =

        extractPlateFromRow(row, cols.plateCol) ?? currentPlate ?? null;

      const amount = amountFromCardTotalRow(row, kind, cols);

      if (plate && amount > 0) {

        totals.set(plate, amount);

        usedCardTotals = true;

      }

      currentPlate = null;

      continue;

    }



    const plate = extractPlateFromRow(row, cols.plateCol);

    if (plate) currentPlate = plate;



    if (!usedCardTotals && plate) {

      const amount = amountFromDetailRow(row, kind, cols);

      if (amount > 0) {

        totals.set(plate, (totals.get(plate) ?? 0) + amount);

      }

    }

  }



  const vehicles: ParsedTollVehicleEntry[] = [...totals.entries()]

    .map(([rawPlate, totalAmount]) => ({

      rawPlate,

      vehicleNumber: "",

      totalAmount,

    }))

    .sort((a, b) => b.totalAmount - a.totalAmount);



  const totalAmount = vehicles.reduce((s, v) => s + v.totalAmount, 0);



  return {

    kind,

    vendorName: kind === "kjs" ? KJS_VENDOR : CORPO_VENDOR,

    billType: "高速代",

    billingMonth: guessBillingMonth(text, fileName),

    totalAmount,

    vehicles,

  };

}



export function mergeTollVehicleEntries(

  entries: ParsedTollVehicleEntry[],

): ParsedTollVehicleEntry[] {

  const map = new Map<string, ParsedTollVehicleEntry>();

  for (const e of entries) {

    const key = e.rawPlate.trim();

    if (!key) continue;

    const prev = map.get(key);

    if (!prev) map.set(key, { ...e });

    else prev.totalAmount += e.totalAmount;

  }

  return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);

}


