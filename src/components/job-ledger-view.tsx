"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { ImportDropZone } from "@/components/import-drop-zone";
import { JobFormModal } from "@/components/job-form-modal";
import { Button } from "@/components/ui/button";
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
import { formatYen } from "@/lib/currency-format";
import { normalizeJobDetails } from "@/lib/job-price-history";
import { parseJobMasterSheet } from "@/lib/job-master-parser";
import { sortJobs, suggestNextJobId } from "@/lib/job-ledger-utils";
import { sheetRowsFromFile } from "@/lib/spreadsheet-read";
import type { JobDetail } from "@/lib/types";
import {
  loadJobDetails,
  saveJobDetails,
  upsertJobDetail,
} from "@/services/firestore-storage";
import { cn } from "@/lib/utils";

const linkButtonClass =
  "cursor-pointer font-medium text-blue-600 underline-offset-2 transition-colors hover:text-blue-800 hover:underline";

type JobLedgerViewProps = {
  className?: string;
  showImport?: boolean;
};

function formatJobRevenue(value: number): string {
  if (!value) return "—";
  return formatYen(value);
}

export function JobLedgerView({
  className,
  showImport = true,
}: JobLedgerViewProps) {
  const [jobs, setJobs] = useState<JobDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingJob, setEditingJob] = useState<JobDetail | null>(null);
  const [savingJob, setSavingJob] = useState(false);

  const suggestedJobId = useMemo(() => suggestNextJobId(jobs), [jobs]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadJobDetails();
      setJobs(normalizeJobDetails(rows));
    } catch (err) {
      console.error(err);
      setFeedback("業務台帳の読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  const visibleJobs = useMemo(() => sortJobs(jobs), [jobs]);

  const openCreateModal = useCallback(() => {
    setEditingJob(null);
    setModalMode("create");
  }, []);

  const openEditModal = useCallback((job: JobDetail) => {
    setEditingJob(job);
    setModalMode("edit");
  }, []);

  const closeModal = useCallback(() => {
    if (savingJob) return;
    setModalMode(null);
    setEditingJob(null);
  }, [savingJob]);

  const handleSaveJob = useCallback(
    async (job: JobDetail) => {
      setSavingJob(true);
      setFeedback(null);
      try {
        const normalized = normalizeJobDetails([job])[0]!;
        await upsertJobDetail(normalized);
        setJobs((prev) => {
          const withoutOld =
            modalMode === "edit" && editingJob
              ? prev.filter((j) => j.id !== editingJob.id)
              : prev.filter((j) => j.id !== normalized.id);
          return sortJobs([...withoutOld, normalized]);
        });
        setModalMode(null);
        setEditingJob(null);
        setFeedback(
          modalMode === "create"
            ? `${job.jobName} を登録しました。`
            : `${job.jobName} の情報を更新しました。`,
        );
      } finally {
        setSavingJob(false);
      }
    },
    [modalMode, editingJob],
  );

  const handleImport = useCallback(async () => {
    if (importFiles.length === 0) return;
    setImporting(true);
    setFeedback(null);
    try {
      const allJobs: JobDetail[] = [];
      const warnings: string[] = [];

      for (const file of importFiles) {
        const rows = await sheetRowsFromFile(file);
        const parsed = parseJobMasterSheet(rows);
        allJobs.push(...parsed.jobs);
        for (const w of parsed.warnings) {
          warnings.push(`${file.name}: ${w}`);
        }
      }

      if (allJobs.length === 0) {
        setFeedback("取り込める業務データがありませんでした。");
        return;
      }

      const byId = new Map<string, JobDetail>();
      for (const job of allJobs) {
        byId.set(job.id, job);
      }
      const merged = normalizeJobDetails(sortJobs([...byId.values()]));

      await saveJobDetails(merged);
      setJobs(merged);
      setImportFiles([]);
      const warnText =
        warnings.length > 0 ? `（警告 ${warnings.length} 件）` : "";
      setFeedback(`${merged.length} 件の業務データを取り込みました。${warnText}`);
    } catch (err) {
      console.error(err);
      setFeedback("インポートに失敗しました。");
    } finally {
      setImporting(false);
    }
  }, [importFiles]);

  return (
    <div className={cn("space-y-6", className)}>
      <Card>
        <CardHeader>
          <CardTitle>業務台帳</CardTitle>
          <CardDescription>
            荷主別の業務マスタを一覧管理します。業務名をクリックして編集できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              登録{" "}
              <span className="font-medium text-foreground">{jobs.length}</span>{" "}
              件
            </p>
            <Button
              type="button"
              className="gap-1.5 bg-blue-600 hover:bg-blue-700"
              onClick={openCreateModal}
            >
              <Plus className="size-4" />
              新規業務登録
            </Button>
          </div>

          {feedback && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              {feedback}
            </p>
          )}

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              読み込み中…
            </p>
          ) : visibleJobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              業務データがありません。下のエリアから「業務マスタ.xlsx」を取り込むか、新規登録してください。
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">荷主名</TableHead>
                    <TableHead className="whitespace-nowrap">業務ID</TableHead>
                    <TableHead className="whitespace-nowrap">業務名</TableHead>
                    <TableHead className="whitespace-nowrap text-right">
                      売上
                    </TableHead>
                    <TableHead className="min-w-[8rem] whitespace-nowrap">
                      備考
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="whitespace-nowrap">
                        {job.shipperName || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {job.jobId}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditModal(job)}
                          className={linkButtonClass}
                        >
                          {job.jobName || "—"}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatJobRevenue(job.revenue)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {job.notes || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showImport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="size-4" />
              業務マスタの取り込み
            </CardTitle>
            <CardDescription>
              「業務マスタ.xlsx」をドロップすると Firestore の jobs
              コレクションへ反映します（既存データは上書き）。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ImportDropZone
              hint="業務マスタ.xlsx をドロップ（またはクリック）"
              files={importFiles}
              onAdd={(list) =>
                setImportFiles([...importFiles, ...Array.from(list)])
              }
              onClear={() => setImportFiles([])}
              accept=".xlsx,.xls"
              minHeightClass="h-36"
              accent="amber"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={importFiles.length === 0 || importing}
                onClick={() => handleImport().catch(console.error)}
              >
                {importing ? "取り込み中…" : "Firestore へ取り込む"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {modalMode && (
        <JobFormModal
          mode={modalMode}
          job={editingJob}
          suggestedJobId={suggestedJobId}
          jobs={jobs}
          saving={savingJob}
          onSave={handleSaveJob}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
