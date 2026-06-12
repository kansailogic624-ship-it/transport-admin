"use client";

import { useCallback, useState } from "react";
import { FileJson, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { parsePreprocessedJsonFile } from "@/lib/preprocessed-json-import/parse-preview";
import type {
  PreprocessedJsonImportDiff,
  PreprocessedJsonImportPreview,
} from "@/lib/preprocessed-json-import/types";

/**
 * 前処理済みJSON取込（設計・プレビューのみ）
 * Firestore 保存は未実装 — 確定ボタンは準備中表示
 */
export function PreprocessedJsonImportPanel() {
  const [preview, setPreview] = useState<PreprocessedJsonImportPreview | null>(
    null,
  );
  const [diff, setDiff] = useState<PreprocessedJsonImportDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const result = parsePreprocessedJsonFile(text, file.name);
      setPreview(result.preview);
      setDiff(result.diff);
    } catch (e) {
      setPreview(null);
      setDiff(null);
      setError(e instanceof Error ? e.message : "JSONの読み込みに失敗しました");
    }
  }, []);

  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileJson className="size-5 text-emerald-700" />
          前処理済みJSON取込
        </CardTitle>
        <CardDescription>
          データ前処理タブで出力したJSONを読み込み、差分確認後に確定反映します（設計段階）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/50">
            <Upload className="size-4" />
            JSONファイルを選択
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {fileName && (
            <p className="mt-2 text-xs text-muted-foreground">{fileName}</p>
          )}
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {preview && diff && (
          <div className="space-y-3 rounded-md border bg-background p-4 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">
              <Row label="データ種別" value={preview.sourceLabel} />
              <Row label="読込レコード" value={`${preview.recordCount} 件`} />
              <Row label="反映候補" value={`${preview.exportableCount} 件`} />
              <Row label="スキップ" value={`${diff.skipped} 件`} />
              <Row label="新規追加候補" value={`${diff.newRecords} 件`} />
              <Row
                label="更新候補"
                value={`${diff.updateCandidates} 件（未実装）`}
              />
            </dl>
            <p className="text-xs text-muted-foreground">
              schemaVersion: {preview.payload.schemaVersion} / 出力日時:{" "}
              {preview.payload.createdAt}
            </p>
          </div>
        )}

        <Button type="button" disabled className="gap-2">
          確定して Firestore に反映（準備中）
        </Button>
        <p className="text-xs text-muted-foreground">
          ※ 本体取込の確定保存は今後このボタンのみから行います。日次入力の直接取込は廃止方向です。
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
