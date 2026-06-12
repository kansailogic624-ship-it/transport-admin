/**
 * 燃料代請求書テキスト → AI JSON 抽出（クライアント）
 */

export type FuelAiExtractResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  skipped?: boolean;
};

/** 燃料代専用プロンプトで AI API を呼び出す */
export async function extractFuelWithAi(
  text: string,
): Promise<FuelAiExtractResult> {
  if (!text?.trim()) {
    return { success: false, error: "empty text" };
  }

  try {
    const res = await fetch("/api/invoice-ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 50000), mode: "fuel" }),
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
    console.error("[FuelOCR] AI API call failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
