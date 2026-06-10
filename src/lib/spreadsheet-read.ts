import type { SheetMatrix } from "./driving-report-parser";
import { decodeCsvBufferShiftJis } from "./encoding-detect";

export async function sheetRowsFromFile(file: File): Promise<SheetMatrix> {
  const buffer = await file.arrayBuffer();
  return sheetRowsFromArrayBuffer(buffer, file.name);
}

function readWorkbookFromBuffer(
  XLSX: typeof import("xlsx"),
  buffer: ArrayBuffer,
  fileName: string,
) {
  const isCsv = /\.csv$/i.test(fileName);

  if (isCsv) {
    const text = decodeCsvBufferShiftJis(buffer);
    return XLSX.read(text, {
      type: "string",
      cellDates: false,
      raw: false,
    });
  }

  return XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    raw: false,
  });
}

export async function sheetRowsFromArrayBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<SheetMatrix> {
  const sheets = await allSheetMatricesFromArrayBuffer(buffer, fileName);
  return sheets[0]?.rows ?? [];
}

export type NamedSheetMatrix = {
  sheetName: string;
  rows: SheetMatrix;
};

/** ブック内の全シートを二次元配列で取得 */
export async function allSheetMatricesFromArrayBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<NamedSheetMatrix[]> {
  const XLSX = await import("xlsx");
  const wb = readWorkbookFromBuffer(XLSX, buffer, fileName);

  return wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    }) as SheetMatrix;
    return { sheetName, rows };
  });
}
