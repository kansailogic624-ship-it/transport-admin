"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { ImportDropZone } from "@/components/import-drop-zone";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FusionImportReview } from "@/components/fusion-import-review";
import { importFusionBatch } from "@/lib/fusion-import";
import type { DailyRecord, MasterData } from "@/lib/types";

function pickReviewRecords(
  all: DailyRecord[],
  ids: string[],
): DailyRecord[] {
  const idSet = new Set(ids);
  return all.filter((r) => idSet.has(r.id));
}

type FusionImportProps = {
  records: DailyRecord[];
  masters: MasterData;
  onRecordsChange: (records: DailyRecord[]) => void;
  onMastersChange: (masters: MasterData) => void;
};

type FusionImportContextValue = {
  fmFiles: File[];
  reportFiles: File[];
  addFm: (list: FileList | File[]) => void;
  addReports: (list: FileList | File[]) => void;
  clearFm: () => void;
  clearReports: () => void;
  busy: boolean;
  canImport: boolean;
  handleFusion: () => Promise<void>;
  lastSummary: string;
  messages: string[];
  reviewRecords: DailyRecord[];
  reviewRecordIds: string[];
  recordsSnapshot: DailyRecord[];
  onDismissReview: () => void;
  onReviewRecordsChange: (records: DailyRecord[]) => void;
};

const FusionImportContext = createContext<FusionImportContextValue | null>(null);

function useFusionImportContext(): FusionImportContextValue {
  const ctx = useContext(FusionImportContext);
  if (!ctx) {
    throw new Error("FusionImport context is missing");
  }
  return ctx;
}

function FusionImportProvider({
  children,
  records,
  masters,
  onRecordsChange,
  onMastersChange,
}: FusionImportProps & { children: ReactNode }) {
  const [fmFiles, setFmFiles] = useState<File[]>([]);
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [lastSummary, setLastSummary] = useState("");
  const [reviewRecordIds, setReviewRecordIds] = useState<string[]>([]);
  const [reviewRecords, setReviewRecords] = useState<DailyRecord[]>([]);
  const [recordsSnapshot, setRecordsSnapshot] = useState<DailyRecord[]>(records);

  const addFm = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list).filter((f) =>
      /\.(xlsx|xls|csv)$/i.test(f.name),
    );
    if (incoming.length === 0) return;
    setFmFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
    setMessages([]);
    setLastSummary("");
  }, []);

  const addReports = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list).filter((f) =>
      /\.(xlsx|xls|csv)$/i.test(f.name),
    );
    if (incoming.length === 0) return;
    setReportFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
    setMessages([]);
    setLastSummary("");
  }, []);

  const canImport = fmFiles.length > 0 || reportFiles.length > 0;

  const handleFusion = useCallback(async () => {
    if (!canImport) return;
    setBusy(true);
    try {
      const result = await importFusionBatch(
        fmFiles,
        reportFiles,
        records,
        masters,
      );
      onRecordsChange(result.records);
      setRecordsSnapshot(result.records);
      onMastersChange(result.masters);
      setMessages(result.messages);
      setReviewRecordIds(result.reviewRecordIds);
      setReviewRecords(
        pickReviewRecords(result.records, result.reviewRecordIds),
      );
      const driverCount = new Set(
        pickReviewRecords(result.records, result.reviewRecordIds).map(
          (r) => `${r.date}|${r.driverName}`,
        ),
      ).size;
      const hasFm = fmFiles.length > 0;
      const hasReport = reportFiles.length > 0;
      const modeLabel =
        hasFm && hasReport
          ? "融合インポート完了"
          : hasFm
            ? "FM配車取り込み完了"
            : "運転日報取り込み完了";
      setLastSummary(
        `${modeLabel}: ${driverCount} 名 / 成功 ${result.importedCount} 件`,
      );
      setFmFiles([]);
      setReportFiles([]);
    } finally {
      setBusy(false);
    }
  }, [
    canImport,
    fmFiles,
    reportFiles,
    records,
    masters,
    onRecordsChange,
    onMastersChange,
  ]);

  const ctx: FusionImportContextValue = {
    fmFiles,
    reportFiles,
    addFm,
    addReports,
    clearFm: () => setFmFiles([]),
    clearReports: () => setReportFiles([]),
    busy,
    canImport,
    handleFusion,
    lastSummary,
    messages,
    reviewRecords,
    reviewRecordIds,
    recordsSnapshot,
    onDismissReview: () => {
      setReviewRecordIds([]);
      setReviewRecords([]);
    },
    onReviewRecordsChange: (next) => {
      onRecordsChange(next);
      setRecordsSnapshot(next);
      setReviewRecords(pickReviewRecords(next, reviewRecordIds));
    },
  };

  return (
    <FusionImportContext.Provider value={ctx}>
      {children}
    </FusionImportContext.Provider>
  );
}

function FusionImportResults({
  masters,
  onMastersChange,
}: {
  masters: MasterData;
  onMastersChange: (masters: MasterData) => void;
}) {
  const {
    messages,
    reviewRecords,
    recordsSnapshot,
    onDismissReview,
    onReviewRecordsChange,
  } = useFusionImportContext();

  if (reviewRecords.length === 0 && messages.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 space-y-3">
      {reviewRecords.length > 0 && (
        <FusionImportReview
          reviewRecords={reviewRecords}
          allRecords={recordsSnapshot}
          masters={masters}
          onRecordsChange={onReviewRecordsChange}
          onMastersChange={onMastersChange}
          onDismiss={onDismissReview}
        />
      )}

      {messages.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-background p-3 font-mono text-xs text-muted-foreground">
          {messages.map((m, i) => (
            <li key={`${i}-${m}`}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FusionFileMakerImportCard() {
  const { fmFiles, addFm, clearFm, busy, canImport, handleFusion, lastSummary } =
    useFusionImportContext();

  return (
    <Card className="flex h-full min-h-[360px] flex-col border-amber-200/80 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20">
      <CardHeader className="shrink-0 pb-2">
        <CardTitle className="text-sm font-semibold">② FM配車（任意）</CardTitle>
        <CardDescription className="text-xs leading-snug">
          FileMakerスケジュール・売上
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
        <ImportDropZone
          hint="Excel (.xlsx) 推奨・CSV可（複数可）"
          files={fmFiles}
          onAdd={addFm}
          onClear={clearFm}
          accent="amber"
        />
        <div className="mt-auto space-y-2">
          <Button
            type="button"
            size="sm"
            className="h-9 w-full"
            disabled={!canImport || busy}
            onClick={() => void handleFusion()}
          >
            {busy ? "取り込み中…" : "FM配車データを反映"}
          </Button>
          {lastSummary && (
            <p className="line-clamp-2 text-xs font-medium text-amber-900 dark:text-amber-200">
              {lastSummary}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function FusionDrivingReportImportCard() {
  const {
    reportFiles,
    addReports,
    clearReports,
    busy,
    canImport,
    handleFusion,
    lastSummary,
  } = useFusionImportContext();

  return (
    <Card className="flex h-full min-h-[360px] flex-col border-indigo-200/80 bg-indigo-50/30 dark:border-indigo-900 dark:bg-indigo-950/20">
      <CardHeader className="shrink-0 pb-2">
        <CardTitle className="text-sm font-semibold">
          ③ 運転日報（任意）
        </CardTitle>
        <CardDescription className="text-xs leading-snug">
          デジタコ See-Drive 日報
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
        <ImportDropZone
          hint="F09:Excel CSV / Excel（複数可）"
          files={reportFiles}
          onAdd={addReports}
          onClear={clearReports}
          accent="indigo"
        />
        <div className="mt-auto space-y-2">
          <Button
            type="button"
            size="sm"
            className="h-9 w-full"
            disabled={!canImport || busy}
            onClick={() => void handleFusion()}
          >
            {busy ? "取り込み中…" : "運転日報データを反映"}
          </Button>
          {lastSummary && (
            <p className="line-clamp-2 text-xs font-medium text-indigo-900 dark:text-indigo-200">
              {lastSummary}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function FusionImport(props: FusionImportProps) {
  return (
    <FusionImportProvider {...props}>
      <div className="contents">
        <FusionFileMakerImportCard />
        <FusionDrivingReportImportCard />
      </div>
      <FusionImportResults
        masters={props.masters}
        onMastersChange={props.onMastersChange}
      />
    </FusionImportProvider>
  );
}

const IMPORT_GRID_CLASS =
  "mb-6 grid w-full grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4";

/** 日次入力タブ用：4列グリッド＋取込結果 */
export function DailyImportGrid(
  props: FusionImportProps & {
    rollCall: ReactNode;
    amazonPerformance?: ReactNode;
  },
) {
  const { rollCall, amazonPerformance, ...fusionProps } = props;

  return (
    <FusionImportProvider {...fusionProps}>
      <div className={IMPORT_GRID_CLASS}>
        <div className="min-w-0">{rollCall}</div>
        <div className="min-w-0">
          <FusionFileMakerImportCard />
        </div>
        <div className="min-w-0">
          <FusionDrivingReportImportCard />
        </div>
        {amazonPerformance ? (
          <div className="min-w-0">{amazonPerformance}</div>
        ) : null}
      </div>
      <FusionImportResults
        masters={fusionProps.masters}
        onMastersChange={fusionProps.onMastersChange}
      />
    </FusionImportProvider>
  );
}
