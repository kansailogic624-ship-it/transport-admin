/**
 * スキャン画像PDFのOCR処理
 *
 * フロー:
 *  1. pdfjs でページを高解像度 canvas に描画
 *  2. Tesseract.js (jpn+eng) で OCR
 *  3. ページテキストを結合して返す
 *
 * 抽出方針（maintenance-bill-ocr-summary と連携）:
 *  - 明細行はパースしない。請求書全体から4項目のみ: 車番・整備種別・税抜合計・消費税
 *  - 画面には1台1行で反映。諸費用はユーザーが手入力
 *
 * ブラウザ（クライアントサイド）専用。
 */

export type OcrProgress = {
  stage: string;
  percent: number;
  page?: number;
  totalPages?: number;
};

/**
 * スキャンPDFをOCR処理してテキストを返す。
 *
 * @param file          - PDF ファイル
 * @param onProgress    - 進捗コールバック (0〜100%)
 */
export async function ocrPdfFile(
  file: File,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  // ── Step 1: pdfjs でページ数を確認 ────────────────────────────────
  onProgress?.({ stage: "PDFを読み込み中...", percent: 2 });

  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib
    .getDocument({ data: new Uint8Array(arrayBuffer), useSystemFonts: true })
    .promise;
  const numPages = pdf.numPages;

  // ── Step 2: Tesseract ワーカーを初期化 ────────────────────────────
  onProgress?.({
    stage: "OCRエンジンを初期化中... (初回は日本語データのダウンロード約10〜20MBが発生します)",
    percent: 5,
  });

  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker(["jpn", "eng"], 1 /* LSTM_ONLY */, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "loading language traineddata") {
        onProgress?.({
          stage: `言語データを読み込み中... ${Math.round(m.progress * 100)}%（初回のみ時間がかかります）`,
          percent: 5 + Math.round(m.progress * 8),
        });
      } else if (m.status === "initializing tesseract") {
        onProgress?.({ stage: "OCRエンジンを起動中...", percent: 13 });
      } else if (m.status === "recognizing text") {
        // fine-grain progress during recognition (handled per page below)
      }
    },
  });

  // 精度向上設定（PSM.AUTO = "3", preserve_interword_spaces で日本語精度向上）
  await worker.setParameters({
    tessedit_pageseg_mode: "3" as unknown as import("tesseract.js").PSM,
    preserve_interword_spaces: "1",
  });

  // ── Step 3: 各ページを canvas に描画して OCR ─────────────────────
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const basePct = 15 + Math.round(((pageNum - 1) / numPages) * 82);

    onProgress?.({
      stage: `OCR処理中... (${pageNum} / ${numPages} ページ目)`,
      percent: basePct,
      page: pageNum,
      totalPages: numPages,
    });

    // --- PDF ページを canvas に高解像度でレンダリング ---
    const page = await pdf.getPage(pageNum);

    // scale 3 = A4 約 1785×2523 px（≈ 270 DPI）
    // OCR 精度を最大化するため高解像度でレンダリング
    const scale = 3.0;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    // --- Tesseract OCR ---
    const { data: { text } } = await worker.recognize(canvas);
    pageTexts.push(cleanOcrText(text));

    onProgress?.({
      stage: `OCR処理中... (${pageNum} / ${numPages} ページ完了)`,
      percent: 15 + Math.round((pageNum / numPages) * 82),
      page: pageNum,
      totalPages: numPages,
    });

    // canvas を明示的に破棄してメモリを解放
    canvas.width = 0;
    canvas.height = 0;
  }

  await worker.terminate();

  onProgress?.({ stage: "OCR完了", percent: 100 });

  return pageTexts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * OCR テキストのノイズを除去。
 * - 日本語車番認識精度を高めるための後処理
 */
function cleanOcrText(raw: string): string {
  return (
    raw
      // 誤認識されやすい全角スペースを半角スペースに
      .replace(/　/g, " ")
      // 連続する空白を1つに
      .replace(/ {2,}/g, " ")
      // ゴミのような1文字行は除去
      .replace(/^\s*[|｜ー－—]\s*$/gm, "")
      .trim()
  );
}
