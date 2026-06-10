"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Car, Plus, Trash2, Upload, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  VehiclePlateSelect,
  normalizeVehicleForMaster,
} from "@/components/vehicle-plate-select";
import { formatYen, safeNumber } from "@/lib/currency-format";
import { readCsvFileAsShiftJis } from "@/lib/encoding-detect";
import {
  KASHIMA_VENDOR,
  parseKashimaFuelBill,
} from "@/lib/fuel-bill-parser";
import { extractTextFromPdf, type OcrProgress } from "@/lib/pdf-extract";
import { parseJapaneseBillingMonth } from "@/lib/maintenance-bill-parser";
import {
  detectTollCsvKind,
  parseTollCsv,
} from "@/lib/toll-csv-parser";
import {
  buildExpenseBillHeader,
  buildSimpleExpenseRecords,
} from "@/lib/vehicle-expense-build";
import { upsertBillWithExpenses } from "@/services/firestore-storage";

// ---------------------------------------------------------------------------
// 共通：シンプル経費行（燃料代 / 高速代）
// ---------------------------------------------------------------------------

type SimpleExpenseRow = {
  id: string;
  vehicleNumber: string;
  ocrHint?: string;
  totalAmount: number;
  workDescription: string;
};

function emptySimpleRow(desc = ""): SimpleExpenseRow {
  return {
    id: crypto.randomUUID(),
    vehicleNumber: "",
    ocrHint: "",
    totalAmount: 0,
    workDescription: desc,
  };
}

function SimpleExpenseVehicleTable({
  rows,
  vehicles,
  amountLabel,
  onUpdate,
  onAdd,
  onRemove,
}: {
  rows: SimpleExpenseRow[];
  vehicles: string[];
  amountLabel: string;
  onUpdate: (id: string, patch: Partial<SimpleExpenseRow>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-emerald-200 px-3 py-2">
        <Car className="size-4 text-emerald-700" />
        <span className="text-xs font-semibold text-emerald-900">
          車両別集計（{rows.length}件）
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-7 border-emerald-300 text-xs text-emerald-900 hover:bg-emerald-100"
          onClick={onAdd}
        >
          <Plus className="mr-1 size-3" />
          ＋手動で車両を追加
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-emerald-800/80">
          車両が検出されませんでした。「＋手動で車両を追加」から入力してください。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-emerald-200 text-emerald-800">
                <th className="min-w-[160px] px-2 py-1.5 text-left font-medium">
                  車両ナンバー
                </th>
                <th className="min-w-[120px] px-1 py-1.5 text-right font-medium">
                  {amountLabel}
                </th>
                <th className="w-8 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-emerald-100 last:border-0 hover:bg-emerald-50/80"
                >
                  <td className="px-2 py-1">
                    <VehiclePlateSelect
                      value={r.vehicleNumber}
                      vehicles={vehicles}
                      ocrHint={r.ocrHint}
                      onChange={(plate) =>
                        onUpdate(r.id, {
                          vehicleNumber: plate,
                          ocrHint: plate ? "" : r.ocrHint,
                        })
                      }
                    />
                  </td>
                  <td className="px-1 py-1">
                    <CurrencyInput
                      className="h-7 text-xs font-semibold"
                      value={safeNumber(r.totalAmount)}
                      onChange={(n) => onUpdate(r.id, { totalAmount: n })}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      onClick={() => onRemove(r.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-100/80 font-semibold">
                <td className="px-2 py-1.5 text-emerald-900">合計</td>
                <td className="px-1 py-1.5 text-right tabular-nums text-emerald-900">
                  {formatYen(rows.reduce((s, r) => s + safeNumber(r.totalAmount), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function matchFuelCardToVehicle(
  cardKey: string,
  vehicles: string[],
): { vehicleNumber: string; ocrHint: string } {
  const full = normalizeVehicleForMaster(cardKey, vehicles);
  if (full.vehicleNumber) return full;
  const prefix = cardKey.split(/\s+/)[0]?.trim() ?? "";
  if (prefix) {
    const byPrefix = normalizeVehicleForMaster(prefix, vehicles);
    if (byPrefix.vehicleNumber) return byPrefix;
    if (!byPrefix.vehicleNumber && byPrefix.ocrHint) {
      return { vehicleNumber: "", ocrHint: `${cardKey}（${prefix}）` };
    }
  }
  return { vehicleNumber: "", ocrHint: cardKey };
}

// ---------------------------------------------------------------------------
// 燃料代（加島様）
// ---------------------------------------------------------------------------

type FuelBillImportFormProps = {
  vehicles: string[];
  onSaved: () => void;
  onCancel: () => void;
  /** 整備タブ等から検出した加島燃料テキストの自動投入 */
  initialText?: string;
  initialFileName?: string;
  onPrefillConsumed?: () => void;
};

export function FuelBillImportForm({
  vehicles,
  onSaved,
  onCancel,
  initialText,
  initialFileName,
  onPrefillConsumed,
}: FuelBillImportFormProps) {
  const [pasteText, setPasteText] = useState("");
  const [billingMonth, setBillingMonth] = useState("");
  const [rows, setRows] = useState<SimpleExpenseRow[]>([]);
  const [parseResult, setParseResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sourceFileName, setSourceFileName] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const updateRow = useCallback((id: string, patch: Partial<SimpleExpenseRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }, []);

  const applyFuelText = useCallback(
    (text: string, fileName?: string) => {
      const parsed = parseKashimaFuelBill(text, fileName);
      if (parsed.vehicles.length === 0) {
        setParseResult(
          "⚠ 車両別燃料明細を検出できませんでした。「車番計」行または給油明細を確認してください。",
        );
        return;
      }
      const editable = parsed.vehicles.map((v) => {
        const { vehicleNumber, ocrHint } = matchFuelCardToVehicle(
          v.cardKey,
          vehicles,
        );
        return {
          id: crypto.randomUUID(),
          vehicleNumber,
          ocrHint: ocrHint || v.cardKey,
          totalAmount: v.totalAmount,
          workDescription: v.workDescription,
        };
      });
      setRows(editable);
      if (parsed.billingMonth) setBillingMonth(parsed.billingMonth);
      if (fileName) setSourceFileName(fileName);
      setPasteText(text);
      setParseResult(
        `✓ 請求元: ${parsed.vendorName}\n✓ 種別: 燃料代\n✓ 請求月: ${parsed.billingMonth || "（要入力）"}\n✓ 車両 ${editable.length}件（車番計のみ集計）\n✓ 合計: ${formatYen(parsed.totalAmount)}`,
      );
    },
    [vehicles],
  );

  useEffect(() => {
    if (!initialText?.trim()) return;
    applyFuelText(initialText, initialFileName);
    onPrefillConsumed?.();
  }, [initialText, initialFileName, onPrefillConsumed, applyFuelText]);

  const ingestFuelFile = async (file: File) => {
    setPdfLoading(true);
    setParseResult(null);
    setOcrProgress(null);
    try {
      const isPdf = /\.pdf$/i.test(file.name) || file.type.includes("pdf");
      if (isPdf) {
        const { text, usedOcr } = await extractTextFromPdf(file, (p) =>
          setOcrProgress(p),
        );
        if (!text.trim()) {
          setParseResult(
            "⚠ PDFからテキストを抽出できませんでした。テキスト貼り付けをお試しください。",
          );
          return;
        }
        applyFuelText(text, file.name);
        if (usedOcr) {
          setParseResult(
            (prev) =>
              (prev ?? "") +
              "\n\n📷 OCRで読み取りました。車両・金額をご確認ください。",
          );
        }
        return;
      }
      const text = await file.text();
      applyFuelText(text, file.name);
    } catch (err) {
      setParseResult(
        `⚠ ファイル読み込みに失敗: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setPdfLoading(false);
      setOcrProgress(null);
    }
  };

  const handleParse = () => {
    const text = pasteText.trim();
    if (!text) {
      setParseResult("⚠ テキストを貼り付けるか、PDFをアップロードしてください。");
      return;
    }
    applyFuelText(text, sourceFileName || undefined);
  };

  const handleSave = async () => {
    const ym =
      parseJapaneseBillingMonth(billingMonth) ?? billingMonth.trim();
    if (!ym) {
      alert("請求月（例: 2026-05）を入力してください");
      return;
    }
    const valid = rows.filter(
      (r) => r.vehicleNumber.trim() || safeNumber(r.totalAmount) > 0,
    );
    if (valid.length === 0) {
      alert("保存する車両データがありません");
      return;
    }
    setSaving(true);
    try {
      const total = valid.reduce((s, r) => s + safeNumber(r.totalAmount), 0);
      const bill = buildExpenseBillHeader({
        vendorName: KASHIMA_VENDOR,
        billingMonth: ym,
        billType: "燃料代",
        totalAmount: total,
        sourceFileName,
        memo: "加島様燃料代請求書インポート",
      });
      const records = buildSimpleExpenseRecords(
        valid.map((r) => ({
          vehicleNumber: r.vehicleNumber,
          totalAmount: safeNumber(r.totalAmount),
          workDescription: r.workDescription,
        })),
        bill,
      );
      await upsertBillWithExpenses(bill, records);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void ingestFuelFile(f);
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={0}
        className={`flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-primary/50"
        }`}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void ingestFuelFile(file);
        }}
      >
        {pdfLoading ? (
          <div className="space-y-1 px-2">
            {ocrProgress ? (
              <p className="text-xs text-muted-foreground">{ocrProgress.stage}</p>
            ) : (
              <p className="text-xs text-muted-foreground">PDFを読み込み中…</p>
            )}
          </div>
        ) : (
          <>
            <FileUp className="size-6 text-muted-foreground/50" />
            <p className="text-xs font-medium text-muted-foreground">
              加島様燃料代 PDF をドラッグ＆ドロップ
            </p>
            <p className="text-[11px] text-muted-foreground">
              .pdf / .PDF 不問 ・ スキャンPDFはOCR自動対応
            </p>
          </>
        )}
      </div>

      <Label className="text-xs font-semibold">
        またはテキストを貼り付け
      </Label>
      <textarea
        className="w-full rounded border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        rows={8}
        placeholder="加島様請求書のテキストをコピー＆ペースト…"
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleParse}>
          テキストから自動入力
        </Button>
      </div>
      {parseResult && (
        <pre className="rounded bg-muted/40 px-3 py-2 text-[11px] whitespace-pre-wrap text-muted-foreground">
          {parseResult}
        </pre>
      )}

      <SimpleExpenseVehicleTable
        rows={rows}
        vehicles={vehicles}
        amountLabel="燃料代"
        onUpdate={updateRow}
        onAdd={() => setRows((p) => [...p, emptySimpleRow("燃料代")])}
        onRemove={(id) => setRows((p) => p.filter((r) => r.id !== id))}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">請求月＊</Label>
          <Input
            className="h-8 text-sm"
            placeholder="2026-05"
            value={billingMonth}
            onChange={(e) => setBillingMonth(e.target.value)}
            onBlur={(e) => {
              const c = parseJapaneseBillingMonth(e.target.value);
              if (c) setBillingMonth(c);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ソースファイル名（任意）</Label>
          <Input
            className="h-8 text-sm"
            value={sourceFileName}
            onChange={(e) => setSourceFileName(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : `燃料代を登録（${rows.length}件）`}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 高速代CSV（KJS / コーポ）
// ---------------------------------------------------------------------------

type TollCsvImportFormProps = {
  vehicles: string[];
  onSaved: () => void;
  onCancel: () => void;
};

export function TollCsvImportForm({
  vehicles,
  onSaved,
  onCancel,
}: TollCsvImportFormProps) {
  const [pasteText, setPasteText] = useState("");
  const [billingMonth, setBillingMonth] = useState("");
  const [rows, setRows] = useState<SimpleExpenseRow[]>([]);
  const [parseResult, setParseResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sourceFileName, setSourceFileName] = useState("");
  const [csvKind, setCsvKind] = useState<"kjs" | "corpo" | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const updateRow = useCallback((id: string, patch: Partial<SimpleExpenseRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }, []);

  const applyCsvText = (text: string, fileName?: string) => {
    let kind = detectTollCsvKind(text, fileName);
    if (!kind) {
      const kjsTry = parseTollCsv(text, "kjs", fileName);
      const corpoTry = parseTollCsv(text, "corpo", fileName);
      if (corpoTry.vehicles.length > 0) kind = "corpo";
      else if (kjsTry.vehicles.length > 0) kind = "kjs";
    }
    if (!kind) {
      setParseResult(
        "⚠ 車番・利用金額（または差引金額）列を検出できませんでした。Shift_JISのCSVかご確認ください。",
      );
      return;
    }
    const parsed = parseTollCsv(text, kind, fileName);
    const editable = parsed.vehicles.map((v) => {
      const { vehicleNumber, ocrHint } = normalizeVehicleForMaster(
        v.rawPlate,
        vehicles,
      );
      return {
        id: crypto.randomUUID(),
        vehicleNumber,
        ocrHint: ocrHint || v.rawPlate,
        totalAmount: v.totalAmount,
        workDescription: kind === "kjs" ? "KJS高速明細" : "コーポ高速明細",
      };
    });
    setRows(editable);
    setCsvKind(kind);
    if (parsed.billingMonth) setBillingMonth(parsed.billingMonth);
    if (fileName) setSourceFileName(fileName);
    setParseResult(
      `✓ 種別: ${parsed.vendorName}\n✓ 車番 ${editable.length}件\n✓ 合計: ${formatYen(parsed.totalAmount)}`,
    );
  };

  const ingestCsvFile = async (file: File) => {
    setFileLoading(true);
    setParseResult(null);
    try {
      const text = await readCsvFileAsShiftJis(file);
      setPasteText(text);
      setSourceFileName(file.name);
      applyCsvText(text, file.name);
    } catch (err) {
      setParseResult(
        `⚠ ファイル読み込みに失敗しました: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setFileLoading(false);
    }
  };

  const handleParsePaste = () => {
    const text = pasteText.trim();
    if (!text) {
      setParseResult("⚠ CSVテキストを貼り付けるか、ファイルをアップロードしてください。");
      return;
    }
    applyCsvText(text, sourceFileName);
  };

  const handleSave = async () => {
    const ym =
      parseJapaneseBillingMonth(billingMonth) ?? billingMonth.trim();
    if (!ym) {
      alert("請求月を入力してください");
      return;
    }
    if (!csvKind) {
      alert("先にCSVを解析してください");
      return;
    }
    const valid = rows.filter(
      (r) => r.vehicleNumber.trim() || safeNumber(r.totalAmount) > 0,
    );
    if (valid.length === 0) {
      alert("保存する車両データがありません");
      return;
    }
    setSaving(true);
    try {
      const vendorName =
        csvKind === "kjs" ? "KJS高速明細" : "コーポ高速明細";
      const total = valid.reduce((s, r) => s + safeNumber(r.totalAmount), 0);
      const bill = buildExpenseBillHeader({
        vendorName,
        billingMonth: ym,
        billType: "高速代",
        totalAmount: total,
        sourceFileName,
        memo: `${vendorName} CSVインポート`,
      });
      const records = buildSimpleExpenseRecords(
        valid.map((r) => ({
          vehicleNumber: r.vehicleNumber,
          totalAmount: safeNumber(r.totalAmount),
          workDescription: r.workDescription,
        })),
        bill,
      );
      await upsertBillWithExpenses(bill, records);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* accept 制限なし — .CSV/.csv/MIME不問で受け入れ */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void ingestCsvFile(f);
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={0}
        className={`flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-primary/50"
        }`}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void ingestCsvFile(file);
        }}
      >
        {fileLoading ? (
          <p className="text-xs text-muted-foreground">CSVを読み込み中…</p>
        ) : (
          <>
            <Upload className="size-6 text-muted-foreground/50" />
            <p className="text-xs font-medium text-muted-foreground">
              KJS / コーポ明細 CSVをドラッグ＆ドロップ
            </p>
            <p className="text-[11px] text-muted-foreground">
              .csv / .CSV ・ MIME不問 ・ Shift_JISで自動読込
            </p>
          </>
        )}
      </div>

      <textarea
        className="w-full rounded border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        rows={6}
        placeholder="またはCSVテキストを貼り付け…"
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
      />
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleParsePaste}>
        CSVを解析して自動入力
      </Button>

      {parseResult && (
        <pre className="rounded bg-muted/40 px-3 py-2 text-[11px] whitespace-pre-wrap text-muted-foreground">
          {parseResult}
        </pre>
      )}

      <SimpleExpenseVehicleTable
        rows={rows}
        vehicles={vehicles}
        amountLabel="高速代"
        onUpdate={updateRow}
        onAdd={() => setRows((p) => [...p, emptySimpleRow("高速代")])}
        onRemove={(id) => setRows((p) => p.filter((r) => r.id !== id))}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">請求月＊</Label>
          <Input
            className="h-8 text-sm"
            placeholder="2026-05"
            value={billingMonth}
            onChange={(e) => setBillingMonth(e.target.value)}
            onBlur={(e) => {
              const c = parseJapaneseBillingMonth(e.target.value);
              if (c) setBillingMonth(c);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ソースファイル名（任意）</Label>
          <Input
            className="h-8 text-sm"
            value={sourceFileName}
            onChange={(e) => setSourceFileName(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : `高速代を登録（${rows.length}件）`}
        </Button>
      </div>
    </div>
  );
}
