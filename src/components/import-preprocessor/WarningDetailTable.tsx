"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatYen } from "@/lib/currency-format";
import type { PreprocessWarningDetailRow } from "@/lib/import-preprocessor/types";
import type { PreprocessWarningStatus } from "@/lib/import-preprocessor";

type WarningDetailTableProps = {
  rows: PreprocessWarningDetailRow[];
  compact?: boolean;
  onSetStatus: (recordIds: string[], status: PreprocessWarningStatus) => void;
  onEditRow?: (recordId: string) => void;
};

export function WarningDetailTable({
  rows,
  compact = false,
  onSetStatus,
  onEditRow,
}: WarningDetailTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const uniqueRecordIds = useMemo(
    () => [...new Set(rows.map((r) => r.recordId))],
    [rows],
  );

  if (rows.length === 0) return null;

  const allSelected =
    uniqueRecordIds.length > 0 &&
    uniqueRecordIds.every((id) => selectedIds.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(uniqueRecordIds));
    }
  };

  const toggleOne = (recordId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const applyBulk = (status: PreprocessWarningStatus) => {
    if (selectedIds.size === 0) return;
    onSetStatus([...selectedIds], status);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selectedIds.size === 0}
          onClick={() => applyBulk("confirmed_duplicate")}
        >
          重複として除外
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selectedIds.size === 0}
          onClick={() => applyBulk("confirmed_valid")}
        >
          問題なし
        </Button>
        {selectedIds.size > 0 && (
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} 件選択中
          </span>
        )}
      </div>

      <div
        className={`overflow-auto rounded-md border border-amber-200 bg-amber-50/30 ${
          compact ? "max-h-64" : "max-h-[28rem]"
        }`}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-amber-100/90">
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="すべて選択"
                />
              </TableHead>
              <TableHead>行番号</TableHead>
              <TableHead>日付</TableHead>
              <TableHead>ドライバー</TableHead>
              <TableHead>会社名</TableHead>
              <TableHead>便名</TableHead>
              <TableHead className="text-right">金額</TableHead>
              <TableHead>警告理由</TableHead>
              <TableHead className="min-w-[280px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.recordId}-${row.warningReason}-${index}`}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.recordId)}
                    onChange={() => toggleOne(row.recordId)}
                    aria-label={`行${row.sourceRowNumber}を選択`}
                  />
                </TableCell>
                <TableCell className="tabular-nums">{row.sourceRowNumber}</TableCell>
                <TableCell className="tabular-nums whitespace-nowrap">
                  {row.businessDate || "—"}
                </TableCell>
                <TableCell>{row.driverName || "—"}</TableCell>
                <TableCell className="max-w-[140px] truncate">
                  {row.companyName || "—"}
                </TableCell>
                <TableCell>{row.routeName || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatYen(row.salesAmount)}
                </TableCell>
                <TableCell className="text-amber-900">{row.warningReason}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {onEditRow && (
                      <ActionButton
                        label="編集"
                        onClick={() => onEditRow(row.recordId)}
                      />
                    )}
                    <ActionButton
                      label="問題なし"
                      onClick={() =>
                        onSetStatus([row.recordId], "confirmed_valid")
                      }
                    />
                    <ActionButton
                      label="重複として除外"
                      onClick={() =>
                        onSetStatus([row.recordId], "confirmed_duplicate")
                      }
                    />
                    <ActionButton
                      label="保留"
                      variant="ghost"
                      onClick={() => onSetStatus([row.recordId], "pending")}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  variant = "outline",
}: {
  label: string;
  onClick: () => void;
  variant?: "outline" | "ghost";
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      className="h-7 px-2 text-xs"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
