"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { formatYen } from "@/lib/currency-format";
import type {
  PreprocessOperationType,
  PreprocessResult,
} from "@/lib/import-preprocessor";
import { isActiveWarningRecord } from "@/lib/import-preprocessor/warning-status";
import { OperationTypeBadge } from "./OperationTypeBadge";

type ImportPreviewTableProps = {
  result: PreprocessResult | null;
  onEditRow: (recordId: string) => void;
};

type FilterType =
  | "all"
  | PreprocessOperationType
  | "warnings"
  | "duplicate";

export function ImportPreviewTable({
  result,
  onEditRow,
}: ImportPreviewTableProps) {
  const [filter, setFilter] = useState<FilterType>("all");

  const counts = useMemo(() => {
    if (!result) return { own: 0, partner: 0, unknown: 0, warnings: 0, duplicate: 0 };
    return result.records.reduce(
      (acc, r) => {
        acc[r.operationType]++;
        if (isActiveWarningRecord(r)) acc.warnings++;
        if (r.warnings.includes("重複候補")) acc.duplicate++;
        return acc;
      },
      { own: 0, partner: 0, unknown: 0, warnings: 0, duplicate: 0 },
    );
  }, [result]);

  const filtered = useMemo(() => {
    if (!result) return [];
    switch (filter) {
      case "all":
        return result.records;
      case "warnings":
        return result.records.filter(isActiveWarningRecord);
      case "duplicate":
        return result.records.filter((r) => r.warnings.includes("重複候補"));
      default:
        return result.records.filter((r) => r.operationType === filter);
    }
  }, [result, filter]);

  if (!result) return null;

  const isFm = result.sourceType === "filemaker_dispatch";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">5. 取込プレビュー</CardTitle>
        <CardDescription>
          {result.sourceFileName} — メモリ上のみ（Firestore 未保存）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={filter === "all"}
            label={`全件 ${result.records.length}`}
            onClick={() => setFilter("all")}
          />
          <FilterChip
            active={filter === "own"}
            label={`自社 ${counts.own}`}
            onClick={() => setFilter("own")}
            className="border-sky-300 text-sky-800"
          />
          <FilterChip
            active={filter === "partner"}
            label={`傭車 ${counts.partner}`}
            onClick={() => setFilter("partner")}
            className="border-violet-300 text-violet-800"
          />
          <FilterChip
            active={filter === "unknown"}
            label={`判定不明 ${counts.unknown}`}
            onClick={() => setFilter("unknown")}
            className="border-orange-300 text-orange-800"
          />
          <FilterChip
            active={filter === "warnings"}
            label={`警告あり ${counts.warnings}`}
            onClick={() => setFilter("warnings")}
            className="border-amber-300 text-amber-800"
          />
          <FilterChip
            active={filter === "duplicate"}
            label={`重複候補 ${counts.duplicate}`}
            onClick={() => setFilter("duplicate")}
            className="border-amber-400 text-amber-900"
          />
        </div>

        {filtered.length > 0 ? (
          <div className="max-h-[480px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/90">
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>区分</TableHead>
                  <TableHead>日付</TableHead>
                  <TableHead>ドライバー</TableHead>
                  {isFm && <TableHead>車両</TableHead>}
                  <TableHead>荷主</TableHead>
                  {isFm ? (
                    <TableHead>業務</TableHead>
                  ) : (
                    <TableHead>便名</TableHead>
                  )}
                  <TableHead className="text-right">売上</TableHead>
                  {isFm && (
                    <TableHead className="text-right">高速代</TableHead>
                  )}
                  {!isFm && (
                    <>
                      <TableHead>実運送会社</TableHead>
                      <TableHead className="text-right">支払</TableHead>
                    </>
                  )}
                  {isFm && (
                    <>
                      <TableHead>実運送会社</TableHead>
                      <TableHead>開始</TableHead>
                      <TableHead>終了</TableHead>
                    </>
                  )}
                  <TableHead>状態</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} className={rowStatusClass(row)}>
                    <TableCell>{row.sourceRowNumber}</TableCell>
                    <TableCell>
                      <OperationTypeBadge type={row.operationType} />
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {row.businessDate}
                    </TableCell>
                    <TableCell>{row.driverNameNormalized}</TableCell>
                    {isFm && (
                      <TableCell className="max-w-[100px] truncate">
                        {row.vehicleNoNormalized || "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      {row.shipperNameNormalized || (isFm ? "—" : "Amazon")}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate">
                      {row.jobNameNormalized || row.routeNameNormalized || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatYen(row.salesAmount ?? row.amount)}
                    </TableCell>
                    {isFm && (
                      <TableCell className="text-right tabular-nums">
                        {formatYen(row.tollFeeAmount ?? 0)}
                      </TableCell>
                    )}
                    {!isFm && (
                      <>
                        <TableCell className="max-w-[140px] truncate">
                          {row.companyNormalized || row.companyOriginal || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatYen(row.paymentAmount ?? row.cost)}
                        </TableCell>
                      </>
                    )}
                    {isFm && (
                      <>
                        <TableCell className="max-w-[120px] truncate">
                          {row.companyNormalized || row.companyOriginal || "—"}
                        </TableCell>
                        <TableCell className="tabular-nums whitespace-nowrap">
                          {row.startTime || row.timecardIn || "—"}
                        </TableCell>
                        <TableCell className="tabular-nums whitespace-nowrap">
                          {row.endTime || row.timecardOut || "—"}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      {row.errors.length > 0 ? (
                        <span className="text-xs font-medium text-red-700">エラー</span>
                      ) : row.warnings.length > 0 ? (
                        <span className="text-xs font-medium text-amber-700">警告</span>
                      ) : (
                        <span className="text-xs text-emerald-700">OK</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2"
                        onClick={() => onEditRow(row.id)}
                      >
                        <Pencil className="size-3.5" />
                        編集
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            フィルタに一致する行がありません。
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          表示: {filtered.length} 行（全 {result.records.length} 行）
        </p>
      </CardContent>
    </Card>
  );
}

function rowStatusClass(row: PreprocessResult["records"][number]): string {
  if (row.errors.length > 0) return "bg-red-50";
  if (row.warnings.length > 0) return "bg-yellow-50";
  if (row.isManuallyEdited) return "bg-amber-50/40";
  return "";
}

function FilterChip({
  active,
  label,
  onClick,
  className = "",
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : `bg-background ${className}`
      }`}
    >
      {label}
    </button>
  );
}
