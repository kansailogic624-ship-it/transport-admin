"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  groupRecordsByCompanyOriginal,
  OPERATION_TYPE_LABELS,
  type PreprocessOperationType,
  type PreprocessResult,
} from "@/lib/import-preprocessor";
import { OperationTypeBadge } from "./OperationTypeBadge";

type BulkCompanyEditPanelProps = {
  result: PreprocessResult | null;
  onBulkApply: (
    companyOriginal: string,
    operationType: PreprocessOperationType,
    companyNormalized: string,
  ) => void;
  /** ReviewFixPanel 内に埋め込む場合 */
  embedded?: boolean;
};

export function BulkCompanyEditPanel({
  result,
  onBulkApply,
  embedded = false,
}: BulkCompanyEditPanelProps) {
  const groups = useMemo(
    () => (result ? groupRecordsByCompanyOriginal(result.records) : []),
    [result],
  );

  const [drafts, setDrafts] = useState<
    Record<string, { operationType: PreprocessOperationType; companyNormalized: string }>
  >({});

  if (!result || groups.length === 0) return null;

  const getDraft = (g: (typeof groups)[number]) => {
    const key = g.companyOriginal || "__empty__";
    return (
      drafts[key] ?? {
        operationType: g.dominantOperationType,
        companyNormalized: g.companyNormalized,
      }
    );
  };

  const table = (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>元会社名</TableHead>
              <TableHead className="text-right">件数</TableHead>
              <TableHead>現在の区分</TableHead>
              <TableHead>変更後区分</TableHead>
              <TableHead>正規化後会社名</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const key = g.companyOriginal || "__empty__";
              const draft = getDraft(g);
              const displayOriginal = g.companyOriginal || "（空欄 / Amazonのみ）";
              return (
                <TableRow key={key}>
                  <TableCell className="max-w-[200px] font-medium">
                    {displayOriginal}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {g.count}
                  </TableCell>
                  <TableCell>
                    <OperationTypeBadge type={g.dominantOperationType} />
                  </TableCell>
                  <TableCell>
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={draft.operationType}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [key]: {
                            ...draft,
                            operationType: e.target
                              .value as PreprocessOperationType,
                          },
                        }))
                      }
                    >
                      {(
                        Object.keys(OPERATION_TYPE_LABELS) as PreprocessOperationType[]
                      ).map((t) => (
                        <option key={t} value={t}>
                          {OPERATION_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8 text-xs"
                      value={draft.companyNormalized}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [key]: {
                            ...draft,
                            companyNormalized: e.target.value,
                          },
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onBulkApply(
                          g.companyOriginal,
                          draft.operationType,
                          draft.companyNormalized,
                        )
                      }
                    >
                      一括変更
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
  );

  if (embedded) {
    return <div className="overflow-auto">{table}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">会社名一括修正</CardTitle>
        <CardDescription>
          元会社名ごとに区分・正規化後会社名をまとめて変更（メモリのみ）
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-auto">{table}</CardContent>
    </Card>
  );
}
