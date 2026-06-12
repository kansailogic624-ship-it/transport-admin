"use client";

import { MasterListCard } from "@/components/master-list-card";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  addShipperWithEmptyJobs,
  addUniqueToList,
  removeFromList,
  removeShipper,
} from "@/lib/masters";
import { PAGE_GRID_2COL_CLASS } from "@/lib/page-layout";
import type { MasterData } from "@/lib/types";
import { cn } from "@/lib/utils";

type PartnerLedgerViewProps = {
  masters: MasterData;
  onMastersChange: (masters: MasterData) => void;
  className?: string;
};

export function PartnerLedgerView({
  masters,
  onMastersChange,
  className,
}: PartnerLedgerViewProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <Card>
        <CardHeader>
          <CardTitle>取引先台帳</CardTitle>
          <CardDescription>
            荷主と協力会社（傭車先）を管理します。日次入力のプルダウンに反映されます。
          </CardDescription>
        </CardHeader>
      </Card>

      <div className={PAGE_GRID_2COL_CLASS}>
        <MasterListCard
          title="荷主マスタ一覧"
          description="運行業務の荷主選択肢"
          placeholder="例: 株式会社ABC物流"
          searchPlaceholder="荷主名で検索..."
          items={masters.shippers}
          listMaxHeightClass="max-h-[min(60vh,28rem)]"
          onAdd={(name) =>
            onMastersChange(addShipperWithEmptyJobs(masters, name))
          }
          onRemove={(name) => onMastersChange(removeShipper(masters, name))}
        />

        <MasterListCard
          title="協力会社マスタ一覧"
          description="傭車運行で選択する協力会社名"
          placeholder="例: 〇〇運輸"
          searchPlaceholder="協力会社で検索..."
          items={masters.partners}
          listMaxHeightClass="max-h-[min(60vh,28rem)]"
          onAdd={(name) =>
            onMastersChange({
              ...masters,
              partners: addUniqueToList(masters.partners, name),
            })
          }
          onRemove={(name) =>
            onMastersChange({
              ...masters,
              partners: removeFromList(masters.partners, name),
            })
          }
        />
      </div>
    </div>
  );
}
