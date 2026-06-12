"use client";

import { ImportDropZone } from "@/components/import-drop-zone";
import { Label } from "@/components/ui/label";
import {
  PREPROCESS_SOURCE_LABELS,
  type PreprocessSourceType,
} from "@/lib/import-preprocessor";

type FileUploadPanelProps = {
  sourceType: PreprocessSourceType;
  onSourceTypeChange: (type: PreprocessSourceType) => void;
  files: File[];
  onAddFiles: (files: FileList | File[]) => void;
  onClearFiles: () => void;
  busy: boolean;
};

const SOURCE_OPTIONS = Object.entries(PREPROCESS_SOURCE_LABELS) as [
  PreprocessSourceType,
  string,
][];

export function FileUploadPanel({
  sourceType,
  onSourceTypeChange,
  files,
  onAddFiles,
  onClearFiles,
  busy,
}: FileUploadPanelProps) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="space-y-2">
        <Label htmlFor="preprocess-source-type">1. データ種別</Label>
        <select
          id="preprocess-source-type"
          className="flex h-9 w-full max-w-md rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
          value={sourceType}
          disabled={busy}
          onChange={(e) =>
            onSourceTypeChange(e.target.value as PreprocessSourceType)
          }
        >
          {SOURCE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>2. ファイルアップロード</Label>
        <ImportDropZone
          hint="Excel (.xlsx/.xls) / CSV — PDFは将来対応"
          files={files}
          onAdd={onAddFiles}
          onClear={onClearFiles}
          accept=".csv,.xlsx,.xls"
          accent="indigo"
          minHeightClass="h-40"
        />
      </div>
    </div>
  );
}
