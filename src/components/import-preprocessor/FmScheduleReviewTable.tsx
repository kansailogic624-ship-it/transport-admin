"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  FM_SCHEDULE_INFO_LABELS,
  FM_SCHEDULE_WARNING_LABELS,
  type FmEmployeeScheduleStagingRecord,
  type FmJointOperationMember,
  type FmScheduleInfoCode,
  type FmScheduleWarningCode,
} from "@/lib/import-preprocessor/fm-employee-schedule/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FmScheduleFilterBar } from "./FmScheduleFilterBar";
import {
  daySummaryMatchesFilter,
  filterFmScheduleRecords,
  FM_SCHEDULE_FILTER_LABELS,
  getFmFilterDisplayLabel,
  operationSummaryMatchesFilter,
  type FmScheduleViewFilter,
} from "@/lib/import-preprocessor/fm-employee-schedule/filters";
import { FM_REVIEW_DECISION_LABELS } from "@/lib/import-preprocessor/fm-employee-schedule/review-decision";
import type { FmReviewDecisionType } from "@/lib/import-preprocessor/fm-employee-schedule/types";
import { formatManualEditHistoryAt } from "@/lib/import-preprocessor/fm-employee-schedule/manual-edit-history";
import { formatJointPartnerDisplay } from "@/lib/import-preprocessor/fm-employee-schedule/partner-display";
import { FM_SCHEDULE_QUICK_FILTERS } from "@/lib/import-preprocessor/fm-employee-schedule/summary-filter-registry";
import type { FmEditModeContext } from "./FmScheduleEditModeDialog";
import {
  getActionableWarnings,
} from "@/lib/import-preprocessor/fm-employee-schedule/warning-tracking";
import type { PreprocessResult } from "@/lib/import-preprocessor";

type FmScheduleReviewTableProps = {
  result: PreprocessResult | null;
  activeFilter?: FmScheduleViewFilter;
  activeWarningFlag?: FmScheduleWarningCode | null;
  lastModifiedRecordId?: string | null;
  onFilterChange?: (filter: FmScheduleViewFilter) => void;
  onWarningFlagFilter?: (flag: FmScheduleWarningCode | null) => void;
  onClearFilter?: () => void;
  onDismissWarning?: (recordId: string, flag: FmScheduleWarningCode) => void;
  onOpenEditMode?: (recordId: string, context?: FmEditModeContext) => void;
};

type ReviewView = "employeeDay" | "operation";

function formatBindingMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}m`;
}

function isJointWarning(flag: FmScheduleWarningCode): boolean {
  return flag.startsWith("JOINT_OPERATION_");
}

function isRideAlongWarning(flag: FmScheduleWarningCode): boolean {
  return (
    flag === "POSSIBLE_RIDE_ALONG_TRAINING" || flag === "REQUIRES_HUMAN_REVIEW"
  );
}

function isPartnerInfo(flag: FmScheduleInfoCode): boolean {
  return flag === "EXTERNAL_PARTNER_LABEL";
}

function isJointVehicleFill(flag: FmScheduleInfoCode): boolean {
  return (
    flag === "VEHICLE_FILLED_FROM_JOINT_JOB" || flag === "VEHICLE_FILLED_MANUAL"
  );
}

function isNotePartnerInfo(flag: FmScheduleInfoCode): boolean {
  return flag === "NOTE_RIDE_ALONG_PARTNER_DETECTED";
}

function WarningBadges({
  flags,
  recordId,
  onDismiss,
  onFilterWarning,
  onOpenEditMode,
  activeWarningFlag,
}: {
  flags: FmScheduleWarningCode[];
  recordId?: string;
  onDismiss?: (recordId: string, flag: FmScheduleWarningCode) => void;
  onFilterWarning?: (flag: FmScheduleWarningCode) => void;
  onOpenEditMode?: (recordId: string, context?: FmEditModeContext) => void;
  activeWarningFlag?: FmScheduleWarningCode | null;
}) {
  if (flags.length === 0) {
    return <span className="text-emerald-700">問題なし</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span key={flag} className="inline-flex items-center gap-0.5">
          <Badge
            variant={
              flag.startsWith("UNRESOLVED") || flag === "MISSING_BUSINESS_DATE"
                ? "destructive"
                : isRideAlongWarning(flag)
                  ? "outline"
                  : isJointWarning(flag)
                    ? "outline"
                    : "secondary"
            }
            className={`cursor-pointer text-[10px] font-normal transition-shadow hover:ring-2 hover:ring-sky-400 ${
              activeWarningFlag === flag ? "ring-2 ring-sky-500" : ""
            } ${
              isRideAlongWarning(flag)
                ? "border-violet-400 bg-violet-50 text-violet-900"
                : isJointWarning(flag)
                  ? "border-amber-400 bg-amber-50 text-amber-900"
                  : flag === "INACTIVE_EMPLOYEE_ON_REVENUE_ROW"
                    ? "border-orange-400 bg-orange-50 text-orange-900"
                    : flag === "REVENUE_WITHOUT_VEHICLE"
                      ? "border-rose-400 bg-rose-50 text-rose-900"
                      : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (recordId && onOpenEditMode) {
                onOpenEditMode(recordId, { focusWarning: flag });
              } else {
                onFilterWarning?.(flag);
              }
            }}
            title="クリックで修正モードを開く"
          >
            {FM_SCHEDULE_WARNING_LABELS[flag]}
          </Badge>
          {recordId && onOpenEditMode && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1 text-[10px] text-sky-700 hover:text-sky-900"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEditMode(recordId, { focusWarning: flag });
              }}
            >
              修正画面
            </Button>
          )}
        </span>
      ))}
    </div>
  );
}

function isAttendanceInfo(flag: FmScheduleInfoCode): boolean {
  return (
    flag === "ATTENDANCE_ROW_INFO" ||
    flag === "HOLIDAY_ROW_INFO" ||
    flag === "INACTIVE_EMPLOYEE_ATTENDANCE_ONLY"
  );
}

function InfoBadges({ flags }: { flags: FmScheduleInfoCode[] }) {
  if (flags.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge
          key={flag}
          variant="outline"
          className={`text-[10px] font-normal ${
            isPartnerInfo(flag)
              ? "border-teal-400 bg-teal-50 text-teal-900"
              : isNotePartnerInfo(flag)
                ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-900"
                : isJointVehicleFill(flag)
                  ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                  : isAttendanceInfo(flag)
                    ? "border-slate-300 bg-slate-50 text-slate-800"
                    : "border-sky-300 bg-sky-50 text-sky-800"
          }`}
        >
          {FM_SCHEDULE_INFO_LABELS[flag]}
        </Badge>
      ))}
    </div>
  );
}

function StateCell({ row }: { row: FmEmployeeScheduleStagingRecord }) {
  if (row.jointOperationReviewDecision) {
    return (
      <Badge
        variant="outline"
        className="border-sky-400 bg-sky-50 text-[10px] text-sky-900"
      >
        判断済み
      </Badge>
    );
  }
  if (row.requiresHumanReview) {
    return (
      <Badge
        variant="outline"
        className="border-violet-400 bg-violet-50 text-[10px] text-violet-900"
      >
        要確認
      </Badge>
    );
  }
  const hasVehicleFill =
    Boolean(row.vehicleNumberFilled?.trim()) ||
    row.infoFlags.includes("VEHICLE_FILLED_FROM_EMPLOYEE_DAY") ||
    row.infoFlags.includes("VEHICLE_FILLED_FROM_JOINT_JOB") ||
    row.infoFlags.includes("VEHICLE_FILLED_MANUAL");
  if (hasVehicleFill) {
    return (
      <Badge
        variant="outline"
        className="border-indigo-300 bg-indigo-50 text-[10px] text-indigo-900"
      >
        補完済み
      </Badge>
    );
  }
  return <span className="text-muted-foreground">原文</span>;
}

function formatMemberVehicle(member: FmJointOperationMember): string {
  const original = member.vehicleNumberOriginal.trim();
  const filled = member.vehicleNumberFilled?.trim() ?? "";
  const canonical = member.vehicleNumberCanonical?.trim() ?? "";

  if (original) {
    return canonical && canonical !== original ? `${original} → ${canonical}` : original;
  }
  if (filled) {
    return `提案 ${filled}${canonical && canonical !== filled ? ` → ${canonical}` : ""}`;
  }
  return "車両なし";
}

function VehicleCell({ row }: { row: FmEmployeeScheduleStagingRecord }) {
  const original = row.vehicleNumberOriginal.trim();
  const filled = row.vehicleNumberFilled?.trim() ?? "";
  const canonical = row.vehicleNumberCanonical?.trim() ?? "";
  const isManualFill = row.infoFlags.includes("VEHICLE_FILLED_MANUAL");
  const isJointFill = row.infoFlags.includes("VEHICLE_FILLED_FROM_JOINT_JOB");

  if (!original && filled) {
    return (
      <span>
        <span className="text-muted-foreground">元値：空白</span>
        <span
          className={`block ${
            isManualFill
              ? "text-indigo-900"
              : isJointFill
                ? "text-indigo-800"
                : "text-sky-800"
          }`}
        >
          {isManualFill ? "手動補完：" : isJointFill ? "提案：" : "補完後："}
          {filled}
          {canonical && canonical !== filled ? (
            <span className="block text-xs text-muted-foreground">→ {canonical}</span>
          ) : null}
        </span>
        {row.vehicleNumberFilledFromRowNumber != null && (
          <span className="block text-[10px] text-muted-foreground">
            元行：{row.vehicleNumberFilledFromRowNumber}
          </span>
        )}
      </span>
    );
  }

  if (!original) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (!canonical || canonical === original) {
    return <span>{original}</span>;
  }

  return (
    <span>
      {original}
      <span className="block text-xs text-muted-foreground">→ {canonical}</span>
    </span>
  );
}

function JointPartnerCell({ row }: { row: FmEmployeeScheduleStagingRecord }) {
  const display = formatJointPartnerDisplay(row);
  if (display === "単独") {
    return <span className="text-muted-foreground">単独</span>;
  }
  return (
    <span className="text-sky-900" title={display}>
      {display}
    </span>
  );
}

function CanonicalCell({
  original,
  canonical,
}: {
  original: string;
  canonical: string | null;
}) {
  if (!original.trim()) return <span className="text-muted-foreground">—</span>;
  if (!canonical || canonical === original.replace(/\s/g, "")) {
    return <span>{original}</span>;
  }
  return (
    <span>
      {original}
      <span className="block text-xs text-muted-foreground">→ {canonical}</span>
    </span>
  );
}

function RevenueCell({ row }: { row: FmEmployeeScheduleStagingRecord }) {
  if (!row.isRevenueRow) return <span className="text-muted-foreground">—</span>;

  return (
    <span>
      <span className="block font-medium">
        {formatYen(row.employeeRevenueShareAmount)}
      </span>
      {row.isPartnerLikeRow && (
        <span className="block text-[10px] text-muted-foreground">
          外注（社員按分対象外）
        </span>
      )}
    </span>
  );
}

function MemberList({
  members,
}: {
  members: FmJointOperationMember[];
}) {
  if (members.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {members.map((member) => {
        const name =
          member.employeeNameCanonical ?? member.employeeNameOriginal;
        return (
          <li key={name}>
            <span className="font-medium">{name}</span>
            <span className="text-muted-foreground">
              {" "}
              {formatYen(member.revenueAmount)} / {formatMemberVehicle(member)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const ALL_VIEW_FILTERS = FM_SCHEDULE_QUICK_FILTERS;

function DecisionTypeBadge({
  decision,
}: {
  decision: FmReviewDecisionType;
}) {
  const variant =
    decision === "separate_operations"
      ? "border-emerald-400 bg-emerald-50 text-emerald-900"
      : decision === "joint_operation"
        ? "border-sky-400 bg-sky-50 text-sky-900"
        : decision === "ride_along_training"
          ? "border-violet-400 bg-violet-50 text-violet-900"
          : "border-amber-400 bg-amber-50 text-amber-900";

  return (
    <Badge variant="outline" className={`text-[10px] font-normal ${variant}`}>
      確定: {FM_REVIEW_DECISION_LABELS[decision]}
    </Badge>
  );
}

function RowTable({
  rows,
  onDismissWarning,
  onFilterWarning,
  onOpenEditMode,
  activeWarningFlag,
  lastModifiedRecordId,
}: {
  rows: FmEmployeeScheduleStagingRecord[];
  onDismissWarning?: (recordId: string, flag: FmScheduleWarningCode) => void;
  onFilterWarning?: (flag: FmScheduleWarningCode) => void;
  onOpenEditMode?: FmScheduleReviewTableProps["onOpenEditMode"];
  activeWarningFlag?: FmScheduleWarningCode | null;
  lastModifiedRecordId?: string | null;
}) {
  return (
    <div className="overflow-x-auto border-t">
      <table className="w-full min-w-[1400px] text-xs">
        <thead>
          <tr className="border-b bg-muted/30 text-left">
            <th className="px-2 py-1.5">行</th>
            <th className="px-2 py-1.5">社員</th>
            <th className="px-2 py-1.5">荷主</th>
            <th className="px-2 py-1.5">業務</th>
            <th className="px-2 py-1.5">車両</th>
            <th className="px-2 py-1.5">社員別売上</th>
            <th className="px-2 py-1.5">共同作業</th>
            <th className="px-2 py-1.5">状態</th>
            <th className="px-2 py-1.5">最終修正者</th>
            <th className="px-2 py-1.5">最終修正日時</th>
            <th className="px-2 py-1.5">警告</th>
            <th className="px-2 py-1.5">情報</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30 ${
                lastModifiedRecordId === row.id
                  ? "bg-amber-50/90 ring-1 ring-inset ring-amber-300"
                  : ""
              }`}
              onClick={() => onOpenEditMode?.(row.id)}
            >
              <td className="px-2 py-1.5">{row.sourceRowNumber}</td>
              <td className="px-2 py-1.5">
                <CanonicalCell
                  original={row.employeeNameOriginal}
                  canonical={row.employeeNameCanonical}
                />
              </td>
              <td className="px-2 py-1.5">
                <CanonicalCell
                  original={row.shipperNameOriginal}
                  canonical={row.shipperNameCanonical}
                />
              </td>
              <td className="px-2 py-1.5">
                <CanonicalCell
                  original={row.jobNameOriginal}
                  canonical={row.jobNameCanonical}
                />
              </td>
              <td className="px-2 py-1.5">
                <VehicleCell row={row} />
              </td>
              <td className="px-2 py-1.5">
                <RevenueCell row={row} />
              </td>
              <td className="px-2 py-1.5">
                <JointPartnerCell row={row} />
              </td>
              <td className="px-2 py-1.5">
                <StateCell row={row} />
              </td>
              <td className="px-2 py-1.5">
                {row.lastManualEditBy ?? "—"}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {row.lastManualEditAt
                  ? formatManualEditHistoryAt(row.lastManualEditAt)
                  : "—"}
              </td>
              <td className="px-2 py-1.5">
                <WarningBadges
                  flags={getActionableWarnings(row)}
                  recordId={row.id}
                  onDismiss={onDismissWarning}
                  onFilterWarning={onFilterWarning}
                  onOpenEditMode={onOpenEditMode}
                  activeWarningFlag={activeWarningFlag}
                />
              </td>
              <td className="px-2 py-1.5">
                <InfoBadges flags={row.infoFlags} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FmScheduleReviewTable({
  result,
  activeFilter = "all",
  activeWarningFlag = null,
  lastModifiedRecordId = null,
  onFilterChange,
  onWarningFlagFilter,
  onClearFilter,
  onDismissWarning,
  onOpenEditMode,
}: FmScheduleReviewTableProps) {
  const records = result?.fmScheduleRecords ?? [];
  const daySummaries = result?.fmEmployeeDaySummaries ?? [];
  const operationSummaries = result?.fmOperationSummaries ?? [];
  const [view, setView] = useState<ReviewView>("operation");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeFilter === "attendance_holiday") {
      setView("employeeDay");
    }
  }, [activeFilter]);

  const filterContext = useMemo(
    () => ({
      reconciliationBalanced:
        result?.fmScheduleTotals?.revenueReconciliation.isBalanced,
      warningFlag: activeWarningFlag ?? undefined,
    }),
    [
      result?.fmScheduleTotals?.revenueReconciliation.isBalanced,
      activeWarningFlag,
    ],
  );

  const filteredRecordIds = useMemo(() => {
    const filtered = filterFmScheduleRecords(records, activeFilter, filterContext);
    return new Set(filtered.map((r) => r.id));
  }, [records, activeFilter, filterContext]);

  const filteredOperationSummaries = useMemo(() => {
    if (activeFilter === "all") return operationSummaries;
    return operationSummaries.filter((op) => {
      const groupKey = op.operationGroupKey || op.jointJobKey;
      const opRows = records.filter(
        (r) => (r.operationGroupKey || r.jointJobKey) === groupKey,
      );
      return operationSummaryMatchesFilter(
        op,
        opRows,
        activeFilter,
        filterContext,
      );
    });
  }, [operationSummaries, records, activeFilter, filterContext]);

  const filteredDaySummaries = useMemo(() => {
    if (activeFilter === "all") return daySummaries;
    return daySummaries.filter((day) => {
      const dayRows = records.filter((r) => r.employeeDayKey === day.employeeDayKey);
      return daySummaryMatchesFilter(dayRows, activeFilter, filterContext);
    });
  }, [daySummaries, records, activeFilter, filterContext]);

  const recordsByDay = useMemo(() => {
    const map = new Map<string, FmEmployeeScheduleStagingRecord[]>();
    for (const record of records) {
      const bucket = map.get(record.employeeDayKey) ?? [];
      bucket.push(record);
      map.set(record.employeeDayKey, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.sourceRowNumber - b.sourceRowNumber);
    }
    return map;
  }, [records]);

  const recordsByOperation = useMemo(() => {
    const map = new Map<string, FmEmployeeScheduleStagingRecord[]>();
    for (const record of records) {
      const key = record.operationGroupKey || record.jointJobKey;
      if (!key) continue;
      const bucket = map.get(key) ?? [];
      bucket.push(record);
      map.set(key, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.sourceRowNumber - b.sourceRowNumber);
    }
    return map;
  }, [records]);

  const recordsByJointJob = useMemo(() => {
    const map = new Map<string, FmEmployeeScheduleStagingRecord[]>();
    for (const record of records) {
      if (!record.jointJobKey) continue;
      const bucket = map.get(record.jointJobKey) ?? [];
      bucket.push(record);
      map.set(record.jointJobKey, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.sourceRowNumber - b.sourceRowNumber);
    }
    return map;
  }, [records]);

  if (!result || result.sourceType !== "filemaker_employee_schedule") {
    return null;
  }

  if (records.length === 0) return null;

  const toggleKey = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">FM社員スケジュール確認</CardTitle>
        <CardDescription>
          社員別売上は Excel の revenueAmount をそのまま使用します。共同作業は自動検出のみで、判断ボタンから確定してください。
        </CardDescription>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button
            type="button"
            size="sm"
            variant={view === "operation" ? "default" : "outline"}
            onClick={() => setView("operation")}
          >
            共同作業単位
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "employeeDay" ? "default" : "outline"}
            onClick={() => setView("employeeDay")}
          >
            社員日単位
          </Button>
          {onFilterChange && (
            <Select
              value={activeFilter ?? ""}
              onValueChange={(v) => {
                if (v) onFilterChange(v as FmScheduleViewFilter);
              }}
            >
              <SelectTrigger size="sm" className="h-8 w-[200px] text-xs">
                <span className="truncate">
                  {getFmFilterDisplayLabel(activeFilter)}
                </span>
              </SelectTrigger>
              <SelectContent>
                {ALL_VIEW_FILTERS.map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">
                    {FM_SCHEDULE_FILTER_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <FmScheduleFilterBar
          activeFilter={activeFilter}
          activeWarningFlag={activeWarningFlag}
          onClear={() => onClearFilter?.()}
          filteredCount={filteredRecordIds.size}
          totalCount={records.length}
        />

        {(activeFilter !== "all" || activeWarningFlag) &&
          filteredOperationSummaries.length === 0 &&
          filteredDaySummaries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              フィルタ条件に一致する行がありません。
            </p>
          )}

        {view === "operation" ? (
          <div className="space-y-2">
            {filteredOperationSummaries.map((op) => {
              const groupKey = op.operationGroupKey || op.jointJobKey;
              const expanded = expandedKeys.has(groupKey);
              const passesRowFilter = (r: FmEmployeeScheduleStagingRecord) =>
                (activeFilter === "all" && !activeWarningFlag) ||
                filteredRecordIds.has(r.id);
              const opRows = (recordsByOperation.get(groupKey) ?? []).filter(
                passesRowFilter,
              );
              const jointGroupRows = (
                recordsByJointJob.get(op.jointJobKey) ?? []
              ).filter(passesRowFilter);
              return (
                <div
                  key={groupKey}
                  className="rounded-md border bg-muted/20"
                >
                  <button
                    type="button"
                    className="flex w-full flex-col gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                    onClick={() => toggleKey(groupKey)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {expanded ? "▼" : "▶"} {op.businessDate}
                      </span>
                      <span>
                        {op.shipperNameCanonical ?? "—"} / {op.jobNameCanonical ?? "—"}
                      </span>
                      {op.jointOperationReviewDecision && (
                        <DecisionTypeBadge decision={op.jointOperationReviewDecision} />
                      )}
                      {op.requiresHumanReview && !op.jointOperationReviewDecision && (
                        <Badge
                          variant="outline"
                          className="border-violet-400 bg-violet-50 text-[10px] text-violet-900"
                        >
                          要確認
                        </Badge>
                      )}
                      {op.isJointOperation && (
                        <Badge variant="outline" className="border-sky-300 text-[10px]">
                          共同作業 {op.jointOperationMemberCount}名
                        </Badge>
                      )}
                      <span className="font-medium text-emerald-800">
                        会社売上{" "}
                        {op.operationRevenueAmount != null
                          ? formatYen(op.operationRevenueAmount)
                          : "—"}
                      </span>
                      {(op.warningFlags.length > 0 || op.infoFlags.length > 0) && (
                        <Badge variant="outline" className="text-[10px]">
                          注意 {op.warningFlags.length + op.infoFlags.length}
                        </Badge>
                      )}
                    </div>
                    <MemberList members={op.jointOperationMembers} />
                  </button>
                  {expanded && (
                    <div className="space-y-2 border-t px-3 py-2">
                      {onOpenEditMode && opRows[0] && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 w-full text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEditMode(opRows[0]!.id);
                          }}
                        >
                          修正画面で開く
                        </Button>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        jointJobKey: {op.jointJobKey}
                        {op.operationGroupKey !== op.jointJobKey
                          ? ` / operationGroupKey: ${op.operationGroupKey}`
                          : ""}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <InfoBadges flags={op.infoFlags} />
                        <WarningBadges
                          flags={op.warningFlags}
                          onFilterWarning={onWarningFlagFilter}
                          activeWarningFlag={activeWarningFlag}
                        />
                      </div>
                      <RowTable
                        rows={opRows}
                        onDismissWarning={onDismissWarning}
                        onFilterWarning={onWarningFlagFilter}
                        onOpenEditMode={onOpenEditMode}
                        activeWarningFlag={activeWarningFlag}
                        lastModifiedRecordId={lastModifiedRecordId}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDaySummaries.map((day) => {
              const expanded = expandedKeys.has(day.employeeDayKey);
              const dayRows = (recordsByDay.get(day.employeeDayKey) ?? []).filter(
                (r) =>
                  (activeFilter === "all" && !activeWarningFlag) ||
                  filteredRecordIds.has(r.id),
              );
              return (
                <div
                  key={day.employeeDayKey}
                  className="rounded-md border bg-muted/20"
                >
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                    onClick={() => toggleKey(day.employeeDayKey)}
                  >
                    <span className="font-medium">
                      {expanded ? "▼" : "▶"} {day.businessDate}
                    </span>
                    <span>
                      {day.employeeNameCanonical ?? day.employeeNameOriginal}
                    </span>
                    <span className="text-muted-foreground">
                      {day.rowCount}業務 / 社員別売上 {formatYen(day.revenueTotal)}
                    </span>
                    <span className="text-muted-foreground">
                      拘束{" "}
                      {day.clockInTime && day.clockOutTime
                        ? `${day.clockInTime}-${day.clockOutTime} (${formatBindingMinutes(day.bindingMinutes)})`
                        : "—"}
                    </span>
                    {day.warningFlags.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        警告 {day.warningFlags.length}
                      </Badge>
                    )}
                  </button>
                  {expanded && (
                    <RowTable
                      rows={dayRows}
                      onDismissWarning={onDismissWarning}
                      onFilterWarning={onWarningFlagFilter}
                      onOpenEditMode={onOpenEditMode}
                      activeWarningFlag={activeWarningFlag}
                      lastModifiedRecordId={lastModifiedRecordId}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
