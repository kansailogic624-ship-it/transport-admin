/**
 * PDFテキスト抽出ユーティリティ
 *
 * 優先順序:
 *  1. pdfjs でネイティブテキストを抽出（テキストベースPDF）
 *  2. テキストが空 → Tesseract.js OCR に自動フォールバック（スキャン画像PDF）
 *
 * ブラウザ（クライアントサイド）専用。
 */

import type { OcrProgress } from "./pdf-ocr";

export type { OcrProgress };

export type ExtractResult = {
  text: string;
  /** true: OCR を使用した。false: ネイティブテキスト抽出 */
  usedOcr: boolean;
  /** ネイティブPDFテキスト / スキャンOCRフォールバック */
  extractionMode: "native_text" | "ocr_fallback";
};

import type { TextItem } from "pdfjs-dist/types/src/display/api";

/**
 * PDF ファイルからテキストを抽出する。
 *
 * スキャン画像PDFの場合は OCR を自動実行する（初回は日本語データのDLあり）。
 *
 * @param file       - PDF ファイル
 * @param onProgress - OCR 進捗コールバック（スキャンPDFのみ呼ばれる）
 */
export async function extractTextFromPdf(
  file: File,
  onProgress?: (p: OcrProgress) => void,
): Promise<ExtractResult> {
  // ── Step 1: ネイティブテキスト抽出 ──────────────────────────────
  const nativeText = await extractNativeText(file);

  if (nativeText.trim().length > 20) {
    return { text: nativeText, usedOcr: false, extractionMode: "native_text" };
  }

  // ── Step 2: OCR フォールバック ───────────────────────────────────
  onProgress?.({
    stage: "スキャン画像PDFを検出しました。OCR処理を開始します...",
    percent: 0,
  });

  const { ocrPdfFile } = await import("./pdf-ocr");
  const ocrText = await ocrPdfFile(file, onProgress);

  return { text: ocrText, usedOcr: true, extractionMode: "ocr_fallback" };
}

// ---------------------------------------------------------------------------
// ネイティブテキスト抽出（テキストベースPDF用）
// ---------------------------------------------------------------------------

async function extractNativeText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items = textContent.items.filter(
      (item): item is TextItem => "str" in item,
    );
    if (items.length === 0) continue;

    // Y座標でグループ化して行単位に結合
    const LINE_TOLERANCE = 3;
    const lines: string[][] = [];
    let currentLineY: number | null = null;
    let currentLine: string[] = [];

    const sorted = [...items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > LINE_TOLERANCE) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    for (const item of sorted) {
      const y = item.transform[5];
      if (currentLineY === null || Math.abs(y - currentLineY) > LINE_TOLERANCE) {
        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [];
        currentLineY = y;
      }
      if (item.str.trim()) currentLine.push(item.str.trim());
    }
    if (currentLine.length > 0) lines.push(currentLine);

    pageTexts.push(lines.map((l) => l.join("　")).join("\n"));
  }

  return pageTexts.join("\n\n");
}
