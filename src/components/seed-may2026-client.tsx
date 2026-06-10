"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { applyBackupToStorage } from "@/lib/backup";
import {
  countTrips,
  generateMay2026Sample,
  MAY2026_YEAR_MONTH,
} from "@/lib/seed-may2026";
import { loadRecords, saveMasters, saveRecords } from "@/lib/storage";

type SeedPageProps = {
  autoApply?: boolean;
};

export function SeedMay2026Client({ autoApply = false }: SeedPageProps) {
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const applySample = (mode: "replace" | "merge") => {
    try {
      const sample = generateMay2026Sample();
      if (mode === "replace") {
        applyBackupToStorage(sample);
      } else {
        const existing = loadRecords();
        const merged = [...sample.records, ...existing];
        saveRecords(merged);
        saveMasters(sample.masters);
      }
      const trips = countTrips(sample.records);
      setStatus("done");
      setMessage(
        `2026年5月度サンプルを投入しました（日次 ${sample.records.length} 件 / 業務 ${trips} 件）。月次集計タブで ${MAY2026_YEAR_MONTH} を選択してください。`,
      );
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "投入に失敗しました");
    }
  };

  useEffect(() => {
    if (autoApply && status === "idle") {
      applySample("replace");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApply]);

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>2026年5月度 サンプルデータ</CardTitle>
          <CardDescription>
            大西社長確認用のデモデータ（約30業務）を localStorage
            に投入します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "done" && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {message}
            </p>
          )}
          {status === "error" && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => applySample("replace")}>
              サンプルを投入（既存を置き換え）
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => applySample("merge")}
            >
              既存データに追加（マージ）
            </Button>
          </div>
          <Link
            href="/"
            className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-border bg-secondary px-2.5 text-sm font-medium hover:bg-secondary/80"
          >
            トップ画面へ
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
