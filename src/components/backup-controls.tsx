"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HardDriveDownload, HardDriveUpload, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  applyBackupToStorageAsync,
  downloadBackupJson,
  parseBackupFile,
} from "@/lib/backup";
import type { DailyRecord, MasterData } from "@/lib/types";

type BackupControlsProps = {
  records: DailyRecord[];
  masters: MasterData;
  onRestore: (records: DailyRecord[], masters: MasterData) => void;
  compact?: boolean;
};

export function BackupControls({
  records,
  masters,
  onRestore,
  compact = false,
}: BackupControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dropOver, setDropOver] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [storageLabel, setStorageLabel] = useState<string>("");

  // 既に AppShell が保持している件数を表示（Firestore 再読込しない）
  useEffect(() => {
    setStorageLabel(
      `${records.length.toLocaleString()} 件 / Firestore（クラウド）`,
    );
  }, [records.length]);

  const handleExport = () => {
    downloadBackupJson(records, masters);
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  /** ファイル（File オブジェクト）を受け取って復元処理を実行 */
  const restoreFromFile = useCallback(
    async (file: File) => {
      setRestoring(true);
      try {
        const text = await file.text();
        const backup = parseBackupFile(text);

        const ok = confirm(
          `バックアップ（${backup.exportedAt.slice(0, 10)} 作成）で、現在のデータを上書き復元します。\n` +
            `・日次記録: ${backup.records.length} 件\n` +
            `・ドライバー: ${backup.masters.drivers.length} 名\n\n` +
            `よろしいですか？この操作は取り消せません。`,
        );
        if (!ok) return;

        // IndexedDB に書き込み → AppShell の onRestore で React state も更新
        await applyBackupToStorageAsync(backup);
        onRestore(backup.records, backup.masters);
        alert("復元が完了しました。");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "不明なエラーが発生しました。";
        alert(`復元に失敗しました: ${message}`);
      } finally {
        setRestoring(false);
      }
    },
    [onRestore],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await restoreFromFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) =>
      /\.json$/i.test(f.name),
    );
    if (!file) {
      alert("JSON ファイルをドロップしてください。");
      return;
    }
    await restoreFromFile(file);
  };

  const buttons = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={handleExport}>
          <HardDriveDownload className="size-4" />
          バックアップ（保存）
        </Button>
      </div>

      {/* ドラッグ＆ドロップ復元エリア */}
      <div
        role="button"
        tabIndex={0}
        aria-label="バックアップファイルをドロップして復元"
        onDragOver={(e) => {
          e.preventDefault();
          setDropOver(true);
        }}
        onDragLeave={() => setDropOver(false)}
        onDrop={handleDrop}
        onClick={handleRestoreClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleRestoreClick();
        }}
        className={`flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-3 text-center text-sm transition-colors
          ${
            dropOver
              ? "border-primary bg-primary/5 text-primary"
              : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
          }
          ${restoring ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <HardDriveUpload className="size-5" />
        <span className="text-xs">
          {restoring
            ? "復元中…"
            : "バックアップ JSON をここにドロップ（またはクリック）して復元"}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">データのバックアップ</p>
          {storageLabel && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <HardDrive className="size-3" />
              ストレージ: {storageLabel}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          全データを JSON で保存・復元（PC 移行・消失対策）
        </p>
        {buttons}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-lg">
          <span>システムデータのバックアップ</span>
          {storageLabel && (
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <HardDrive className="size-3.5" />
              ストレージ: {storageLabel}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          日次記録とマスタを JSON ファイルに保存します。別 PC・ブラウザへ移すときや
          データ消失の保険としてご利用ください。
          復元は JSON ファイルをドロップするだけで完了します。
        </CardDescription>
      </CardHeader>
      <CardContent>{buttons}</CardContent>
    </Card>
  );
}
