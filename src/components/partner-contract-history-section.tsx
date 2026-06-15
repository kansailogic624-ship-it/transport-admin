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
import { formatYen } from "@/lib/currency-format";
import { filterPartnerContractHistory } from "@/lib/partner-contract-form-utils";
import { TOLL_BILLING_METHOD_LABELS } from "@/lib/shiga-fm";
import type { PartnerPaymentContract } from "@/lib/shiga-fm/partner-payment-types";
import { cn } from "@/lib/utils";

type PartnerContractHistorySectionProps = {
  partnerId: string;
  contracts: PartnerPaymentContract[];
};

export function PartnerContractHistorySection({
  partnerId,
  contracts,
}: PartnerContractHistorySectionProps) {
  const history = useMemo(
    () => filterPartnerContractHistory(contracts, partnerId),
    [contracts, partnerId],
  );

  return (
    <section
      id="partner-section-history"
      className="space-y-4 rounded-lg border p-4"
    >
      <h3 className="text-base font-semibold">5. 支払契約履歴</h3>
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
                <TableHead>コース</TableHead>
                <TableHead className="text-right">基本</TableHead>
                <TableHead className="text-right">残業/h</TableHead>
                <TableHead>高速</TableHead>
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
                  <TableCell>{c.courseName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatYen(c.baseUnitPrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatYen(c.overtimeUnitPrice)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {TOLL_BILLING_METHOD_LABELS[c.tollBillingMethod]}
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
