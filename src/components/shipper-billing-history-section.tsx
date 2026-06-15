"use client";

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  courseLabel,
  filterShipperBillingHistory,
} from "@/lib/shipper-billing-form-utils";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import { cn } from "@/lib/utils";

type ShipperBillingHistorySectionProps = {
  shipperId: string;
  contracts: ShipperBillingContract[];
};

function scopeLabel(contract: ShipperBillingContract): string {
  const parts: string[] = [];
  if (contract.jobName) parts.push(contract.jobName);
  else parts.push("全業務");
  if (contract.courseId) parts.push(courseLabel(contract.courseId));
  else parts.push("全コース");
  return parts.join(" / ");
}

export function ShipperBillingHistorySection({
  shipperId,
  contracts,
}: ShipperBillingHistorySectionProps) {
  const history = useMemo(
    () => filterShipperBillingHistory(contracts, shipperId),
    [contracts, shipperId],
  );

  return (
    <section
      id="shipper-section-history"
      className="space-y-4 rounded-lg border p-4"
    >
      <h3 className="text-base font-semibold">4. 請求契約履歴</h3>
      <p className="text-xs text-muted-foreground">
        改定時は古い契約を残し、適用終了日を設定します。
      </p>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">契約履歴はありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>適用範囲</TableHead>
                <TableHead className="text-right">運賃請求率</TableHead>
                <TableHead className="text-right">高速請求率</TableHead>
                <TableHead>適用期間</TableHead>
                <TableHead>状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((c) => (
                <TableRow
                  key={c.id}
                  className={cn(!c.activeFlag && "opacity-60")}
                >
                  <TableCell className="text-xs">{scopeLabel(c)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Math.round(c.freightInvoiceRate * 10_000) / 100}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Math.round(c.tollInvoiceRate * 10_000) / 100}%
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {c.effectiveFrom} 〜 {c.effectiveTo ?? "現行"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        c.activeFlag
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {c.activeFlag ? "有効" : "無効"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
