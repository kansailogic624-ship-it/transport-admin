"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ImportDropZoneProps = {
  hint: string;
  files: File[];
  onAdd: (files: FileList | File[]) => void;
  onClear: () => void;
  accept?: string;
  minHeightClass?: string;
  accent?: "default" | "sky" | "amber" | "indigo";
};

const accentRing: Record<NonNullable<ImportDropZoneProps["accent"]>, string> = {
  default: "border-primary bg-primary/5",
  sky: "border-sky-500 bg-sky-100/50 dark:bg-sky-950/40",
  amber: "border-amber-500 bg-amber-100/50 dark:bg-amber-950/40",
  indigo: "border-indigo-500 bg-indigo-100/50 dark:bg-indigo-950/40",
};

export function ImportDropZone({
  hint,
  files,
  onAdd,
  onClear,
  accept = ".csv,.xlsx,.xls",
  minHeightClass = "h-48",
  accent = "default",
}: ImportDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onAdd(e.target.files);
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={cn(
          "flex shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors",
          minHeightClass,
          dragOver
            ? accentRing[accent]
            : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/20",
        )}
      >
        <Upload className="size-6 text-muted-foreground" />
        <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
      </div>
      {files.length > 0 && (
        <div className="space-y-1">
          <ul className="max-h-20 overflow-y-auto rounded border bg-muted/20 p-2 text-xs">
            {files.map((f) => (
              <li key={f.name} className="truncate">
                {f.name}
              </li>
            ))}
          </ul>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            クリア
          </Button>
        </div>
      )}
    </div>
  );
}
