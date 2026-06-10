"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildFusionImportDetailRows,
  buildImportDetailRows,
  countImportDetailRecords,
  hasImportLinkage,
} from "@/lib/import-history-detail";
import { importTypeLabel } from "@/lib/import-history";
import type { DailyRecord, ImportHistory } from "@/lib/types";

const HISTORY_TABLE_COL_COUNT = 5;

type ImportHistoryDetailPanelProps = {
  history: ImportHistory;
  records: DailyRecord[];
};

export function ImportHistoryDetailPanel({
  history,
  records,
}: ImportHistoryDetailPanelProps) {
  const isFusion = history.importType === "fusion";
  const detailRows = isFusion
    ? buildFusionImportDetailRows(history, records)
    : buildImportDetailRows(history, records);
  const { matchedRecords } = countImportDetailRecords(history, records);
  const linkage = hasImportLinkage(history);

  const scrollClass = "max-h-[300px] overflow-y-auto rounded-md border bg-card";

  return (
    <div className="animate-in fade-in-0 slide-in-from-top-1 border-t border-gray-200 bg-gray-50 px-4 py-3 duration-200 dark:border-border dark:bg-muted/30">
      <div className="mb-2 space-y-0.5">
        <h3 className="text-sm font-semibold">
          インポートデータ明細：{history.fileName}
        </h3>
        <p className="text-xs text-muted-foreground">
          {importTypeLabel(history.importType)} ／ 取込{" "}
          {history.successCount}件 ／ 紐づく日次レコード {matchedRecords}件 ／
          明細行 {detailRows.length}行
        </p>
      </div>

      {!linkage ? (
        <p className="text-sm text-muted-foreground">
          この履歴は取込時の紐づけ情報がないため、明細を表示できません。新しく取り込んだデータから明細確認が可能です。
        </p>
      ) : matchedRecords === 0 ? (
        <p className="text-sm text-muted-foreground">
          紐づく日次データが見つかりません。削除済みか、別の取込で上書きされた可能性があります。
        </p>
      ) : detailRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          表示できる明細がありません。
        </p>
      ) : isFusion ? (
        <div className={scrollClass}>
          <Table className="w-full table-fixed">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[28%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className="px-2">日付</TableHead>
                <TableHead className="px-2">ドライバー名</TableHead>
                <TableHead className="px-2">荷主名</TableHead>
                <TableHead className="px-2 whitespace-normal">業務名</TableHead>
                <TableHead className="px-2 text-right">売上金額</TableHead>
                <TableHead className="px-2 text-right">件数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="px-2 text-sm">{row.date}</TableCell>
                  <TableCell className="px-2 text-sm whitespace-normal">
                    {row.driverName}
                  </TableCell>
                  <TableCell className="px-2 text-sm whitespace-normal">
                    {row.shipperName}
                  </TableCell>
                  <TableCell className="px-2 text-sm break-all whitespace-normal">
                    {row.jobName}
                  </TableCell>
                  <TableCell className="px-2 text-right text-sm tabular-nums">
                    {row.revenue}
                  </TableCell>
                  <TableCell className="px-2 text-right text-sm tabular-nums">
                    {row.dropCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className={scrollClass}>
          <Table className="w-full table-fixed">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className="px-2">日付</TableHead>
                <TableHead className="px-2">ドライバー名</TableHead>
                <TableHead className="px-2">車両番号</TableHead>
                <TableHead className="px-2">荷主名</TableHead>
                <TableHead className="px-2 whitespace-normal">業務名</TableHead>
                <TableHead className="px-2 text-right">売上</TableHead>
                <TableHead className="px-2 text-right">開始メーター</TableHead>
                <TableHead className="px-2 text-right">終了メーター</TableHead>
                <TableHead className="px-2 text-right">運行件数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="px-2 text-sm">{row.date}</TableCell>
                  <TableCell className="px-2 text-sm whitespace-normal">
                    {row.driverName}
                  </TableCell>
                  <TableCell className="px-2 text-sm whitespace-normal">
                    {row.vehicleNumber}
                  </TableCell>
                  <TableCell className="px-2 text-sm whitespace-normal">
                    {row.shipperName}
                  </TableCell>
                  <TableCell className="px-2 text-sm break-all whitespace-normal">
                    {row.jobName}
                  </TableCell>
                  <TableCell className="px-2 text-right text-sm tabular-nums">
                    {row.revenue}
                  </TableCell>
                  <TableCell className="px-2 text-right text-sm tabular-nums">
                    {row.startMeter}
                  </TableCell>
                  <TableCell className="px-2 text-right text-sm tabular-nums">
                    {row.endMeter}
                  </TableCell>
                  <TableCell className="px-2 text-right text-sm tabular-nums">
                    {row.dropCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export { HISTORY_TABLE_COL_COUNT };
