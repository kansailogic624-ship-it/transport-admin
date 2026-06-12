/**
 * 請求書テキスト → AI JSON 抽出（クライアント）
 */

export type InvoiceAiExtractResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  skipped?: boolean;
};

/** 抽出テキストを AI API に渡し JSON を取得。失敗時は success: false（フォールバック用） */
export async function extractInvoiceWithAi(
  text: string,
): Promise<InvoiceAiExtractResult> {
  if (!text?.trim()) {
    return { success: false, error: "empty text" };
  }

  try {
    const res = await fetch("/api/invoice-ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 50000) }),
    });

    if (res.status === 503) {
      return { success: false, skipped: true, error: "AI not configured" };
    }

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        success: false,
        error: errBody.error ?? `HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as unknown;
    return { success: true, data };
  } catch (err) {
    console.error("[InvoiceOCR] AI API call failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
