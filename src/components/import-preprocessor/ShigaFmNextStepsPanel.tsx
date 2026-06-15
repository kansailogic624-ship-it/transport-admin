"use client";

import { ArrowRight, FileSpreadsheet, FileText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ShigaFmReconciliationResult } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import { FM_SHORTAGE_EXPLANATION } from "@/lib/shiga-fm/fm-shortage-ui-messages";

type ShigaFmNextStepsPanelProps = {
  result: ShigaFmReconciliationResult | null;
  paymentContractGapCount: number;
  billingContractGapCount: number;
  onGoToAssignments: () => void;
  onGoToPaymentContracts: () => void;
  onGoToBillingContracts: () => void;
  onGoToDetails: () => void;
};

export function ShigaFmNextStepsPanel({
  result,
  paymentContractGapCount,
  billingContractGapCount,
  onGoToAssignments,
  onGoToPaymentContracts,
  onGoToBillingContracts,
  onGoToDetails,
}: ShigaFmNextStepsPanelProps) {
  if (!result || result.inputMode !== "both") return null;

  const fmShortage = result.totals.fmShortageCount;
  const unregistered = result.totals.unregisteredCount;
  const needsInput = fmShortage + unregistered;

  return (
    <Card className="border-violet-200 bg-violet-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">次にやること</CardTitle>
        <CardDescription>突合後のおすすめ操作です</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {fmShortage > 0 && (
          <p className="rounded-lg border border-orange-200 bg-orange-50/80 px-3 py-2 text-xs text-orange-950">
            {FM_SHORTAGE_EXPLANATION}
          </p>
        )}
        {paymentContractGapCount > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
            「支払契約を登録する」は FM突合済み傭車行の単価未登録向けです。契約登録済みでも FM不足行は自動確定しません。
          </p>
        )}
        <div className="flex flex-wrap gap-2">
        {needsInput > 0 && (
          <Button
            type="button"
            className="gap-1 bg-orange-600 hover:bg-orange-700"
            onClick={onGoToAssignments}
          >
            <Users className="size-4" />
            傭車・アルバイト入力へ進む
            <span className="ml-1 rounded-full bg-white/20 px-1.5 text-xs">
              {needsInput}
            </span>
            <ArrowRight className="size-4" />
          </Button>
        )}
        {paymentContractGapCount > 0 && (
          <Button
            type="button"
            variant="outline"
            className="gap-1 border-amber-400 text-amber-900"
            onClick={onGoToPaymentContracts}
          >
            <FileText className="size-4" />
            支払契約を登録する
            <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs">
              {paymentContractGapCount}
            </span>
            <ArrowRight className="size-4" />
          </Button>
        )}
        {billingContractGapCount > 0 && (
          <Button
            type="button"
            variant="outline"
            className="gap-1 border-sky-400 text-sky-900"
            onClick={onGoToBillingContracts}
          >
            <FileText className="size-4" />
            請求契約を登録する
            <span className="ml-1 rounded-full bg-sky-100 px-1.5 text-xs">
              {billingContractGapCount}
            </span>
            <ArrowRight className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="gap-1"
          onClick={onGoToDetails}
        >
          <FileSpreadsheet className="size-4" />
          明細一覧を見る
          <ArrowRight className="size-4" />
        </Button>
        </div>
      </CardContent>
    </Card>
  );
}
