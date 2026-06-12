"use client";

import { Download, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  canExportPreprocessResult,
  downloadPreprocessCsv,
  downloadPreprocessJson,
  type PreprocessResult,
} from "@/lib/import-preprocessor";

type ExportButtonsProps = {
  result: PreprocessResult | null;
};

export function ExportButtons({ result }: ExportButtonsProps) {
  const canExport = canExportPreprocessResult(result);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">7. JSON/CSV出力</CardTitle>
        <CardDescription>
          Firestore へは保存しません。JSON / CSV をダウンロードして本体へ取り込みます。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          className="gap-2"
          disabled={!canExport}
          onClick={() => result && downloadPreprocessJson(result)}
        >
          <FileJson className="size-4" />
          統合JSON出力
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={!canExport}
          onClick={() => result && downloadPreprocessCsv(result)}
        >
          <Download className="size-4" />
          統合CSV出力
        </Button>
      </CardContent>
    </Card>
  );
}
