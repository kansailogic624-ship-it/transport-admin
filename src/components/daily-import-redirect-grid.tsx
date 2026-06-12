"use client";

import type { ReactNode } from "react";
import { ArrowRight, ClipboardList, FileSpreadsheet, Package, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PreprocessSourceType } from "@/lib/import-preprocessor";

type RedirectItem = {
  id: PreprocessSourceType;
  title: string;
  description: string;
  icon: ReactNode;
  accent: string;
};

const ITEMS: RedirectItem[] = [
  {
    id: "roll_call",
    title: "点呼記録簿",
    description:
      "このデータはデータ前処理タブで確認・修正してから反映してください。",
    icon: <ClipboardList className="size-4 text-sky-700" />,
    accent: "border-sky-200 bg-sky-50/40",
  },
  {
    id: "filemaker_dispatch",
    title: "FM配車",
    description:
      "このデータはデータ前処理タブで確認・修正してから反映してください。",
    icon: <Truck className="size-4 text-amber-700" />,
    accent: "border-amber-200 bg-amber-50/40",
  },
  {
    id: "driving_report",
    title: "運転日報",
    description:
      "このデータはデータ前処理タブで確認・修正してから反映してください。",
    icon: <FileSpreadsheet className="size-4 text-indigo-700" />,
    accent: "border-indigo-200 bg-indigo-50/40",
  },
  {
    id: "amazon",
    title: "Amazon実績",
    description:
      "Amazon実績はデータ前処理タブでJSON/CSV化してください。日次入力には直接保存しません。",
    icon: <Package className="size-4 text-orange-700" />,
    accent: "border-orange-200 bg-orange-50/40",
  },
];

type DailyImportRedirectGridProps = {
  onGoToPreprocess: (sourceType: PreprocessSourceType) => void;
};

export function DailyImportRedirectGrid({
  onGoToPreprocess,
}: DailyImportRedirectGridProps) {
  return (
    <div className="mb-6 grid w-full grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {ITEMS.map((item) => (
        <Card
          key={item.id}
          className={`flex h-full min-h-[220px] flex-col ${item.accent}`}
        >
          <CardHeader className="shrink-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              {item.icon}
              {item.title}
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              {item.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto pt-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 w-full gap-1.5"
              onClick={() => onGoToPreprocess(item.id)}
            >
              データ前処理へ移動
              <ArrowRight className="size-3.5" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
