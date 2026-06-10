/** CSV は Shift_JIS（CP932）固定。Windows Excel 出力専用。 */
export function decodeCsvBufferShiftJis(buffer: ArrayBuffer): string {
  for (const label of ["shift_jis", "windows-932"] as const) {
    try {
      const text = new TextDecoder(label).decode(buffer);
      if (text.length > 0) return text;
    } catch {
      /* try next */
    }
  }
  return new TextDecoder("shift_jis").decode(buffer);
}

/**
 * CSVファイルを Shift_JIS として読み込む。
 * MIME・拡張子は一切チェックしない（.CSV / .csv / Excel出力すべて受け入れ）。
 */
export function readCsvFileAsShiftJis(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fallbackFromBuffer = () => {
      file
        .arrayBuffer()
        .then((buffer) => resolve(decodeCsvBufferShiftJis(buffer)))
        .catch(reject);
    };

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (text.trim().length > 0) {
        resolve(text);
        return;
      }
      fallbackFromBuffer();
    };
    reader.onerror = () => fallbackFromBuffer();

    try {
      reader.readAsText(file, "Shift_JIS");
    } catch {
      fallbackFromBuffer();
    }
  });
}

/** @deprecated CSV は decodeCsvBufferShiftJis を使用 */
export function decodeBufferForJapaneseCsv(buffer: ArrayBuffer): {
  text: string;
  encoding: string;
} {
  return { text: decodeCsvBufferShiftJis(buffer), encoding: "shift_jis" };
}

export function decodeBufferBestEffort(buffer: ArrayBuffer): {
  text: string;
  encoding: string;
} {
  return decodeBufferForJapaneseCsv(buffer);
}
