"use client";

import { useCallback, useState } from "react";
import { ClipboardList } from "lucide-react";
import { ImportDropZone } from "@/components/import-drop-zone";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { importRollCallFiles } from "@/lib/roll-call-import";
import type { DailyRecord, MasterData } from "@/lib/types";

type RollCallImportProps = {
  records: DailyRecord[];
  masters: MasterData;
  onRecordsChange: (records: DailyRecord[]) => void;
  onMastersChange: (masters: MasterData) => void;
};

export function RollCallImport({
  records,
  masters,
  onRecordsChange,
  onMastersChange,
}: RollCallImportProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [lastSummary, setLastSummary] = useState("");

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list).filter((f) =>
      /\.(xlsx|xls|csv)$/i.test(f.name),
    );
    if (incoming.length === 0) return;
    setPendingFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const merged = [...prev];
      for (const f of incoming) {
        if (!names.has(f.name)) merged.push(f);
      }
      return merged;
    });
    setMessages([]);
    setLastSummary("");
  }, []);

  const handleImport = async () => {
    if (pendingFiles.length === 0) return;
    setBusy(true);
    try {
      const result = await importRollCallFiles(
        pendingFiles,
        records,
        masters,
      );
      onRecordsChange(result.records);
      onMastersChange(result.masters);
      setMessages(result.messages);
      setLastSummary(
        `点呼取込完了: ${result.importedCount} ドライバー×日を更新`,
      );
      setPendingFiles([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex h-full min-h-[360px] flex-col border-sky-200/80 bg-sky-50/30 dark:border-sky-900 dark:bg-sky-950/20">
      <CardHeader className="shrink-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardList className="size-4 shrink-0 text-sky-700 dark:text-sky-400" />
          ① 点呼記録簿
        </CardTitle>
        <CardDescription className="text-xs leading-snug">
          出勤・退勤と日報ステータスを反映
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
        <ImportDropZone
          hint="Excel (.xlsx) 推奨・CSV可（複数可）"
          files={pendingFiles}
          onAdd={addFiles}
          onClear={() => setPendingFiles([])}
          accent="sky"
        />
        <div className="mt-auto space-y-2">
          <Button
            type="button"
            size="sm"
            className="h-9 w-full"
            disabled={pendingFiles.length === 0 || busy}
            onClick={handleImport}
          >
            {busy ? "取り込み中…" : "点呼記録簿を反映"}
          </Button>
          {lastSummary && (
            <p className="line-clamp-2 text-xs font-medium text-sky-900 dark:text-sky-200">
              {lastSummary}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
