"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatYen } from "@/lib/currency-format";
import { formatDisplayDate } from "@/lib/excel-date";
import { SHIGA_FM_COST_CATEGORY_LABELS } from "@/lib/import-preprocessor/shiga-fm-reconciliation/cost-classifier";
import {
  SHIGA_FM_MATCH_STATUS_LABELS,
  type ShigaFmInputMode,
  type ShigaFmMatchStatus,
  type ShigaFmReconciliationResult,
  type ShigaFmReconciliationRow,
} from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import {
  CONTRACT_REGISTERED_VS_CONFIRMED,
  FM_SHORTAGE_EXPLANATION,
} from "@/lib/shiga-fm/fm-shortage-ui-messages";
import { cn } from "@/lib/utils";

export type ShigaFmMatchFilter =
  | "all"
  | "mismatch"
  | "shiga_only"
  | "fm_only"
  | "matched";

type ShigaFmMatchReviewTableProps = {
  result: ShigaFmReconciliationResult | null;
  activeFilter?: ShigaFmMatchFilter;
  onFilterChange?: (filter: ShigaFmMatchFilter) => void;
  lastOpenedRowId?: string | null;
  onOpenDetail?: (rowId: string) => void;
  /** FM不足・未登録行から傭車入力ダイアログを直接開く */
  onOpenAssignment?: (slotKey: string) => void;
  /** 未突合・要確認タブ用: 一致以外をすべて表示 */
  issueMode?: boolean;
};

const FILTER_OPTIONS: { id: ShigaFmMatchFilter; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "matched", label: "一致" },
  { id: "mismatch", label: "不一致" },
  { id: "shiga_only", label: "滋賀のみ" },
  { id: "fm_only", label: "FMのみ" },
];

function rowNeedsAssignmentInput(row: ShigaFmReconciliationRow): boolean {
  return row.status === "fm_shortage" || row.status === "unregistered";
}

function isIssueRow(row: ShigaFmReconciliationRow): boolean {
  return row.status !== "matched" && row.status !== "matched_sum";
}

function matchesFilter(
  row: ShigaFmReconciliationRow,
  filter: ShigaFmMatchFilter,
  issueMode?: boolean,
): boolean {
  if (issueMode) return isIssueRow(row);
  if (filter === "all") return true;
  if (filter === "matched")
    return row.status === "matched" || row.status === "matched_sum";
  if (filter === "mismatch")
    return (
      row.status === "amount_mismatch" ||
      row.status === "mapping_failed" ||
      row.status === "unregistered" ||
      row.status === "fm_shortage"
    );
  if (filter === "shiga_only") return row.status === "shiga_only";
  if (filter === "fm_only") return row.status === "fm_only";
  return true;
}

function statusBadgeVariant(
  status: ShigaFmMatchStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "matched" || status === "matched_sum") return "outline";
  if (status === "unregistered" || status === "fm_shortage") return "destructive";
  if (status === "amount_mismatch" || status === "mapping_failed")
    return "destructive";
  return "secondary";
}

function formatAmount(
  amount: number,
  inputMode: ShigaFmInputMode,
  column: "sales" | "payment" | "profit",
): string {
  if (inputMode === "shiga_only" && (column === "sales" || column === "profit")) {
    return "—";
  }
  if (inputMode === "fm_only" && (column === "payment" || column === "profit")) {
    return "—";
  }
  return formatYen(amount);
}

function formatRate(
  rate: number | null,
  inputMode: ShigaFmInputMode,
): string {
  if (inputMode !== "both") return "—";
  return rate != null ? `${rate.toFixed(2)}%` : "—";
}

function primaryEmployee(row: ShigaFmReconciliationRow): string {
  return row.fmRecords[0]?.employeeNameOriginal ?? "—";
}

function formatNotes(row: ShigaFmReconciliationRow): string {
  return row.notes.join(" / ") || "—";
}

function rowHighlightClass(row: ShigaFmReconciliationRow): string {
  if (row.status === "unregistered" || row.status === "fm_shortage") {
    return "bg-orange-100/80 hover:bg-orange-100";
  }
  if (row.costCategory === "employee" && row.paymentAmount === 0) {
    return "bg-emerald-50/50 hover:bg-emerald-50";
  }
  return "hover:bg-indigo-50/60";
}

export function ShigaFmMatchReviewTable({
  result,
  activeFilter = "all",
  onFilterChange,
  lastOpenedRowId,
  onOpenDetail,
  onOpenAssignment,
  issueMode = false,
}: ShigaFmMatchReviewTableProps) {
  const [internalFilter, setInternalFilter] =
    useState<ShigaFmMatchFilter>("all");
  const filter = onFilterChange ? activeFilter : internalFilter;
  const setFilter = onFilterChange ?? setInternalFilter;

  const rows = useMemo(() => {
    if (!result) return [];
    return result.rows.filter((r) =>
      matchesFilter(r, filter, issueMode),
    );
  }, [result, filter, issueMode]);

  if (!result) return null;

  const inputMode = result.inputMode;
  const showEmployee = inputMode === "fm_only" || inputMode === "both";
  const showSlot = inputMode === "both";

  const title = issueMode
    ? "未突合・要確認一覧"
    : inputMode === "shiga_only"
      ? "滋賀店配明細一覧"
      : inputMode === "fm_only"
        ? "FMスケジュール明細一覧"
        : "突合明細一覧";

  const description = issueMode
    ? `一致以外の行（${rows.length} 件）`
    : inputMode === "shiga_only"
      ? `支払データを表示（FM未突合）— ${rows.length} 件${filter !== "all" ? "・フィルタ中" : ""}`
      : inputMode === "fm_only"
        ? `売上データを表示（滋賀店配未突合）— ${rows.length} 件${filter !== "all" ? "・フィルタ中" : ""}`
        : `行をクリックして突合根拠を確認（${rows.length} 件${filter !== "all" ? "・フィルタ中" : ""}）`;

  const showAssignmentAction =
    issueMode && inputMode === "both" && Boolean(onOpenAssignment);
  const fmShortageCount = rows.filter((r) => r.status === "fm_shortage").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {issueMode && fmShortageCount > 0 && (
          <div className="space-y-2 rounded-lg border border-orange-300 bg-orange-50/80 px-4 py-3 text-sm text-orange-950">
            <p>{FM_SHORTAGE_EXPLANATION}</p>
            <p className="text-xs text-orange-900/90">{CONTRACT_REGISTERED_VS_CONFIRMED}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!issueMode &&
            FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-indigo-50",
                filter === opt.id
                  ? "border-indigo-500 bg-indigo-100 text-indigo-950"
                  : "border-border bg-background text-foreground",
              )}
              onClick={() => setFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1400px] text-sm">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th className="px-2 py-2">日付</th>
                <th className="px-2 py-2">コース</th>
                {showSlot && <th className="px-2 py-2">スロット</th>}
                {showEmployee && <th className="px-2 py-2">社員</th>}
                <th className="px-2 py-2">業者</th>
                <th className="px-2 py-2">請求先</th>
                <th className="px-2 py-2">支払先</th>
                <th className="px-2 py-2">原価区分</th>
                <th className="px-2 py-2">契約種別</th>
                <th className="px-2 py-2 text-right">売上</th>
                <th className="px-2 py-2 text-right">支払</th>
                <th className="px-2 py-2 text-right">利益額</th>
                <th className="px-2 py-2 text-right">利益率</th>
                <th className="px-2 py-2">備考</th>
                <th className="px-2 py-2">状態</th>
                <th className="px-2 py-2">FM業務</th>
                {showAssignmentAction && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "cursor-pointer border-t transition-colors",
                    rowHighlightClass(row),
                    lastOpenedRowId === row.id && "ring-1 ring-inset ring-indigo-400",
                  )}
                  onClick={() => onOpenDetail?.(row.id)}
                >
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatDisplayDate(row.businessDate)}
                  </td>
                  <td className="px-2 py-2">{row.courseName ?? "—"}</td>
                  {showSlot && (
                    <td className="px-2 py-2 whitespace-nowrap text-xs">
                      {row.unitCount > 1
                        ? `${row.slotIndex}/${row.unitCount}`
                        : "1/1"}
                      <span className="ml-1 text-muted-foreground">
                        {row.jobName}
                      </span>
                    </td>
                  )}
                  {showEmployee && (
                    <td className="px-2 py-2">{primaryEmployee(row)}</td>
                  )}
                  <td className="px-2 py-2">{row.vendorName}</td>
                  <td className="px-2 py-2 text-xs">{row.billingParty}</td>
                  <td className="px-2 py-2 text-xs">{row.paymentParty}</td>
                  <td className="px-2 py-2 text-xs">
                    {SHIGA_FM_COST_CATEGORY_LABELS[row.costCategory]}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {row.contractTypeLabel ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatAmount(row.salesAmount, inputMode, "sales")}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right tabular-nums",
                      row.costCategory === "employee" &&
                        row.paymentAmount === 0 &&
                        inputMode === "both" &&
                        "font-semibold text-emerald-700",
                    )}
                  >
                    {row.costCategory === "employee" &&
                    row.paymentAmount === 0 &&
                    inputMode === "both"
                      ? "¥0"
                      : formatAmount(row.paymentAmount, inputMode, "payment")}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatAmount(row.grossProfitAmount, inputMode, "profit")}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatRate(row.grossProfitRate, inputMode)}
                  </td>
                  <td className="max-w-[180px] truncate px-2 py-2 text-xs text-muted-foreground">
                    {formatNotes(row)}
                  </td>
                  <td className="px-2 py-2">
                    <Badge variant={statusBadgeVariant(row.status)}>
                      {SHIGA_FM_MATCH_STATUS_LABELS[row.status]}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {row.fmJobNames.join(", ") || "—"}
                  </td>
                  {showAssignmentAction && (
                    <td className="px-2 py-2">
                      {rowNeedsAssignmentInput(row) ? (
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1 bg-orange-600 hover:bg-orange-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAssignment?.(row.slotKey);
                          }}
                        >
                          <Pencil className="size-3.5" />
                          入力する
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
