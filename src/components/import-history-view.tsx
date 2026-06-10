"use client";

import { Fragment, useCallback, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  HISTORY_TABLE_COL_COUNT,
  ImportHistoryDetailPanel,
} from "@/components/import-history-detail-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasImportLinkage } from "@/lib/import-history-detail";
import {
  formatImportStatus,
  importTypeLabel,
  loadImportHistory,
  rollbackImportBatch,
} from "@/lib/import-history";
import type { DailyRecord, ImportHistory } from "@/lib/types";

type ImportHistoryViewProps = {
  records: DailyRecord[];
  onRecordsChange: (records: DailyRecord[]) => void;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${min}`;
}

const DELETE_CONFIRM_MESSAGE =
  "このインポートデータを削除すると、この時に取り込まれた売上・運行実績データも同時に消去されます。よろしいですか？";

export function ImportHistoryView({
  records,
  onRecordsChange,
}: ImportHistoryViewProps) {
  const [history, setHistory] = useState<ImportHistory[]>(() =>
    loadImportHistory(),
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(
    null,
  );

  const refresh = useCallback(() => {
    setHistory(loadImportHistory());
  }, []);

  const handleSelectHistory = useCallback((importId: string) => {
    setSelectedHistoryId((prev) => (prev === importId ? null : importId));
  }, []);

  const handleDeleteImport = useCallback(
    (importId: string) => {
      const row = history.find((h) => h.id === importId);
      if (!row) {
        setFeedback("指定の履歴が見つかりませんでした。");
        refresh();
        return;
      }

      const legacy = !hasImportLinkage(row);
      const message = legacy
        ? `${DELETE_CONFIRM_MESSAGE}\n\n※この履歴は取込時の紐づけ情報がないため、日次データは削除されず履歴行のみ削除されます。`
        : DELETE_CONFIRM_MESSAGE;

      if (!confirm(message)) return;

      const {
        records: nextRecords,
        removedRecordCount,
        history: removed,
      } = rollbackImportBatch(importId, records);

      if (!removed) {
        setFeedback("指定の履歴が見つかりませんでした。");
        refresh();
        return;
      }

      onRecordsChange(nextRecords);
      refresh();
      setSelectedHistoryId((prev) => (prev === importId ? null : prev));

      if (legacy) {
        setFeedback(
          "履歴を削除しました（紐づけ情報がないため日次データは変更していません）。",
        );
      } else if (removedRecordCount === 0) {
        setFeedback(
          "履歴を削除しました。対象の日次データは既に存在しないか、別の取込で上書き済みの可能性があります。",
        );
      } else {
        setFeedback(
          `取込を取り消しました。日次データ ${removedRecordCount} 件を削除しました。`,
        );
      }
    },
    [history, records, onRecordsChange, refresh],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>インポート履歴</CardTitle>
            <CardDescription>
              過去のファイル取込状況の確認と、誤取込時の一括取消（このPCのブラウザに保存）
            </CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={refresh}>
            再読込
          </Button>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          {feedback && (
            <p className="mb-3 px-6 text-sm text-muted-foreground">{feedback}</p>
          )}
          {history.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              まだインポート履歴はありません。
            </p>
          ) : (
            <div className="w-full px-2 [&_[data-slot=table-container]]:overflow-x-hidden">
              <Table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[38%]" />
                  <col className="w-[14%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-2">取込日時</TableHead>
                    <TableHead className="px-2">データの種類</TableHead>
                    <TableHead className="max-w-md px-2 whitespace-normal">
                      ファイル名
                    </TableHead>
                    <TableHead className="px-2">件数・ステータス</TableHead>
                    <TableHead className="w-28 min-w-28 px-2 text-right">
                      操作
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((row) => {
                    const isSelected = selectedHistoryId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className={cn(
                            "cursor-pointer hover:bg-gray-50 dark:hover:bg-muted/50",
                            isSelected && "bg-gray-50 dark:bg-muted/50",
                          )}
                          onClick={() => handleSelectHistory(row.id)}
                          aria-expanded={isSelected}
                        >
                          <TableCell className="px-2 text-sm">
                            {formatDateTime(row.importDateTime)}
                          </TableCell>
                          <TableCell className="px-2 text-sm whitespace-normal">
                            {importTypeLabel(row.importType)}
                          </TableCell>
                          <TableCell
                            className="max-w-md px-2 text-sm break-all whitespace-normal"
                            title={row.fileName}
                          >
                            {row.fileName}
                          </TableCell>
                          <TableCell className="px-2 text-sm whitespace-normal">
                            {formatImportStatus(row)}
                          </TableCell>
                          <TableCell className="w-28 min-w-28 px-2 text-right">
                            <button
                              type="button"
                              className="inline-flex shrink-0 items-center gap-1 rounded bg-red-50 px-3 py-1 text-sm text-red-600 hover:bg-red-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteImport(row.id);
                              }}
                            >
                              <Trash2
                                className="size-3.5 shrink-0"
                                aria-hidden
                              />
                              削除
                            </button>
                          </TableCell>
                        </TableRow>
                        {isSelected && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell
                              colSpan={HISTORY_TABLE_COL_COUNT}
                              className="p-0 align-top whitespace-normal"
                            >
                              <ImportHistoryDetailPanel
                                history={row}
                                records={records}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
