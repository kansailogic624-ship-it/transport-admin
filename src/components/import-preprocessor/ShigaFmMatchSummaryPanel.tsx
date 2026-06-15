"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatYen } from "@/lib/currency-format";
import type { ShigaFmReconciliationResult } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";
import { cn } from "@/lib/utils";

type ShigaFmMatchSummaryPanelProps = {
  result: ShigaFmReconciliationResult | null;
};

export function ShigaFmMatchSummaryPanel({
  result,
}: ShigaFmMatchSummaryPanelProps) {
  if (!result) return null;

  const t = result.totals;
  const mode = result.inputMode;

  const title =
    mode === "shiga_only"
      ? "滋賀店配データ（単独取込）"
      : mode === "fm_only"
        ? "FMスケジュール（単独取込）"
        : "突合サマリー";

  const description =
    mode === "shiga_only"
      ? `滋賀: ${result.shigaFileName ?? "—"}${result.monthPeriod ? ` / ${result.monthPeriod}` : ""}`
      : mode === "fm_only"
        ? `FM: ${result.fmFileName ?? "—"}`
        : `滋賀: ${result.shigaFileName ?? "—"} / FM: ${result.fmFileName ?? "—"}${result.monthPeriod ? ` / ${result.monthPeriod}` : ""}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result.notices.length > 0 && (
          <ul className="list-inside list-disc rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-sm text-sky-900">
            {result.notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        {result.warnings.length > 0 && (
          <ul className="list-inside list-disc rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        {mode === "shiga_only" && result.shigaPreview && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="取込日数"
                value={String(result.shigaPreview.dayCount)}
              />
              <Stat
                label="明細件数"
                value={String(result.shigaPreview.rowCount)}
              />
              <Stat
                label="支払合計"
                value={formatYen(result.shigaPreview.payTotal)}
                isText
                accent="ok"
              />
              <Stat label="売上合計" value="—" isText detail="FM未突合" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="粗利益" value="—" isText detail="FM未突合のため算出不可" />
              <Stat label="粗利益率" value="—" isText />
            </div>
            <CoursePaymentSection totals={t} />
          </>
        )}

        {mode === "fm_only" && result.fmPreview && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="対象行数"
                value={String(result.fmPreview.rowCount)}
                detail="Joshin①〜④（⑤含む合算用）"
              />
              <Stat
                label="稼働日数"
                value={String(result.fmPreview.dayCount)}
              />
              <Stat
                label="社員数"
                value={String(result.fmPreview.employeeCount)}
              />
              <Stat
                label="売上合計"
                value={formatYen(result.fmPreview.salesTotal)}
                isText
                accent="ok"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="支払合計" value="—" isText detail="滋賀店配未突合" />
              <Stat label="粗利益" value="—" isText detail="滋賀店配未突合のため算出不可" />
              <Stat label="粗利益率" value="—" isText />
            </div>
            <CourseSalesSection totals={t} />
          </>
        )}

        {mode === "both" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <Stat label="一致" value={String(t.matchedCount)} accent="ok" />
              <Stat
                label="FM不足"
                value={String(t.fmShortageCount)}
                accent={t.fmShortageCount > 0 ? "warn" : undefined}
              />
              <Stat label="未登録" value={String(t.unregisteredCount)} accent={t.unregisteredCount > 0 ? "warn" : undefined} />
              <Stat label="滋賀のみ" value={String(t.shigaOnlyCount)} />
              <Stat label="FMのみ" value={String(t.fmOnlyCount)} />
              <Stat
                label="金額不一致"
                value={String(t.amountMismatchCount)}
                accent={t.amountMismatchCount > 0 ? "warn" : undefined}
              />
            </div>

            {result.diagnostics && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm">
                <p className="mb-2 font-medium text-slate-800">突合診断</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <DiagnosticStat
                    label="自社社員"
                    value={`${result.diagnostics.employeeCount}件`}
                  />
                  <DiagnosticStat
                    label="傭車"
                    value={`${result.diagnostics.partnerCount}件`}
                  />
                  <DiagnosticStat
                    label="未登録"
                    value={`${result.diagnostics.unregisteredCount}件`}
                  />
                  <DiagnosticStat
                    label="FM不足"
                    value={`${result.diagnostics.fmShortageCount}件`}
                  />
                  <DiagnosticStat
                    label="合計行除外"
                    value={`${result.diagnostics.excludedTotalRowCount}件`}
                  />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 py-2 text-sm text-indigo-950">
              未突合 {t.unreconciledCount} 件（FM不足 {t.fmShortageCount} /
              未登録 {t.unregisteredCount} / 滋賀のみ {t.shigaOnlyCount} / FMのみ{" "}
              {t.fmOnlyCount} / マップ失敗 {t.mappingFailedCount}）
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="売上合計"
                value={formatYen(t.totalSales)}
                isText
                accent="ok"
              />
              <Stat label="支払合計" value={formatYen(t.totalPayment)} isText />
              <Stat
                label="粗利益"
                value={formatYen(t.totalGrossProfit)}
                isText
                accent={t.totalGrossProfit < 0 ? "warn" : "ok"}
              />
              <Stat
                label="粗利益率"
                value={
                  t.grossProfitRate != null
                    ? `${t.grossProfitRate.toFixed(2)}%`
                    : "—"
                }
                isText
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                label="自社社員利益"
                value={formatYen(t.employeeProfitTotal)}
                isText
                accent="ok"
              />
              <Stat
                label="傭車利益"
                value={formatYen(t.partnerProfitTotal)}
                isText
                accent={t.partnerProfitTotal < 0 ? "warn" : undefined}
              />
              <Stat
                label="アルバイト利益"
                value={formatYen(t.partTimeProfitTotal)}
                isText
              />
            </div>

            <div className="border-t pt-4">
              <p className="mb-2 text-sm font-medium text-muted-foreground">
                コース別粗利（突合済みのみ）
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {t.courseSummaries.map((course) => (
                  <Stat
                    key={course.courseId}
                    label={course.courseName}
                    value={`${formatYen(course.grossProfitTotal)} / ${course.count}件`}
                    isText
                    detail={
                      course.grossProfitRate != null
                        ? `率 ${course.grossProfitRate.toFixed(2)}%`
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CoursePaymentSection({
  totals,
}: {
  totals: ShigaFmReconciliationResult["totals"];
}) {
  return (
    <div className="border-t pt-4">
      <p className="mb-2 text-sm font-medium text-muted-foreground">
        コース別支払
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {totals.courseSummaries.map((course) => (
          <Stat
            key={course.courseId}
            label={course.courseName}
            value={`${formatYen(course.paymentTotal)} / ${course.count}件`}
            isText
          />
        ))}
      </div>
    </div>
  );
}

function CourseSalesSection({
  totals,
}: {
  totals: ShigaFmReconciliationResult["totals"];
}) {
  return (
    <div className="border-t pt-4">
      <p className="mb-2 text-sm font-medium text-muted-foreground">
        コース別売上
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {totals.courseSummaries
          .filter((course) => course.count > 0)
          .map((course) => (
            <Stat
              key={course.courseId}
              label={course.courseName}
              value={`${formatYen(course.salesTotal)} / ${course.count}件`}
              isText
            />
          ))}
      </div>
    </div>
  );
}

function DiagnosticStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white px-2 py-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  isText,
  accent,
}: {
  label: string;
  value: string;
  detail?: string;
  isText?: boolean;
  accent?: "ok" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-3 py-2",
        accent === "warn" && "border-amber-300 bg-amber-50/40",
        accent === "ok" && "border-emerald-200",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-semibold",
          isText ? "text-sm" : "text-lg tabular-nums",
        )}
      >
        {value}
      </p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
