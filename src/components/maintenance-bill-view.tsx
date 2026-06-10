"use client";

/**
 * 車両整備請求書管理画面 v2
 *
 * - PDF アップロード or テキスト貼り付けによる自動解析
 * - 業者名・請求書種別（整備費 / 部品代 / 一括）の自動判定
 * - 車両別内訳プレビュー → 確認後に保存（重複防止）
 * - 元号→西暦の自動変換
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Upload,
  FileUp,
  Car,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  VehiclePlateSelect,
  normalizeVehicleForMaster,
} from "@/components/vehicle-plate-select";
import { formatYen, safeNumber } from "@/lib/currency-format";
import {
  FuelBillImportForm,
  TollCsvImportForm,
} from "@/components/vehicle-expense-import-forms";
import {
  loadMaintenanceBills,
  loadMasters,
  deleteMaintenanceBill,
  loadVehicleExpensesByBillId,
  upsertBillWithExpenses,
} from "@/services/firestore-storage";
import {
  parseBillText,
  buildMaintenanceBill,
  buildVehicleExpenseRecords,
  parseVehicleTable,
  computeBillTotalsFromVehicles,
  parseJapaneseDate,
  parseJapaneseBillingMonth,
  parseAmount,
  formatBillingMonth,
  formatJapaneseDate,
  type ParsedVehicleEntry,
} from "@/lib/maintenance-bill-parser";
import { extractTextFromPdf, type OcrProgress } from "@/lib/pdf-extract";
import { isKashimaBillText } from "@/lib/fuel-bill-parser";
import type { BillType, VehicleExpenseRecord, VehicleMaintenanceBill } from "@/lib/types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const BILL_TYPE_OPTIONS: BillType[] = ["整備費", "部品代", "一括", "その他"];

const BILL_TYPE_COLOR: Record<BillType, string> = {
  整備費: "bg-blue-100 text-blue-800 border-blue-200",
  部品代: "bg-orange-100 text-orange-800 border-orange-200",
  一括: "bg-purple-100 text-purple-800 border-purple-200",
  燃料代: "bg-amber-100 text-amber-900 border-amber-200",
  高速代: "bg-teal-100 text-teal-900 border-teal-200",
  その他: "bg-gray-100 text-gray-700 border-gray-200",
};

type ImportMode = "maintenance" | "fuel" | "toll";

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

type FormState = {
  vendorName: string;
  clientName: string;
  billingMonth: string;
  issueDate: string;
  billType: BillType;
  totalAmount: string;
  maintenanceSubtotalExTax: string;
  taxAmount: string;
  expensesSubtotal: string;
  memo: string;
};

const EMPTY_FORM: FormState = {
  vendorName: "",
  clientName: "",
  billingMonth: "",
  issueDate: "",
  billType: "その他",
  totalAmount: "",
  maintenanceSubtotalExTax: "",
  taxAmount: "",
  expensesSubtotal: "",
  memo: "",
};

/** 編集可能な車両行（UI用ID付き） */
type EditableVehicleRow = ParsedVehicleEntry & {
  id: string;
  /** OCRで読み取ったがマスタ未登録の車番 */
  ocrHint?: string;
};

function emptyVehicleRow(): EditableVehicleRow {
  return {
    id: crypto.randomUUID(),
    vehicleNumber: "",
    ocrHint: "",
    workDescription: "",
    laborFee: 0,
    partsFee: 0,
    commonExpense: 0,
    totalAmount: 0,
  };
}

function sanitizeEditableRow(
  e: ParsedVehicleEntry,
  vehicles: string[],
): EditableVehicleRow {
  const { vehicleNumber, ocrHint } = normalizeVehicleForMaster(
    e.vehicleNumber,
    vehicles,
  );
  const labor = safeNumber(e.laborFee);
  const parts = safeNumber(e.partsFee);
  const common = safeNumber(e.commonExpense);
  const total = safeNumber(e.totalAmount) || labor + parts + common;
  return {
    id: crypto.randomUUID(),
    vehicleNumber,
    ocrHint,
    workDescription: e.workDescription ?? "",
    laborFee: labor,
    partsFee: parts,
    commonExpense: common,
    totalAmount: total,
  };
}

function rowLineTotal(r: EditableVehicleRow): number {
  const labor = safeNumber(r.laborFee);
  const parts = safeNumber(r.partsFee);
  const common = safeNumber(r.commonExpense);
  const total = safeNumber(r.totalAmount);
  return total > 0 ? total : labor + parts + common;
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function MaintenanceBillView() {
  const [bills, setBills] = useState<VehicleMaintenanceBill[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [sourceFileName, setSourceFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedExpenses, setExpandedExpenses] = useState<
    Record<string, VehicleExpenseRecord[]>
  >({});
  const [parseResult, setParseResult] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showTextFallback, setShowTextFallback] = useState(false);
  /** 車両別内訳（編集可能） */
  const [vehiclePreview, setVehiclePreview] = useState<EditableVehicleRow[]>([]);
  const [vehicleList, setVehicleList] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("maintenance");
  const [fuelPrefill, setFuelPrefill] = useState<{
    text: string;
    fileName?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await loadMaintenanceBills();
    setBills(data);
  }, []);

  useEffect(() => {
    void load();
    void loadMasters().then((m) => setVehicleList(m.vehicles ?? []));
  }, [load]);

  /** 車両行の合計をフォーム上部にリアルタイム反映 */
  const syncFormFromVehicles = useCallback((rows: EditableVehicleRow[]) => {
    const filled = rows.filter((r) => r.vehicleNumber.trim() || rowLineTotal(r) > 0);
    if (filled.length === 0) return;
    const totals = computeBillTotalsFromVehicles(filled);
    setForm((f) => ({
      ...f,
      maintenanceSubtotalExTax: String(safeNumber(totals.maintenanceSubtotalExTax)),
      expensesSubtotal: String(safeNumber(totals.expensesSubtotal)),
      taxAmount: String(safeNumber(totals.taxAmount)),
      totalAmount: String(safeNumber(totals.totalAmount)),
    }));
  }, []);

  const updateVehicleRow = useCallback(
    (id: string, patch: Partial<EditableVehicleRow>) => {
      setVehiclePreview((prev) => {
        const next = prev.map((r) => {
          if (r.id !== id) return r;
          const updated = {
            ...r,
            ...patch,
            laborFee: safeNumber(patch.laborFee ?? r.laborFee),
            partsFee: safeNumber(patch.partsFee ?? r.partsFee),
            commonExpense: safeNumber(patch.commonExpense ?? r.commonExpense),
            totalAmount: safeNumber(patch.totalAmount ?? r.totalAmount),
          };
          if (
            patch.laborFee !== undefined ||
            patch.partsFee !== undefined ||
            patch.commonExpense !== undefined
          ) {
            if (patch.totalAmount === undefined) {
              updated.totalAmount =
                updated.laborFee + updated.partsFee + updated.commonExpense;
            }
          }
          return updated;
        });
        syncFormFromVehicles(next);
        return next;
      });
    },
    [syncFormFromVehicles],
  );

  const addVehicleRow = useCallback(() => {
    setVehiclePreview((prev) => [...prev, emptyVehicleRow()]);
  }, []);

  const removeVehicleRow = useCallback(
    (id: string) => {
      setVehiclePreview((prev) => {
        const next = prev.filter((r) => r.id !== id);
        syncFormFromVehicles(next);
        return next;
      });
    },
    [syncFormFromVehicles],
  );

  // ---------------------------------------------------------------------------
  // テキスト解析共通処理
  // ---------------------------------------------------------------------------

  const applyParsedText = (text: string, fileName?: string) => {
    const parsed = parseBillText(text);

    setForm({
      vendorName: parsed.vendorName ?? "",
      clientName: parsed.clientName ?? "",
      billingMonth: parsed.billingMonth ?? "",
      issueDate: parsed.issueDate ?? "",
      billType: parsed.billType ?? "その他",
      totalAmount: String(safeNumber(parsed.totalAmount)),
      maintenanceSubtotalExTax: String(safeNumber(parsed.maintenanceSubtotalExTax)),
      taxAmount: String(safeNumber(parsed.taxAmount)),
      expensesSubtotal: String(safeNumber(parsed.expensesSubtotal)),
      memo: "",
    });

    // ファイル名の自動設定
    if (fileName && !sourceFileName) setSourceFileName(fileName);

    // 車両別内訳を解析（超緩和パーサー + 三菱ふそう対応）
    const billType = parsed.billType ?? "その他";
    const vehicles = parseVehicleTable(text, billType);
    const editable = vehicles.map((v) => sanitizeEditableRow(v, vehicleList));
    setVehiclePreview(editable);
    if (editable.length > 0) syncFormFromVehicles(editable);

    // 解析フィードバック
    const flds: [string, string | undefined][] = [
      ["業者名", parsed.vendorName],
      ["種別", parsed.billType],
      ["請求月", parsed.billingMonth],
      ["発行日", parsed.issueDate],
      ["御請求総額", safeNumber(parsed.totalAmount) > 0 ? formatYen(parsed.totalAmount) : ""],
      ["整備費(税抜)", safeNumber(parsed.maintenanceSubtotalExTax) > 0 ? formatYen(parsed.maintenanceSubtotalExTax) : ""],
      ["消費税", safeNumber(parsed.taxAmount) > 0 ? formatYen(parsed.taxAmount) : ""],
      ["諸費用", safeNumber(parsed.expensesSubtotal) > 0 ? formatYen(parsed.expensesSubtotal) : ""],
    ];
    const filled = flds.filter(([, v]) => v).map(([k, v]) => `✓ ${k}: ${v}`);
    const empty = flds.filter(([, v]) => !v).map(([k]) => `△ ${k}: 未取得`);
    const vehicleLine =
      vehicles.length > 0
        ? `\n🚛 車両明細 ${vehicles.length}件 を検出`
        : "\n⚠ 車両明細は検出されませんでした（下の② で手動入力可能）";
    setParseResult([...filled, ...empty].join("\n") + vehicleLine);
  };

  // ---------------------------------------------------------------------------
  // PDF 処理
  // ---------------------------------------------------------------------------

  const processPdfFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setParseResult("⚠ PDFファイル（.pdf）を選択してください。");
      return;
    }
    setPdfLoading(true);
    setPdfFileName(null);
    setParseResult(null);
    setVehiclePreview([]);
    setOcrProgress(null);
    try {
      const { text, usedOcr } = await extractTextFromPdf(file, (p) => {
        setOcrProgress(p);
      });

      if (!text.trim()) {
        setParseResult(
          "⚠ テキスト抽出とOCR処理の両方に失敗しました。\nスキャン画質が低すぎる可能性があります。テキスト入力欄から手動で入力してください。",
        );
        setShowTextFallback(true);
        return;
      }

      if (isKashimaBillText(text, file.name)) {
        setPdfFileName(file.name);
        setImportMode("fuel");
        setFuelPrefill({ text, fileName: file.name });
        setParseResult(
          "✓ 加島様燃料代請求書を検出しました。「燃料代（加島）」タブで車番計のみ集計します。",
        );
        if (usedOcr) {
          setParseResult(
            (prev) =>
              (prev ?? "") +
              "\n\n📷 OCRで読み取りました。車両・金額をご確認ください。",
          );
        }
        return;
      }

      setPdfFileName(file.name);
      applyParsedText(text, file.name);

      if (usedOcr) {
        // OCR使用時は解析結果の末尾にOCR旨を追記
        setParseResult((prev) =>
          (prev ?? "") + "\n\n📷 OCRで文字認識しました。認識精度に限界があるため、金額・車両番号をご確認ください。",
        );
      }
    } catch (err) {
      console.error("PDF解析エラー:", err);
      setParseResult(
        `⚠ PDF解析中にエラーが発生しました:\n${err instanceof Error ? err.message : String(err)}\n\nテキスト入力欄から手動で入力してください。`,
      );
      setShowTextFallback(true);
    } finally {
      setPdfLoading(false);
      setOcrProgress(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processPdfFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void processPdfFile(file);
  };

  // テキスト手動解析
  const handleParseText = () => {
    const trimmed = pasteText.trim();
    if (!trimmed) {
      setParseResult("⚠ テキストエリアが空です。請求書の文字をコピーして貼り付けてください。");
      return;
    }
    if (isKashimaBillText(trimmed)) {
      setImportMode("fuel");
      setFuelPrefill({ text: trimmed });
      setParseResult(
        "✓ 加島様燃料代テキストを検出しました。「燃料代（加島）」タブで車番計のみ集計します。",
      );
      return;
    }
    setVehiclePreview([]);
    applyParsedText(trimmed);
  };

  // ---------------------------------------------------------------------------
  // 発行日・請求月の入力ブラー変換
  // ---------------------------------------------------------------------------

  const handleIssueDateBlur = (raw: string) => {
    const converted = parseJapaneseDate(raw);
    if (converted) setForm((f) => ({ ...f, issueDate: converted }));
  };

  const handleBillingMonthBlur = (raw: string) => {
    const converted = parseJapaneseBillingMonth(raw);
    if (converted) setForm((f) => ({ ...f, billingMonth: converted }));
  };

  // ---------------------------------------------------------------------------
  // 保存
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!form.vendorName.trim()) {
      alert("請求元（業者名）を入力してください");
      return;
    }
    if (!form.billingMonth.trim()) {
      alert("請求月（例: 2026-05）を入力してください");
      return;
    }
    setSaving(true);
    try {
      const bill = buildMaintenanceBill(
        {
          vendorName: form.vendorName,
          clientName: form.clientName,
          billingMonth: parseJapaneseBillingMonth(form.billingMonth) ?? form.billingMonth,
          issueDate: parseJapaneseDate(form.issueDate) ?? form.issueDate,
          billType: form.billType,
          totalAmount: parseAmount(form.totalAmount),
          maintenanceSubtotalExTax: parseAmount(form.maintenanceSubtotalExTax),
          taxAmount: parseAmount(form.taxAmount),
          expensesSubtotal: parseAmount(form.expensesSubtotal),
        },
        { memo: form.memo, sourceFileName, billType: form.billType },
      );

      const validRows = vehiclePreview.filter(
        (r) => r.vehicleNumber.trim() || rowLineTotal(r) > 0,
      );
      const expenseRecords =
        validRows.length > 0
          ? buildVehicleExpenseRecords(validRows, bill)
          : [];
      await upsertBillWithExpenses(bill, expenseRecords);

      await load();
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setPasteText("");
    setSourceFileName("");
    setPdfFileName(null);
    setParseResult(null);
    setVehiclePreview([]);
    setOcrProgress(null);
    setShowTextFallback(false);
    setShowForm(false);
    setImportMode("maintenance");
  };

  // ---------------------------------------------------------------------------
  // 削除
  // ---------------------------------------------------------------------------

  const handleDelete = async (id: string) => {
    await deleteMaintenanceBill(id);
    setDeleteConfirmId(null);
    setExpandedExpenses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await load();
  };

  // ---------------------------------------------------------------------------
  // 展開・車両明細ロード
  // ---------------------------------------------------------------------------

  const toggleExpand = async (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // 車両明細を非同期でロード
        void loadVehicleExpensesByBillId(id).then((expenses) => {
          setExpandedExpenses((e) => ({ ...e, [id]: expenses }));
        });
      }
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // 集計
  // ---------------------------------------------------------------------------

  const totalAll = bills.reduce((s, b) => s + b.totalAmount, 0);
  const monthGroups = bills.reduce<Record<string, VehicleMaintenanceBill[]>>(
    (acc, b) => {
      const ym = b.billingMonth || "不明";
      (acc[ym] ??= []).push(b);
      return acc;
    },
    {},
  );

  // ---------------------------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">車両経費管理</h2>
          <p className="text-xs text-muted-foreground">
            整備費・燃料代（加島様）・高速代（KJS/コーポ）を車両別に登録・集計
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-1 size-4" />
          請求書を登録
        </Button>
      </div>

      {/* ── 登録フォーム ── */}
      {showForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="px-4 py-2.5">
            <CardTitle className="text-sm">新規経費の登録</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["maintenance", "整備請求書"],
                  ["fuel", "燃料代（加島）"],
                  ["toll", "高速代CSV"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setImportMode(mode)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    importMode === mode
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted-foreground/30 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {importMode === "fuel" && (
              <FuelBillImportForm
                vehicles={vehicleList}
                initialText={fuelPrefill?.text}
                initialFileName={fuelPrefill?.fileName}
                onPrefillConsumed={() => setFuelPrefill(null)}
                onSaved={() => {
                  void load();
                  resetForm();
                }}
                onCancel={resetForm}
              />
            )}

            {importMode === "toll" && (
              <TollCsvImportForm
                vehicles={vehicleList}
                onSaved={() => {
                  void load();
                  resetForm();
                }}
                onCancel={resetForm}
              />
            )}

            {importMode === "maintenance" && (
            <>
            {/* ① PDF / テキスト入力 */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">
                ① PDFをアップロード、またはテキストを貼り付けて自動解析
              </Label>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileInputChange}
              />

              {/* ドロップゾーン */}
              <div
                role="button"
                tabIndex={0}
                className={`flex min-h-[90px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {pdfLoading ? (
                  <div className="w-full space-y-2 px-2">
                    {ocrProgress ? (
                      <>
                        {/* OCR進捗バー */}
                        <div className="flex items-center gap-2">
                          <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          <p className="text-xs text-muted-foreground leading-tight">
                            {ocrProgress.stage}
                          </p>
                        </div>
                        <div className="w-full overflow-hidden rounded-full bg-muted h-2">
                          <div
                            className="h-2 rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${ocrProgress.percent}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>
                            {ocrProgress.page && ocrProgress.totalPages
                              ? `ページ ${ocrProgress.page} / ${ocrProgress.totalPages}`
                              : "OCR処理中"}
                          </span>
                          <span className="tabular-nums">{ocrProgress.percent}%</span>
                        </div>
                        {ocrProgress.percent < 15 && (
                          <p className="text-[10px] text-amber-600 leading-tight">
                            💡 初回実行時は日本語学習データ（約15MB）のダウンロードが発生します。しばらくお待ちください。
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <p className="text-xs text-muted-foreground">PDFを読み込み中...</p>
                      </div>
                    )}
                  </div>
                ) : pdfFileName ? (
                  <>
                    <FileUp className="size-7 text-green-600" />
                    <p className="text-xs font-medium text-green-700">✓ {pdfFileName}</p>
                    <p className="text-[11px] text-muted-foreground">別ファイルを選ぶ場合はクリック</p>
                  </>
                ) : (
                  <>
                    <Upload className="size-7 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-muted-foreground">
                      PDFをドラッグ＆ドロップ
                    </p>
                    <p className="text-xs text-muted-foreground">またはクリックしてファイルを選択</p>
                  </>
                )}
              </div>

              {/* 解析結果フィードバック */}
              {parseResult && (
                <pre
                  className={`rounded px-3 py-2 text-[11px] leading-5 whitespace-pre-wrap ${
                    parseResult.startsWith("⚠")
                      ? "border border-red-200 bg-red-50 text-red-700"
                      : "bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {parseResult}
                </pre>
              )}

              {/* テキスト入力フォールバック */}
              <div>
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => setShowTextFallback((v) => !v)}
                >
                  {showTextFallback ? "▲ テキスト入力を隠す" : "▼ テキストで入力する場合はこちら"}
                </button>
                {showTextFallback && (
                  <div className="mt-2 space-y-1">
                    <textarea
                      className="w-full rounded border bg-background px-3 py-2 text-xs font-mono placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      rows={7}
                      placeholder={
                        `請求元：株式会社ダイサブ\n請求先：株式会社カンサイロジック\n請求対象月：2026年6月度（R8.5.1〜R8.5.31）\n請求年月日：R8. 6. 2\n御請求総額：333,431円\n\n--- 車両別内訳 ---\n京都101あ600　オイル交換　25,000　27,500\n大阪330さ1234　タイヤ交換　38,000　41,800`
                      }
                      value={pasteText}
                      onChange={(e) => {
                        setPasteText(e.target.value);
                        setParseResult(null);
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={handleParseText}
                      >
                        テキストから自動入力
                      </Button>
                      {pasteText.trim() === "" && (
                        <span className="text-[11px] text-muted-foreground">
                          ← 上にテキストを貼り付けてからクリック
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── 車両別内訳（編集可能） ── */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/60">
              <div className="flex flex-wrap items-center gap-2 border-b border-blue-200 px-3 py-2">
                <Car className="size-4 text-blue-600" />
                <span className="text-xs font-semibold text-blue-800">
                  車両別内訳（{vehiclePreview.length}件）
                </span>
                <span className="text-[11px] text-blue-600">
                  読み落としは下のボタンで追記・修正できます
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7 border-blue-300 text-xs text-blue-800 hover:bg-blue-100"
                  onClick={addVehicleRow}
                >
                  <Plus className="mr-1 size-3" />
                  車両経費を手動で追加
                </Button>
              </div>

              {vehiclePreview.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-blue-700/80">
                  車両が検出されませんでした。「＋車両経費を手動で追加」から入力してください。
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-blue-200 text-blue-700">
                        <th className="min-w-[140px] px-2 py-1.5 text-left font-medium">車両ナンバー</th>
                        <th className="min-w-[80px] px-1 py-1.5 text-right font-medium">技術料</th>
                        <th className="min-w-[80px] px-1 py-1.5 text-right font-medium">部品代</th>
                        <th className="min-w-[80px] px-1 py-1.5 text-right font-medium">諸費用</th>
                        <th className="min-w-[80px] px-1 py-1.5 text-right font-medium">合計</th>
                        <th className="w-8 px-1 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {vehiclePreview.map((v) => (
                        <tr
                          key={v.id}
                          className="border-b border-blue-100 last:border-0 hover:bg-blue-50/80"
                        >
                          <td className="px-2 py-1">
                            <VehiclePlateSelect
                              value={v.vehicleNumber}
                              vehicles={vehicleList}
                              ocrHint={v.ocrHint}
                              onChange={(plate) =>
                                updateVehicleRow(v.id, {
                                  vehicleNumber: plate,
                                  ocrHint: plate ? "" : v.ocrHint,
                                })
                              }
                            />
                          </td>
                          <td className="px-1 py-1">
                            <CurrencyInput
                              className="h-7 text-xs"
                              value={safeNumber(v.laborFee)}
                              onChange={(n) =>
                                updateVehicleRow(v.id, { laborFee: n })
                              }
                            />
                          </td>
                          <td className="px-1 py-1">
                            <CurrencyInput
                              className="h-7 text-xs"
                              value={safeNumber(v.partsFee)}
                              onChange={(n) =>
                                updateVehicleRow(v.id, { partsFee: n })
                              }
                            />
                          </td>
                          <td className="px-1 py-1">
                            <CurrencyInput
                              className="h-7 text-xs"
                              value={safeNumber(v.commonExpense)}
                              onChange={(n) =>
                                updateVehicleRow(v.id, { commonExpense: n })
                              }
                            />
                          </td>
                          <td className="px-1 py-1">
                            <CurrencyInput
                              className="h-7 text-xs font-semibold"
                              value={safeNumber(v.totalAmount)}
                              onChange={(n) =>
                                updateVehicleRow(v.id, { totalAmount: n })
                              }
                            />
                          </td>
                          <td className="px-1 py-1 text-center">
                            <button
                              type="button"
                              className="rounded p-1 text-red-500 hover:bg-red-50"
                              title="行を削除"
                              onClick={() => removeVehicleRow(v.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-100/80 font-semibold">
                        <td className="px-2 py-1.5 text-blue-800">合計</td>
                        <td className="px-1 py-1.5 text-right tabular-nums text-blue-800">
                          {formatYen(vehiclePreview.reduce((s, v) => s + safeNumber(v.laborFee), 0))}
                        </td>
                        <td className="px-1 py-1.5 text-right tabular-nums text-blue-800">
                          {formatYen(vehiclePreview.reduce((s, v) => s + safeNumber(v.partsFee), 0))}
                        </td>
                        <td className="px-1 py-1.5 text-right tabular-nums text-blue-800">
                          {formatYen(vehiclePreview.reduce((s, v) => s + safeNumber(v.commonExpense), 0))}
                        </td>
                        <td className="px-1 py-1.5 text-right tabular-nums font-bold text-blue-900">
                          {formatYen(vehiclePreview.reduce((s, v) => s + rowLineTotal(v), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

            </div>

            {/* ② 各項目の確認・入力 */}
            <div className="border-t pt-3">
              <Label className="mb-2 block text-xs font-semibold">
                ② 各項目を確認・入力
              </Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="請求元（業者名）＊" required>
                  <Input
                    className="h-8 text-sm"
                    placeholder="株式会社ダイサブ"
                    value={form.vendorName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, vendorName: e.target.value }))
                    }
                  />
                </FieldRow>

                {/* 請求書種別 */}
                <FieldRow label="請求書種別＊">
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {BILL_TYPE_OPTIONS.map((bt) => (
                      <button
                        key={bt}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, billType: bt }))}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          form.billType === bt
                            ? BILL_TYPE_COLOR[bt]
                            : "border-muted-foreground/30 bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {bt}
                      </button>
                    ))}
                  </div>
                </FieldRow>

                <FieldRow label="請求先">
                  <Input
                    className="h-8 text-sm"
                    placeholder="株式会社カンサイロジック"
                    value={form.clientName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, clientName: e.target.value }))
                    }
                  />
                </FieldRow>
                <FieldRow label="請求対象月＊" hint="例: 2026-05 / R8.5">
                  <Input
                    className="h-8 text-sm"
                    placeholder="2026-05"
                    value={form.billingMonth}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, billingMonth: e.target.value }))
                    }
                    onBlur={(e) => handleBillingMonthBlur(e.target.value)}
                  />
                </FieldRow>
                <FieldRow label="発行日" hint="例: R8.6.2">
                  <Input
                    className="h-8 text-sm"
                    placeholder="2026-06-02"
                    value={form.issueDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, issueDate: e.target.value }))
                    }
                    onBlur={(e) => handleIssueDateBlur(e.target.value)}
                  />
                </FieldRow>
                <FieldRow label="御請求総額（円）">
                  <CurrencyInput
                    className="h-8 text-sm"
                    value={safeNumber(form.totalAmount)}
                    onChange={(n) =>
                      setForm((f) => ({ ...f, totalAmount: String(n) }))
                    }
                  />
                </FieldRow>
                <FieldRow label="整備費（税抜）（円）">
                  <CurrencyInput
                    className="h-8 text-sm"
                    value={safeNumber(form.maintenanceSubtotalExTax)}
                    onChange={(n) =>
                      setForm((f) => ({
                        ...f,
                        maintenanceSubtotalExTax: String(n),
                      }))
                    }
                  />
                </FieldRow>
                <FieldRow label="消費税（円）">
                  <CurrencyInput
                    className="h-8 text-sm"
                    value={safeNumber(form.taxAmount)}
                    onChange={(n) =>
                      setForm((f) => ({ ...f, taxAmount: String(n) }))
                    }
                  />
                </FieldRow>
                <FieldRow label="諸費用小計（円）">
                  <CurrencyInput
                    className="h-8 text-sm"
                    value={safeNumber(form.expensesSubtotal)}
                    onChange={(n) =>
                      setForm((f) => ({
                        ...f,
                        expensesSubtotal: String(n),
                      }))
                    }
                  />
                </FieldRow>
                <FieldRow label="ソースファイル名" hint="任意">
                  <Input
                    className="h-8 text-sm"
                    placeholder="ダイサブ請求書【5月度】.pdf"
                    value={sourceFileName}
                    onChange={(e) => setSourceFileName(e.target.value)}
                  />
                </FieldRow>
                <FieldRow label="メモ" hint="任意">
                  <Input
                    className="h-8 text-sm"
                    placeholder="備考など"
                    value={form.memo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, memo: e.target.value }))
                    }
                  />
                </FieldRow>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={resetForm}>
                キャンセル
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "保存中…" : `登録する${vehiclePreview.length > 0 ? `（車両${vehiclePreview.length}件）` : ""}`}
              </Button>
            </div>
            </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 合計バナー ── */}
      {bills.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              登録済み経費 累計総額
            </div>
            <div className="tabular-nums text-xl font-bold text-amber-900 dark:text-amber-100">
              {formatYen(totalAll)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 空状態 ── */}
      {bills.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-muted-foreground">
          <FileText className="mx-auto mb-2 size-8 opacity-40" />
          <p className="text-sm">登録されている請求書はありません</p>
          <p className="mt-1 text-xs">「請求書を登録」から追加してください</p>
        </div>
      )}

      {/* ── 請求書リスト ── */}
      {Object.entries(monthGroups)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([ym, group]) => {
          const monthTotal = group.reduce((s, b) => s + b.totalAmount, 0);
          return (
            <div key={ym} className="space-y-1.5">
              <div className="flex items-center justify-between rounded bg-muted/60 px-3 py-1.5">
                <span className="text-xs font-semibold">{formatBillingMonth(ym)}</span>
                <span className="tabular-nums text-sm font-bold">
                  {formatYen(monthTotal)}
                </span>
              </div>

              {group.map((bill) => {
                const expanded = expandedIds.has(bill.id);
                const expenses = expandedExpenses[bill.id] ?? [];
                return (
                  <Card
                    key={bill.id}
                    className="overflow-hidden transition-shadow hover:shadow-sm"
                  >
                    {/* カードヘッダー */}
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
                      onClick={() => void toggleExpand(bill.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">
                            {bill.vendorName || "（業者名未設定）"}
                          </p>
                          <BillTypeBadge type={bill.billType} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          発行: {formatJapaneseDate(bill.issueDate)}
                          {bill.sourceFileName && (
                            <span className="ml-2 opacity-60">📄 {bill.sourceFileName}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-base font-bold">
                          {formatYen(bill.totalAmount)}
                        </span>
                        {expanded ? (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* 展開詳細 */}
                    {expanded && (
                      <CardContent className="border-t bg-muted/20 px-4 py-3">
                        {/* 金額内訳 */}
                        <dl className="mb-3 grid gap-1.5 text-xs sm:grid-cols-2">
                          <DetailRow label="請求先" value={bill.clientName} />
                          <DetailRow label="整備費（税抜）" value={formatYen(bill.maintenanceSubtotalExTax)} mono />
                          <DetailRow label="消費税" value={formatYen(bill.taxAmount)} mono />
                          <DetailRow label="諸費用小計" value={formatYen(bill.expensesSubtotal)} mono />
                          <DetailRow
                            label="整備費（税込）"
                            value={formatYen(safeNumber(bill.maintenanceSubtotalExTax) + safeNumber(bill.taxAmount))}
                            mono
                          />
                          {bill.memo && <DetailRow label="メモ" value={bill.memo} span />}
                        </dl>

                        {/* 車両別内訳テーブル */}
                        {expenses.length > 0 && (
                          <div className="mb-3">
                            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                              <Car className="size-3" />
                              車両別内訳 （{expenses.length}件）
                            </p>
                            <div className="overflow-x-auto rounded border">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/60">
                                  <tr>
                                    <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">車番</th>
                                    <th className="px-2 py-1 text-right font-medium text-muted-foreground">技術料</th>
                                    <th className="px-2 py-1 text-right font-medium text-muted-foreground">部品代</th>
                                    <th className="px-2 py-1 text-right font-medium text-muted-foreground">諸費用</th>
                                    <th className="px-2 py-1 text-right font-medium text-muted-foreground">合計</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expenses.map((exp) => (
                                    <tr key={exp.id} className="border-t hover:bg-muted/30">
                                      <td className="px-2.5 py-1 font-mono text-[11px]">
                                        {exp.vehicleNumber}
                                      </td>
                                      <td className="px-2 py-1 text-right tabular-nums">
                                        {formatYen(exp.laborFee, { zeroAsDash: true })}
                                      </td>
                                      <td className="px-2 py-1 text-right tabular-nums">
                                        {formatYen(exp.partsFee, { zeroAsDash: true })}
                                      </td>
                                      <td className="px-2 py-1 text-right tabular-nums">
                                        {formatYen(exp.commonExpense, { zeroAsDash: true })}
                                      </td>
                                      <td className="px-2 py-1 text-right tabular-nums font-semibold">
                                        {formatYen(exp.totalAmount)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {expenses.length === 0 && (
                          <p className="mb-3 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <AlertCircle className="size-3" />
                            車両別明細なし（登録時に車両データが含まれていませんでした）
                          </p>
                        )}

                        {/* 削除ボタン */}
                        <div className="flex justify-end">
                          {deleteConfirmId === bill.id ? (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-destructive">本当に削除しますか？</span>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-6 px-2 text-xs"
                                onClick={() => void handleDelete(bill.id)}
                              >
                                削除
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                onClick={() => setDeleteConfirmId(null)}
                              >
                                キャンセル
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteConfirmId(bill.id)}
                            >
                              <Trash2 className="mr-1 size-3" />
                              削除
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 小コンポーネント
// ---------------------------------------------------------------------------

function BillTypeBadge({ type }: { type: BillType | undefined }) {
  if (!type || type === "その他") return null;
  const cls = BILL_TYPE_COLOR[type] ?? BILL_TYPE_COLOR["その他"];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {type}
    </span>
  );
}

function FieldRow({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <Label className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        {hint && <span className="ml-1 text-muted-foreground">（{hint}）</span>}
      </Label>
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  span,
}: {
  label: string;
  value: string | number | undefined;
  mono?: boolean;
  span?: boolean;
}) {
  if (!value && value !== 0) return null;
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "tabular-nums font-medium" : ""}>{value}</dd>
    </div>
  );
}

