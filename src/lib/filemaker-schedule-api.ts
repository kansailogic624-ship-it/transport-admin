/**
 * FileMaker Data API — スケジュール取得（GET のみ）
 */

import {
  isFileMakerScheduleApiConfigured,
  resolveFileMakerScheduleLayout,
} from "./filemaker-schedule-config";

export type FileMakerApiRecord = {
  recordId: string;
  fieldData: Record<string, unknown>;
};

type FmApiMessage = { code: string; message: string };

function fmBaseUrl(): string {
  const host = process.env.FILEMAKER_HOST!.replace(/\/+$/, "");
  const db = encodeURIComponent(process.env.FILEMAKER_DATABASE!.trim());
  return `${host}/fmi/data/vLatest/databases/${db}`;
}

function basicAuthHeader(): string {
  const user = process.env.FILEMAKER_USERNAME!.trim();
  const pass = process.env.FILEMAKER_PASSWORD!.trim();
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

function firstFmMessage(messages: FmApiMessage[] | undefined): FmApiMessage {
  return messages?.[0] ?? { code: "-1", message: "FileMaker API: 不明なエラー" };
}

async function openFileMakerSession(): Promise<string> {
  const res = await fetch(`${fmBaseUrl()}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(),
    },
    body: "{}",
    cache: "no-store",
  });

  const token = res.headers.get("X-FM-Data-Access-Token");
  const json = (await res.json().catch(() => ({}))) as {
    messages?: FmApiMessage[];
  };
  const msg = firstFmMessage(json.messages);

  if (!res.ok || msg.code !== "0" || !token) {
    throw new Error(msg.message || `FileMakerセッション開始失敗 (${res.status})`);
  }
  return token;
}

async function closeFileMakerSession(token: string): Promise<void> {
  try {
    await fetch(`${fmBaseUrl()}/sessions/${token}`, {
      method: "DELETE",
      headers: { "X-FM-Data-Access-Token": token },
      cache: "no-store",
    });
  } catch (error) {
    console.error("[FileMaker] セッション終了エラー:", error);
  }
}

/** スケジュールレイアウトからレコードを取得（INSERT/UPDATE なし） */
export async function fetchFileMakerScheduleRecords(options?: {
  layout?: string;
  limit?: number;
}): Promise<FileMakerApiRecord[]> {
  if (!isFileMakerScheduleApiConfigured()) {
    return [];
  }

  const layout = resolveFileMakerScheduleLayout(options?.layout);
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 2000);
  const token = await openFileMakerSession();

  try {
    const layoutEnc = encodeURIComponent(layout);
    const res = await fetch(
      `${fmBaseUrl()}/layouts/${layoutEnc}/records?_limit=${limit}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-FM-Data-Access-Token": token,
        },
        cache: "no-store",
      },
    );

    const json = (await res.json().catch(() => ({}))) as {
      response?: { data?: FileMakerApiRecord[] };
      messages?: FmApiMessage[];
    };
    const msg = firstFmMessage(json.messages);

    if (!res.ok || msg.code !== "0") {
      throw new Error(msg.message || `FileMakerレコード取得失敗 (${res.status})`);
    }

    return json.response?.data ?? [];
  } finally {
    await closeFileMakerSession(token);
  }
}
