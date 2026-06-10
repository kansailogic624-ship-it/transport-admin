import { readFileSync } from "node:fs";
import {
  parseRollCallCsvExport,
  parseRollCallSheet,
} from "../src/lib/roll-call-parser";
import { decodeCsvBufferShiftJis } from "../src/lib/encoding-detect";

async function main() {
  const path =
    process.argv[2] ??
    "C:\\Users\\大西本社\\Downloads\\点呼簿 (8).csv";

  const buf = readFileSync(path);
  const text = decodeCsvBufferShiftJis(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  const rows = text.split(/\r?\n/).map((line) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
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

  const manual = parseRollCallCsvExport(rows);
  console.log("manual csv parse entries", manual.entries.length, manual.warnings);

  const { parseCsvTextToMatrix } = await import("../src/lib/roll-call-parser");
  const matrix = parseCsvTextToMatrix(text);
  const viaMatrix = parseRollCallCsvExport(matrix);
  console.log("parseCsvTextToMatrix entries", viaMatrix.entries.length);

  const XLSX = await import("xlsx");
  const wb = XLSX.read(text, { type: "string", cellDates: false, raw: false });
  const sn = wb.SheetNames[0]!;
  const ws = wb.Sheets[sn]!;
  const xrows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  }) as unknown[][];
  console.log("xlsx sheet", sn, "rows", xrows.length);
  console.log("xlsx row0[3-5]", xrows[0]?.slice(3, 6));
  console.log("xlsx row1[3-5]", xrows[1]?.slice(3, 6));
  const xr = parseRollCallSheet(xrows, sn);
  console.log("xlsx parseRollCallSheet", xr.entries.length, xr.warnings);
  if (xr.entries[0]) console.log("first", xr.entries[0]);

  const h = xrows[0] as unknown[];
  const iPost = h.findIndex((c) => String(c).includes("業務後点呼日時"));
  const iPre = h.findIndex((c) => String(c).includes("業務前点呼日時"));
  console.log("iPre", iPre, "iPost", iPost);
  for (const i of [1, 23, 24]) {
    const r = xrows[i] as unknown[];
    console.log(
      "row",
      i,
      "len",
      r.length,
      "pre",
      r[iPre],
      "post",
      r[iPost],
      "postType",
      typeof r[iPost],
    );
  }
}

main().catch(console.error);
