"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Package } from "lucide-react";
import { ImportDropZone } from "@/components/import-drop-zone";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAmazonPerformanceDisplayDate } from "@/lib/amazon-performance-parser";
import {
  AMAZON_SAVE_ERROR_PREFIX,
  AMAZON_SAVE_SUCCESS_MESSAGE,
} from "@/lib/amazon-performance-save";
import {
  previewAmazonPerformanceFiles,
  saveAmazonPerformancePreview,
  type AmazonPerformancePreviewResult,
} from "@/lib/amazon-performance-import";
import { formatYen } from "@/lib/currency-format";
import {
  amazonMergeKindLabel,
  amazonMergeKindRowClass,
  displayAmazonMergeCompanyName,
  type AmazonMergeReviewRow,
} from "@/lib/amazon-performance-merge";
import { loadFileMakerScheduleForAmazonMerge } from "@/lib/filemaker-schedule-client";
import { FILEMAKER_SCHEDULE_LAYOUT } from "@/lib/filemaker-schedule-config";
import type { DailyRecord, MasterData } from "@/lib/types";

type AmazonPerformanceImportProps = {
  /** クラウド上のスケジュール（FM API 未取得時のフォールバック） */
  records: DailyRecord[];
  masters: MasterData;
};

/** FM API 取得分を優先し、同一日×運転手はクラウド側を差し替え */
function mergeScheduleSources(
  fmRecords: DailyRecord[],
  cloudRecords: DailyRecord[],
): DailyRecord[] {
  if (fmRecords.length === 0) return cloudRecords;
  const fmKeys = new Set(
    fmRecords.map((r) => `${r.date}|${r.driverName ?? ""}`),
  );
  const rest = cloudRecords.filter(
    (r) => !fmKeys.has(`${r.date}|${r.driverName ?? ""}`),
  );
  return [...fmRecords, ...rest];
}

function AmazonMergeReviewTable({
  rows,
  routeOneMan,
  routeTwoMan,
  routeOther,
}: {
  rows: AmazonMergeReviewRow[];
  routeOneMan: number;
  routeTwoMan: number;
  routeOther: number;
}) {
  if (rows.length === 0) return null;

  const ownCount = rows.filter(
    (r) => r.kind === "own_update" || r.kind === "own_new",
  ).length;
  const partnerCount = rows.filter((r) => r.kind === "partner_new").length;

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-xs">
        <span className="font-semibold">合体結果プレビュー（{rows.length}行）</span>
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900">
          自社 {ownCount}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
          傭車 {partnerCount}
        </span>
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">
          1マン {routeOneMan}
        </span>
        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-900">
          2マン {routeTwoMan}
        </span>
        {routeOther > 0 ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
            その他 {routeOther}
          </span>
        ) : null}
      </div>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80">
            <tr className="text-left text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">区分</th>
              <th className="px-2 py-1.5 font-medium">日付</th>
              <th className="px-2 py-1.5 font-medium">名前</th>
              <th className="px-2 py-1.5 font-medium">会社名</th>
              <th className="px-2 py-1.5 font-medium">便名</th>
              <th className="px-2 py-1.5 text-right font-medium">売上</th>
              <th className="px-2 py-1.5 text-right font-medium">支払</th>
              <th className="px-2 py-1.5 text-right font-medium">差異</th>
              <th className="px-2 py-1.5 font-medium">備考</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-t ${amazonMergeKindRowClass(r.kind)}`}
              >
                <td className="whitespace-nowrap px-2 py-1.5 font-medium">
                  {amazonMergeKindLabel(r.kind)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                  {formatAmazonPerformanceDisplayDate(r.date)}
                </td>
                <td className="px-2 py-1.5">{r.driverName}</td>
                <td className="px-2 py-1.5">
                  {displayAmazonMergeCompanyName(r.companyName, r.kind)}
                </td>
                <td className="px-2 py-1.5">{r.routeLabel || "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatYen(r.revenue)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatYen(r.payment)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatYen(r.diff)}
                </td>
                <td className="max-w-[120px] truncate px-2 py-1.5 text-muted-foreground">
                  {r.memo || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t px-3 py-2 text-[10px] text-muted-foreground">
        保存時はクラウド経費テーブルのみ更新（FMスケジュールへは書き込みません）
      </p>
    </div>
  );
}

function formatSaveErrorMessage(error: unknown): string {
  const detail =
    error instanceof Error ? error.message : "不明なエラー";
  return detail.startsWith(AMAZON_SAVE_ERROR_PREFIX)
    ? detail
    : `${AMAZON_SAVE_ERROR_PREFIX}：${detail}`;
}

export function AmazonPerformanceImport({
  records,
  masters,
}: AmazonPerformanceImportProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [lastSummary, setLastSummary] = useState("");
  const [reviewRows, setReviewRows] = useState<AmazonMergeReviewRow[]>([]);
  const [previewResult, setPreviewResult] =
    useState<AmazonPerformancePreviewResult | null>(null);
  const [previewFileLabel, setPreviewFileLabel] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );
  const [fmScheduleRecords, setFmScheduleRecords] = useState<DailyRecord[]>([]);
  const [scheduleSourceNote, setScheduleSourceNote] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadFmSchedule() {
      try {
        const result = await loadFileMakerScheduleForAmazonMerge(masters);
        if (cancelled) return;

        if (result.records.length > 0) {
          setFmScheduleRecords(result.records);
          setScheduleSourceNote(
            `FMスケジュール読込: ${result.records.length}件（レイアウト: ${result.layout ?? FILEMAKER_SCHEDULE_LAYOUT}）`,
          );
        } else if (result.error) {
          setScheduleSourceNote(
            `FMスケジュール未取得（クラウドデータで照合）: ${result.error}`,
          );
        } else if (result.source === "firestore") {
          setScheduleSourceNote(
            "FM API未設定 — クラウドのスケジュールデータで照合します",
          );
        }
      } catch (error) {
        console.error("[Amazon実績] 初期化時のFMスケジュール読込失敗:", error);
        if (!cancelled) {
          setScheduleSourceNote(
            "FMスケジュール読込エラー — クラウドデータで照合を続行します",
          );
        }
      }
    }

    void loadFmSchedule();
    return () => {
      cancelled = true;
    };
  }, [masters]);

  const mergeSourceRecords = mergeScheduleSources(fmScheduleRecords, records);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const clearPreviewState = useCallback(() => {
    setReviewRows([]);
    setPreviewResult(null);
    setPreviewFileLabel("");
    setMessages([]);
    setLastSummary("");
  }, []);

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list).filter((f) =>
        /\.(xlsx|xls|csv)$/i.test(f.name),
      );
      if (incoming.length === 0) return;
      setPendingFiles((prev) => {
        const names = new Set(prev.map((f) => f.name));
        return [...prev, ...incoming.filter((f) => !names.has(f.name))];
      });
      clearPreviewState();
    },
    [clearPreviewState],
  );

  const handlePreview = async () => {
    if (pendingFiles.length === 0) return;
    setPreviewBusy(true);
    try {
      const result = await previewAmazonPerformanceFiles(
        pendingFiles,
        mergeSourceRecords,
        masters,
      );
      setPreviewResult(result);
      setPreviewFileLabel(pendingFiles.map((file) => file.name).join(", "));
      setMessages(result.messages);
      setReviewRows(result.reviewRows);
      setLastSummary(
        result.importedCount > 0
          ? `プレビュー準備完了: ${result.importedCount}行（確定で経費テーブルへ保存）`
          : "取り込み可能な行がありませんでした",
      );
      setPendingFiles([]);
    } catch (error) {
      const msg = formatSaveErrorMessage(error);
      setMessages((prev) => [...prev, `✗ ${msg}`]);
      window.alert(msg);
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleSave = async () => {
    if (!previewResult || previewResult.importedCount === 0) return;
    setSaveBusy(true);
    setToastMessage("");
    try {
      await saveAmazonPerformancePreview(
        previewResult,
        previewFileLabel || "Amazon実績.xlsx",
      );
      setToastVariant("success");
      setToastMessage(AMAZON_SAVE_SUCCESS_MESSAGE);
      clearPreviewState();
    } catch (error) {
      const msg = formatSaveErrorMessage(error);
      setToastVariant("error");
      setToastMessage(msg);
      window.alert(msg);
      setMessages((prev) => [...prev, `✗ ${msg}`]);
      setLastSummary(
        "保存に失敗しました。プレビュー内容は保持されています。再度お試しください。",
      );
    } finally {
      setSaveBusy(false);
    }
  };

  const canSave =
    previewResult != null &&
    previewResult.importedCount > 0 &&
    reviewRows.length > 0;

  return (
    <div className="space-y-3">
      {toastMessage && (
        <div
          role="status"
          className={`fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toastVariant === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
              : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
          }`}
        >
          {toastVariant === "success" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{toastMessage}</span>
        </div>
      )}

      <Card className="flex h-full min-h-[360px] flex-col border-violet-200/80 bg-violet-50/30 dark:border-violet-900 dark:bg-violet-950/20">
        <CardHeader className="shrink-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Package className="size-4 shrink-0 text-violet-700 dark:text-violet-400" />
            ④ Amazon実績
          </CardTitle>
          <CardDescription className="text-xs leading-snug">
            プレビュー時のみ FM スケジュール（{FILEMAKER_SCHEDULE_LAYOUT}
            ）を照合。保存はクラウド経費テーブルのみ（FM へ書き込みません）
          </CardDescription>
          {scheduleSourceNote && (
            <p className="text-[10px] text-muted-foreground">{scheduleSourceNote}</p>
          )}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
          <ImportDropZone
            hint="Amazon実績.xlsx（Sheet1）"
            files={pendingFiles}
            onAdd={addFiles}
            onClear={() => setPendingFiles([])}
            accent="violet"
          />
          <div className="mt-auto space-y-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 w-full"
              disabled={pendingFiles.length === 0 || previewBusy || saveBusy}
              onClick={() => void handlePreview()}
            >
              {previewBusy ? "合体プレビュー中…" : "合体プレビュー"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 w-full"
              disabled={!canSave || saveBusy || previewBusy}
              onClick={() => void handleSave()}
            >
              {saveBusy ? "保存中…" : "確定（経費テーブルへ保存）"}
            </Button>
            {lastSummary && (
              <p className="line-clamp-3 text-xs font-medium text-violet-900 dark:text-violet-200">
                {lastSummary}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {reviewRows.length > 0 && previewResult && (
        <AmazonMergeReviewTable
          rows={reviewRows}
          routeOneMan={previewResult.summary.routeOneMan}
          routeTwoMan={previewResult.summary.routeTwoMan}
          routeOther={previewResult.summary.routeOther}
        />
      )}

      {messages.length > 0 && (
        <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-background p-3 font-mono text-xs text-muted-foreground">
          {messages.map((m, i) => (
            <li key={`${i}-${m}`}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
