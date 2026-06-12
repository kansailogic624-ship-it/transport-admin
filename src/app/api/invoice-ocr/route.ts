import { NextResponse } from "next/server";
import {
  FUEL_AI_USER_PREFIX,
  FUEL_INVOICE_EXTRACTION_PROMPT,
} from "@/lib/fuel-ocr-normalize";
import { OCR_INVOICE_EXTRACTION_PROMPT } from "@/lib/invoice-ocr-normalize";

export const runtime = "nodejs";

function stripJsonFromAiContent(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 503 },
    );
  }

  let body: { text?: string; mode?: string };
  try {
    body = (await request.json()) as { text?: string; mode?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const isFuel = body.mode === "fuel";
  const systemPrompt = isFuel
    ? FUEL_INVOICE_EXTRACTION_PROMPT
    : OCR_INVOICE_EXTRACTION_PROMPT;
  const userPrefix = isFuel
    ? FUEL_AI_USER_PREFIX
    : "以下は請求書PDFから抽出した生テキストです。JSONのみで返してください。\n\n";

  const model = process.env.OPENAI_INVOICE_MODEL ?? "gpt-4o-mini";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `${userPrefix}${text}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[invoice-ocr API] OpenAI error", res.status, errText);
      return NextResponse.json(
        { error: `AI request failed (${res.status})` },
        { status: 502 },
      );
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const rawContent = payload.choices?.[0]?.message?.content ?? "";
    const jsonStr = stripJsonFromAiContent(rawContent);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr) as unknown;
    } catch {
      console.error("[invoice-ocr API] JSON parse failed", rawContent.slice(0, 500));
      return NextResponse.json(
        { error: "AI returned invalid JSON" },
        { status: 502 },
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[invoice-ocr API] unexpected error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
