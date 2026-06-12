"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatYen } from "@/lib/currency-format";
import { buildDuplicateGroupDetails } from "@/lib/import-preprocessor/duplicate-groups";
import type {
  PreprocessResult,
  PreprocessWarningStatus,
} from "@/lib/import-preprocessor";

type DuplicateGroupsTabProps = {
  result: PreprocessResult;
  onSetWarningStatus: (
    recordIds: string[],
    status: PreprocessWarningStatus,
  ) => void;
};

export function DuplicateGroupsTab({
  result,
  onSetWarningStatus,
}: DuplicateGroupsTabProps) {
  const groups = useMemo(
    () => buildDuplicateGroupDetails(result.records),
    [result.records],
  );
  const [keepers, setKeepers] = useState<Record<number, string>>({});

  const handleKeepBoth = (groupId: number, recordIds: string[]) => {
    console.log("Keep both clicked", groupId, recordIds);
    onSetWarningStatus(recordIds, "confirmed_valid");
  };

  const handleKeepOneExcludeOthers = (
    groupId: number,
    keeperId: string,
    recordIds: string[],
  ) => {
    console.log("Keep one clicked", groupId, keeperId, recordIds);
    const excludeIds = recordIds.filter((id) => id !== keeperId);
    if (excludeIds.length > 0) {
      onSetWarningStatus(excludeIds, "confirmed_duplicate");
    }
    if (keeperId) {
      onSetWarningStatus([keeperId], "confirmed_valid");
    }
  };

  const handlePending = (groupId: number, recordIds: string[]) => {
    console.log("Pending clicked", groupId, recordIds);
    onSetWarningStatus(recordIds, "pending");
  };

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        未処理の重複候補はありません。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const keeperId =
          keepers[group.groupIndex] ?? group.recordIds[0] ?? "";
        return (
          <div
            key={group.groupIndex}
            className="rounded-lg border border-amber-200 bg-amber-50/30 p-4"
          >
            <p className="font-medium text-amber-950">
              重複グループ {group.groupIndex}
            </p>
            <p className="mt-1 text-sm text-amber-900">{group.summaryLabel}</p>

            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                候補行
              </p>
              {group.records.map((record) => (
                <label
                  key={record.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name={`dup-group-${group.groupIndex}`}
                    checked={keeperId === record.id}
                    onChange={() =>
                      setKeepers((prev) => ({
                        ...prev,
                        [group.groupIndex]: record.id,
                      }))
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium tabular-nums">
                      {record.sourceRowNumber}行目
                    </span>
                    <span className="mx-2 text-muted-foreground">—</span>
                    {record.businessDate} / {record.driverNameNormalized} /{" "}
                    {record.companyNormalized || record.companyOriginal} /{" "}
                    {record.routeNameNormalized} /{" "}
                    {formatYen(record.salesAmount ?? record.amount)}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  handleKeepOneExcludeOthers(
                    group.groupIndex,
                    keeperId,
                    group.recordIds,
                  )
                }
              >
                片方を残してもう片方を除外
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  handleKeepBoth(group.groupIndex, group.recordIds)
                }
              >
                両方残す
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  handlePending(group.groupIndex, group.recordIds)
                }
              >
                保留
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
