"use client";

import { Fragment } from "react";
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
import type { PreprocessResult } from "@/lib/import-preprocessor";
import { OperationTypeBadge } from "./OperationTypeBadge";

type NormalizeResultTableProps = {
  result: PreprocessResult | null;
};

export function NormalizeResultTable({ result }: NormalizeResultTableProps) {
  if (!result || result.records.length === 0) return null;

  const rows = result.records.slice(0, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">6. 正規化結果</CardTitle>
        <CardDescription>元の値と正規化後の比較（最大20行）</CardDescription>
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>項目</TableHead>
              <TableHead>元</TableHead>
              <TableHead>正規化後</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <TableRow className="border-t-2 bg-muted/20">
                  <TableCell colSpan={3} className="py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">
                        行 {r.sourceRowNumber} — {r.businessDate}
                      </span>
                      <OperationTypeBadge type={r.operationType} />
                      {r.isManuallyEdited && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                          手修正済み
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                <NormRow
                  label="ドライバー"
                  original={r.driverNameOriginal}
                  normalized={r.driverNameNormalized}
                />
                <NormRow
                  label="実運送会社"
                  original={r.companyOriginal || "—"}
                  normalized={r.companyNormalized || "—"}
                />
                <NormRow
                  label="荷主"
                  original="Amazon"
                  normalized={r.shipperNameNormalized || "Amazon"}
                />
                <NormRow
                  label="区分"
                  original="—"
                  normalized={r.operationType}
                  isBadge
                  operationType={r.operationType}
                />
                <NormRow
                  label="車両"
                  original={r.vehicleNoOriginal || "—"}
                  normalized={r.vehicleNoNormalized || "—"}
                />
                <NormRow
                  label="業務"
                  original={r.jobNameOriginal || "—"}
                  normalized={r.jobNameNormalized || "—"}
                />
                <NormRow
                  label="便名"
                  original={r.routeNameOriginal || "—"}
                  normalized={r.routeNameNormalized || "—"}
                />
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NormRow({
  label,
  original,
  normalized,
  isBadge,
  operationType,
}: {
  label: string;
  original: string;
  normalized: string;
  isBadge?: boolean;
  operationType?: PreprocessResult["records"][number]["operationType"];
}) {
  const changed = original !== normalized && normalized !== "—";
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-muted-foreground">{original}</TableCell>
      <TableCell className={changed ? "font-medium text-indigo-800" : ""}>
        {isBadge && operationType ? (
          <OperationTypeBadge type={operationType} />
        ) : (
          normalized
        )}
      </TableCell>
    </TableRow>
  );
}
