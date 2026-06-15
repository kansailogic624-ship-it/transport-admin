"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Pencil } from "lucide-react";
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
import { SHIGA_FM_SLOT_ASSIGNMENT_TYPE_LABELS } from "@/lib/import-preprocessor/shiga-fm-reconciliation/slot-assignment-types";
import type { ShigaFmSlotAssignment } from "@/lib/import-preprocessor/shiga-fm-reconciliation/slot-assignment-types";
import type { ShigaFmReconciliationResult } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import { FM_SHORTAGE_EXPLANATION } from "@/lib/shiga-fm/fm-shortage-ui-messages";
import { cn } from "@/lib/utils";

import type { MasterData } from "@/lib/types";

type ShigaFmSlotAssignmentPanelProps = {
  result: ShigaFmReconciliationResult | null;
  assignments: ShigaFmSlotAssignment[];
  masters?: MasterData | null;
  onOpenAssignment: (slotKey: string) => void;
};

type SlotRowView = {
  slotKey: string;
  rowId: string;
  businessDate: string;
  courseName: string;
  slotLabel: string;
  jobName: string;
  status: "pending" | "filled";
  assignmentTypeLabel: string | null;
  salesAmount: number;
  paymentAmount: number;
};

export function ShigaFmSlotAssignmentPanel({
  result,
  assignments,
  masters: _masters,
  onOpenAssignment,
}: ShigaFmSlotAssignmentPanelProps) {
  const assignmentMap = useMemo(
    () => new Map(assignments.map((a) => [a.slotKey, a])),
    [assignments],
  );

  const slotRows = useMemo((): SlotRowView[] => {
    if (!result || result.inputMode !== "both") return [];
    return result.rows
      .filter(
        (r) =>
          r.status === "unregistered" ||
          r.status === "fm_shortage" ||
          r.assignmentId != null ||
          assignmentMap.has(r.slotKey),
      )
      .map((r) => {
        const assignment = assignmentMap.get(r.slotKey);
        const filled = Boolean(assignment) || r.assignmentId != null;
        return {
          slotKey: r.slotKey,
          rowId: r.id,
          businessDate: r.businessDate,
          courseName: r.courseName ?? "—",
          slotLabel:
            r.unitCount > 1
              ? `${r.slotIndex}/${r.unitCount}`
              : "1/1",
          jobName: r.jobName,
          status: (filled ? "filled" : "pending") as "pending" | "filled",
          assignmentTypeLabel: assignment
            ? SHIGA_FM_SLOT_ASSIGNMENT_TYPE_LABELS[assignment.assignmentType]
            : r.assignmentId
              ? "入力済み"
              : null,
          salesAmount: r.salesAmount,
          paymentAmount: r.paymentAmount,
        };
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
        const d = a.businessDate.localeCompare(b.businessDate);
        if (d !== 0) return d;
        return a.courseName.localeCompare(b.courseName, "ja");
      });
  }, [result, assignmentMap]);

  const pendingCount = slotRows.filter((r) => r.status === "pending").length;
  const filledCount = slotRows.filter((r) => r.status === "filled").length;
  const unregisteredTotal = result?.totals.unregisteredCount ?? 0;
  const fmShortageTotal = result?.totals.fmShortageCount ?? 0;
  const needsInputTotal = unregisteredTotal + fmShortageTotal;

  if (!result) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          先に「突合を実行」してください。未登録スロットがここに表示されます。
        </CardContent>
      </Card>
    );
  }

  if (result.inputMode !== "both") {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-amber-900">
          滋賀店配とFMの両方を取込んだ状態で突合を実行すると、未登録スロットの入力ができます。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {fmShortageTotal > 0 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50/80 px-4 py-3 text-sm text-orange-950">
          {FM_SHORTAGE_EXPLANATION}
        </div>
      )}
      <div
        className={cn(
          "rounded-xl border px-4 py-4",
          needsInputTotal > 0
            ? "border-orange-400 bg-orange-100/70"
            : "border-emerald-300 bg-emerald-50/60",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              未登録スロット
            </p>
            <p
              className={cn(
                "text-3xl font-bold tabular-nums",
                needsInputTotal > 0 ? "text-orange-950" : "text-emerald-800",
              )}
            >
              {needsInputTotal} 件
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">未入力</p>
              <p className="font-semibold text-orange-800">{pendingCount}</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">入力済み</p>
              <p className="font-semibold text-emerald-800">{filledCount}</p>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">未登録スロット一覧</CardTitle>
          <CardDescription>
            FMに未登録の台数分を表示します。「入力する」から傭車・アルバイト・自社社員を指定してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {slotRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              未登録スロットはありません。
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs">
                  <tr>
                    <th className="px-3 py-2">状態</th>
                    <th className="px-3 py-2">日付</th>
                    <th className="px-3 py-2">コース</th>
                    <th className="px-3 py-2">スロット</th>
                    <th className="px-3 py-2">業務</th>
                    <th className="px-3 py-2">入力種別</th>
                    <th className="px-3 py-2 text-right">売上</th>
                    <th className="px-3 py-2 text-right">支払</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {slotRows.map((slot) => (
                    <tr
                      key={slot.slotKey}
                      className={cn(
                        "border-t",
                        slot.status === "pending"
                          ? "bg-orange-50/60"
                          : "bg-emerald-50/30",
                      )}
                    >
                      <td className="px-3 py-2">
                        {slot.status === "pending" ? (
                          <Badge
                            variant="destructive"
                            className="gap-1 bg-orange-600"
                          >
                            <AlertCircle className="size-3" />
                            未入力
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 border-emerald-400 text-emerald-800"
                          >
                            <CheckCircle2 className="size-3" />
                            入力済
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDisplayDate(slot.businessDate)}
                      </td>
                      <td className="px-3 py-2">{slot.courseName}</td>
                      <td className="px-3 py-2">{slot.slotLabel}</td>
                      <td className="px-3 py-2">{slot.jobName}</td>
                      <td className="px-3 py-2">
                        {slot.assignmentTypeLabel ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatYen(slot.salesAmount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatYen(slot.paymentAmount)}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            slot.status === "pending" ? "default" : "outline"
                          }
                          className={cn(
                            "gap-1",
                            slot.status === "pending" &&
                              "bg-orange-600 hover:bg-orange-700",
                          )}
                          onClick={() => onOpenAssignment(slot.slotKey)}
                        >
                          <Pencil className="size-3.5" />
                          {slot.status === "pending" ? "入力する" : "修正する"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
