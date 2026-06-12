"use client";

/**
 * 車両整備請求書管理画面 v2
 *
 * - PDF アップロード or テキスト貼り付けによる自動解析
 * - 業者名・請求書種別（整備費 / 部品代 / 一括）の自動判定
 * - 車両別内訳プレビュー → 確認後に保存（重複防止）
 * - 元号→西暦の自動変換
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Pencil,
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
  loadVehicleDetails,
  deleteMaintenanceBill,
  getMaintenanceBillById,
  loadVehicleExpensesByBillId,
  updateBillWithExpenses,
  upsertBillWithExpenses,
} from "@/services/firestore-storage";
import { extractInvoiceWithAi } from "@/lib/invoice-ocr-client";
import {
  buildEditedSnapshot,
  buildOcrOriginalSnapshot,
} from "@/lib/invoice-bill-snapshot";
import { extractInvoiceMeta } from "@/lib/invoice-ocr-normalize";
import {
  parseBillText,
  buildMaintenanceBill,
  buildVehicleExpenseRecords,
  computeBillTotalsFromVehicles,
  computeVehicleRowTotal,
  parseJapaneseDate,
  parseJapaneseBillingMonth,
  parseAmount,
  extractRegistrationHintsFromText,
  formatBillingMonth,
  formatJapaneseDate,
  suggestRowConsumptionTax,
  splitInclusiveAmounts,
  TAX_CATEGORY_OPTIONS,
  MAINTENANCE_TYPE_OPTIONS,
  type ParsedVehicleEntry,
  type VehicleRowTaxCategory,
} from "@/lib/maintenance-bill-parser";
import {
  ensureParsedVehicleEntries,
  parseMaintenanceBillOcr,
} from "@/lib/maintenance-bill-ocr-summary";
import { isValidInvoiceVehicleNumber } from "@/lib/maintenance-bill-parser";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { matchVehicleFromRegistrationHints } from "@/components/vehicle-plate-select";
import {
  buildActiveVehicleSelectOptions,
  type VehicleSelectOption,
} from "@/lib/vehicle-select-options";
import { extractTextFromPdf, type OcrProgress } from "@/lib/pdf-extract";
import { isKashimaBillText } from "@/lib/fuel-bill-parser";
import type {
  BillType,
  InvoiceOcrSnapshot,
  MaintenanceType,
  VehicleExpenseRecord,
  VehicleMaintenanceBill,
} from "@/lib/types";

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
  /** 消費税を手動上書きした場合 true */
  taxAmountManual?: boolean;
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
    consumptionTax: 0,
    maintenanceType: "その他",
    totalAmount: 0,
    taxCategory: "ex_tax",
  };
}

function applyRowAmounts(
  row: EditableVehicleRow,
  patch: Partial<EditableVehicleRow>,
): EditableVehicleRow {
  let taxCategory = (patch.taxCategory ?? row.taxCategory ?? "ex_tax") as VehicleRowTaxCategory;
  let laborFee = safeNumber(patch.laborFee ?? row.laborFee);
  let partsFee = safeNumber(patch.partsFee ?? row.partsFee);
  let commonExpense = safeNumber(patch.commonExpense ?? row.commonExpense);

  const amountFieldsChanged =
    patch.laborFee !== undefined ||
    patch.partsFee !== undefined ||
    patch.commonExpense !== undefined ||
    patch.taxCategory !== undefined;
  const userEditedTax = patch.consumptionTax !== undefined;

  let taxAmountManual = userEditedTax
    ? true
    : amountFieldsChanged
      ? false
      : row.taxAmountManual ?? false;

  let consumptionTax: number;

  if (taxCategory === "incl_tax" && amountFieldsChanged && !userEditedTax) {
    const split = splitInclusiveAmounts(laborFee, partsFee, commonExpense);
    laborFee = split.laborFee;
    partsFee = split.partsFee;
    commonExpense = split.commonExpense;
    consumptionTax = split.consumptionTax;
    taxCategory = "ex_tax";
    taxAmountManual = false;
  } else if (userEditedTax) {
    consumptionTax = safeNumber(patch.consumptionTax);
  } else if (taxAmountManual && !amountFieldsChanged) {
    consumptionTax = safeNumber(row.consumptionTax);
  } else {
    consumptionTax = suggestRowConsumptionTax(
      laborFee,
      partsFee,
      commonExpense,
      taxCategory,
    );
  }

  const totalAmount = laborFee + partsFee + commonExpense + consumptionTax;

  return {
    ...row,
    ...patch,
    laborFee,
    partsFee,
    commonExpense,
    taxCategory,
    consumptionTax,
    taxAmountManual,
    maintenanceType: (patch.maintenanceType ??
      row.maintenanceType ??
      "その他") as MaintenanceType,
    totalAmount,
  };
}

function sanitizeEditableRow(
  e: ParsedVehicleEntry,
  vehicles: unknown,
  registrationHints: string[] = [],
): EditableVehicleRow {
  const safeVehicleNumber = e.vehicleNumber ?? "";
  let { vehicleNumber, ocrHint } = normalizeVehicleForMaster(
    safeVehicleNumber,
    vehicles ?? [],
  );
  const hints = (registrationHints ?? []).filter(isValidInvoiceVehicleNumber);
  const rowLooksLikeVehicle = isValidInvoiceVehicleNumber(safeVehicleNumber);

  if (!vehicleNumber && hints.length === 1 && rowLooksLikeVehicle) {
    const fromHints = matchVehicleFromRegistrationHints(hints, vehicles ?? []);
    if (fromHints) {
      vehicleNumber = fromHints;
      ocrHint = "";
    }
  } else if (!vehicleNumber && hints.length === 1 && !rowLooksLikeVehicle) {
    const rowDigits = safeVehicleNumber.replace(/\D/g, "");
    const hintDigits = hints[0]!.replace(/\D/g, "");
    if (rowDigits && hintDigits && rowDigits === hintDigits) {
      const fromHints = matchVehicleFromRegistrationHints(hints, vehicles ?? []);
      if (fromHints) {
        vehicleNumber = fromHints;
        ocrHint = "";
      }
    }
  }
  const labor = safeNumber(e.laborFee);
  const parts = safeNumber(e.partsFee);
  const common = safeNumber(e.commonExpense);
  const taxCategory = e.taxCategory ?? "ex_tax";
  const suggestedTax = suggestRowConsumptionTax(labor, parts, common, taxCategory);
  const consumptionTax =
    e.consumptionTax !== undefined && e.consumptionTax !== null
      ? safeNumber(e.consumptionTax)
      : suggestedTax;
  const total = computeVehicleRowTotal({
    laborFee: labor,
    partsFee: parts,
    commonExpense: common,
    consumptionTax,
    taxCategory,
  });
  return {
    id: crypto.randomUUID(),
    vehicleNumber,
    ocrHint,
    workDescription: e.workDescription ?? "",
    laborFee: labor,
    partsFee: parts,
    commonExpense: common,
    consumptionTax,
    maintenanceType: e.maintenanceType ?? "その他",
    totalAmount: total,
    taxCategory,
    taxAmountManual:
      e.consumptionTax !== undefined &&
      e.consumptionTax !== null &&
      safeNumber(e.consumptionTax) !== suggestedTax,
  };
}

function rowLineTotal(r: EditableVehicleRow): number {
  return computeVehicleRowTotal(r);
}

function expenseToEditableRow(exp: VehicleExpenseRecord): EditableVehicleRow {
  return applyRowAmounts(
    {
      id: crypto.randomUUID(),
      vehicleNumber: exp.vehicleNumber ?? "",
      ocrHint: "",
      workDescription: exp.workDescription ?? "",
      laborFee: safeNumber(exp.laborFee),
      partsFee: safeNumber(exp.partsFee),
      commonExpense: safeNumber(exp.commonExpense),
      consumptionTax: safeNumber(exp.consumptionTax),
      maintenanceType: exp.maintenanceType ?? "その他",
      totalAmount: safeNumber(exp.totalAmount),
      taxCategory: "ex_tax",
    },
    {},
  );
}

const PARSE_FAIL_MESSAGE =
  "解析結果が取得できませんでした。\n手入力または編集画面から登録してください。";

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

type MaintenanceBillViewProps = {
  /** 車両経費保存後に AppShell の共有 state を更新する */
  onVehicleExpensesChange?: () => void | Promise<void>;
};

export function MaintenanceBillView({
  onVehicleExpensesChange,
}: MaintenanceBillViewProps = {}) {
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
  const [vehicleList, setVehicleList] = useState<VehicleSelectOption[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("maintenance");
  const [fuelPrefill, setFuelPrefill] = useState<{
    text: string;
    fileName?: string;
  } | null>(null);
  const [taxInferred, setTaxInferred] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | null>(null);
  const [ocrOriginalSnapshot, setOcrOriginalSnapshot] =
    useState<InvoiceOcrSnapshot | null>(null);
  const [lastParsedText, setLastParsedText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** ユーザーが選択したインポートモード（ファイル読込で勝手に切り替えない） */
  const importModeRef = useRef<ImportMode>("maintenance");

  useEffect(() => {
    importModeRef.current = importMode;
  }, [importMode]);

  /** 新規ファイル読込前に OCR 関連ステートを完全初期化 */
  const resetOcrSession = useCallback((opts?: { clearPasteText?: boolean }) => {
    setVehiclePreview([]);
    setParseResult(null);
    setOcrProgress(null);
    setShowTextFallback(false);
    setPdfFileName(null);
    setFuelPrefill(null);
    setTaxInferred(false);
    setForm(EMPTY_FORM);
    setSourceFileName("");
    setPdfLoading(false);
    setEditingBillId(null);
    setEditingCreatedAt(null);
    setOcrOriginalSnapshot(null);
    setLastParsedText("");
    setAiParsing(false);
    if (opts?.clearPasteText) {
      setPasteText("");
    }
  }, []);

  const handleImportModeChange = useCallback(
    (mode: ImportMode) => {
      importModeRef.current = mode;
      setImportMode(mode);
      resetOcrSession({ clearPasteText: true });
    },
    [resetOcrSession],
  );

  const exTaxTotal = useMemo(
    () =>
      safeNumber(form.maintenanceSubtotalExTax) +
      safeNumber(form.expensesSubtotal),
    [form.maintenanceSubtotalExTax, form.expensesSubtotal],
  );
  const taxTotal = safeNumber(form.taxAmount);
  const inclTaxTotal = exTaxTotal + taxTotal;

  const load = useCallback(async () => {
    const data = await loadMaintenanceBills();
    setBills(data);
  }, []);

  const notifyVehicleExpensesChange = useCallback(async () => {
    await onVehicleExpensesChange?.();
  }, [onVehicleExpensesChange]);

  useEffect(() => {
    void load();
    void loadVehicleDetails()
      .then((details) => setVehicleList(buildActiveVehicleSelectOptions(details)))
      .catch((err) => {
        console.error("[MaintenanceBill] 車両マスタ読込失敗", err);
        setVehicleList([]);
      });
  }, [load]);

  /** 車両行の合計をフォーム上部にリアルタイム反映 */
  const syncFormFromVehicles = useCallback((rows: EditableVehicleRow[]) => {
    const filled = rows.filter((r) => r.vehicleNumber.trim() || rowLineTotal(r) > 0);
    if (filled.length === 0) return;
    const totals = computeBillTotalsFromVehicles(filled);
    const exTax =
      safeNumber(totals.maintenanceSubtotalExTax) +
      safeNumber(totals.expensesSubtotal);
    const tax = safeNumber(totals.taxAmount);
    setForm((f) => ({
      ...f,
      maintenanceSubtotalExTax: String(safeNumber(totals.maintenanceSubtotalExTax)),
      expensesSubtotal: String(safeNumber(totals.expensesSubtotal)),
      taxAmount: String(tax),
      totalAmount: String(exTax + tax),
    }));
  }, []);

  const updateVehicleRow = useCallback(
    (id: string, patch: Partial<EditableVehicleRow>) => {
      setVehiclePreview((prev) => {
        const next = prev.map((r) =>
          r.id === id ? applyRowAmounts(r, patch) : r,
        );
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

  const applyParsedText = async (
    text: string,
    fileName?: string,
    options?: { pdfExtractionMode?: "native_text" | "ocr_fallback" },
  ) => {
    const logTag = "[MaintenanceBillOCR]";
    const textPreview = text.slice(0, 3000);
    setLastParsedText(text);
    setShowForm(true);

    let parsed: ReturnType<typeof parseBillText>;
    try {
      parsed = parseBillText(text);
    } catch (err) {
      console.error(logTag, "parseBillText が例外を投げました（継続して部分表示）", {
        error: err,
        textLength: text.length,
        textPreview,
      });
      parsed = { rawText: text, billType: "その他" };
    }

    let registrationHints: string[] = [];
    try {
      registrationHints = extractRegistrationHintsFromText(text);
    } catch (err) {
      console.error(logTag, "extractRegistrationHintsFromText 失敗", err);
    }

    setTaxInferred(parsed.taxInferred === true);

    const billType = parsed.billType ?? "その他";

    let aiResponse: unknown;
    let aiNote = "";
    setAiParsing(true);
    try {
      const aiResult = await extractInvoiceWithAi(text);
      if (aiResult.success && aiResult.data) {
        aiResponse = aiResult.data;
        aiNote = "\n🤖 AIテキスト解析を適用";
        const aiVendor = extractInvoiceMeta(aiResponse).vendor_name;
        if (aiVendor) parsed = { ...parsed, vendorName: aiVendor };
      } else if (!aiResult.skipped) {
        aiNote = "\n△ AI解析スキップ（テキストベース解析にフォールバック）";
      }
    } catch (err) {
      console.error(logTag, "AI解析失敗 — フォールバック継続", err);
      aiNote = "\n△ AI解析エラー（テキストベース解析にフォールバック）";
    } finally {
      setAiParsing(false);
    }

    setForm({
      vendorName: parsed.vendorName ?? "",
      clientName: parsed.clientName ?? "",
      billingMonth: parsed.billingMonth ?? "",
      issueDate: parsed.issueDate ?? "",
      billType,
      totalAmount: String(safeNumber(parsed.totalAmount)),
      maintenanceSubtotalExTax: String(safeNumber(parsed.maintenanceSubtotalExTax)),
      taxAmount: String(safeNumber(parsed.taxAmount)),
      expensesSubtotal: String(safeNumber(parsed.expensesSubtotal)),
      memo: "",
    });

    if (fileName && !sourceFileName) setSourceFileName(fileName);

    const ocrResult = parseMaintenanceBillOcr(text, billType, parsed, aiResponse);
    let vehicles = ensureParsedVehicleEntries(ocrResult.vehicles).filter((v) =>
      isValidInvoiceVehicleNumber(v.vehicleNumber ?? ""),
    );
    const ocrHasData = ocrResult.hasData && vehicles.length > 0;

    if (!ocrHasData) {
      console.error(logTag, "解析結果0件 — 空テーブル表示（手動入力可）", {
        vendorName: parsed.vendorName,
        billType,
        textLength: text.length,
        fullText: text,
      });
    }

    const safeVehicleList = Array.isArray(vehicleList) ? vehicleList : [];
    const safeHints = Array.isArray(registrationHints) ? registrationHints : [];

    let editable: EditableVehicleRow[] = [];
    try {
      editable = vehicles.map((v) =>
        sanitizeEditableRow(v, safeVehicleList, safeHints),
      );
    } catch (err) {
      console.error(logTag, "sanitizeEditableRow で失敗（行ごとにスキップ）", {
        error: err,
        vehicleCount: vehicles.length,
      });
      editable = vehicles.flatMap((v) => {
        try {
          return [sanitizeEditableRow(v, safeVehicleList, safeHints)];
        } catch (rowErr) {
          console.error(logTag, "行のサニタイズ失敗", { row: v, error: rowErr });
          return [];
        }
      });
    }

    setVehiclePreview(editable);
    if (editable.length > 0) {
      syncFormFromVehicles(editable);
    } else if (!ocrHasData) {
      setVehiclePreview([]);
    }

    const exTax =
      safeNumber(parsed.maintenanceSubtotalExTax) +
      safeNumber(parsed.expensesSubtotal);

    // 解析フィードバック
    const flds: [string, string | undefined][] = [
      ["業者名", parsed.vendorName],
      ["種別", parsed.billType],
      ["請求月", parsed.billingMonth],
      ["発行日", parsed.issueDate],
      ["税抜金額", exTax > 0 ? formatYen(exTax) : ""],
      ["消費税額", safeNumber(parsed.taxAmount) > 0 ? formatYen(parsed.taxAmount) : ""],
      ["税込合計", safeNumber(parsed.totalAmount) > 0 ? formatYen(parsed.totalAmount) : ""],
      ["諸費用(内訳)", safeNumber(parsed.expensesSubtotal) > 0 ? formatYen(parsed.expensesSubtotal) : ""],
    ];
    const filled = flds.filter(([, v]) => v).map(([k, v]) => `✓ ${k}: ${v}`);
    const empty = flds.filter(([, v]) => !v).map(([k]) => `△ ${k}: 未取得`);
    const taxSummary = vehicles
      .map((v) => v.taxCategory)
      .filter(Boolean)
      .reduce<Record<string, number>>((acc, cat) => {
        const k = cat ?? "ex_tax";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
    const taxLine = Object.keys(taxSummary).length
      ? `\n📋 税区分: ${Object.entries(taxSummary)
          .map(([k, n]) => {
            const label =
              TAX_CATEGORY_OPTIONS.find((o) => o.value === k)?.label ?? k;
            return `${label}×${n}`;
          })
          .join(" / ")}`
      : "";
    const extractionModeLine =
      ocrResult.extractionMode === "text"
        ? "\n📄 テキストベース解析（PDF生テキストから車両番号・金額を直接検索）"
        : ocrResult.extractionMode === "legacy"
          ? "\n📋 補完パーサーで解析（テキスト抽出で不足分を補完）"
          : "";
    const pdfSourceLine =
      options?.pdfExtractionMode === "native_text"
        ? "\n✓ PDFネイティブテキスト抽出（画像変換なし）"
        : options?.pdfExtractionMode === "ocr_fallback"
          ? "\n📷 スキャンPDFのためOCRでテキスト化後に解析"
          : "";
    const snapshot = buildOcrOriginalSnapshot({
      rawText: text,
      extractionMode: ocrResult.extractionMode ?? "text",
      pdfExtractionMode: options?.pdfExtractionMode,
      ocrResult,
      aiResponse,
      vendorName: parsed.vendorName,
    });
    setOcrOriginalSnapshot(snapshot);

    const vehicleLine = ocrHasData
      ? `\n🚛 車両別内訳: ${vehicles.length}件を反映（金額はフロント側で数値化・税込逆算）${taxLine}${extractionModeLine}${pdfSourceLine}${aiNote}\n💡 諸費用（重量税等）は「諸費用」欄へ手入力してください`
      : `\n⚠ ${PARSE_FAIL_MESSAGE}`;
    const inferredLine = parsed.taxInferred
      ? "\n💡 税抜・消費税は税込合計からの推測値です。②で目視確認してください。"
      : "";
    setParseResult([...filled, ...empty].join("\n") + vehicleLine + inferredLine);
  };

  const setExTaxTotal = (amount: number) => {
    setTaxInferred(false);
    setForm((f) => {
      const expenses = safeNumber(f.expensesSubtotal);
      const maintenance = Math.max(0, amount - expenses);
      const exTax = maintenance + expenses;
      const tax = safeNumber(f.taxAmount);
      return {
        ...f,
        maintenanceSubtotalExTax: String(maintenance),
        totalAmount: String(exTax + tax),
      };
    });
  };

  const setTaxAmountField = (amount: number) => {
    setTaxInferred(false);
    setForm((f) => {
      const exTax =
        safeNumber(f.maintenanceSubtotalExTax) + safeNumber(f.expensesSubtotal);
      return {
        ...f,
        taxAmount: String(amount),
        totalAmount: String(exTax + amount),
      };
    });
  };

  // ---------------------------------------------------------------------------
  // PDF 処理
  // ---------------------------------------------------------------------------

  const processPdfFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      resetOcrSession({ clearPasteText: true });
      setParseResult("⚠ PDFファイル（.pdf）を選択してください。");
      return;
    }

    resetOcrSession({ clearPasteText: true });
    const activeMode = importModeRef.current;
    setPdfLoading(true);

    try {
      const { text, usedOcr, extractionMode } = await extractTextFromPdf(file, (p) => {
        setOcrProgress(p);
      });

      if (!text.trim()) {
        setParseResult(
          "⚠ テキスト抽出とOCR処理の両方に失敗しました。\nスキャン画質が低すぎる可能性があります。テキスト入力欄から手動で入力してください。",
        );
        setShowTextFallback(true);
        return;
      }

      if (activeMode === "fuel") {
        if (isKashimaBillText(text, file.name)) {
          setPdfFileName(file.name);
          setFuelPrefill({ text, fileName: file.name });
          setParseResult(
            "✓ 加島様燃料代請求書を検出しました。車番計を車両別に自動入力します。",
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
        setParseResult(
          "⚠ 燃料代請求書として認識できませんでした。「整備請求書」タブで読み込んでください。",
        );
        return;
      }

      if (activeMode === "toll") {
        setParseResult("⚠ 高速代は CSV ファイルをアップロードしてください。");
        return;
      }

      if (isKashimaBillText(text, file.name)) {
        setParseResult(
          "⚠ 燃料代請求書です。「燃料代（加島）」タブを選択してアップロードしてください。",
        );
        return;
      }

      setPdfFileName(file.name);
      await applyParsedText(text, file.name, { pdfExtractionMode: extractionMode });

      if (usedOcr) {
        setParseResult((prev) =>
          (prev ?? "") +
          "\n\n📷 スキャン画像PDFのためOCRで文字認識しました。レイアウト差の影響を受けやすいため、金額・車両番号をご確認ください。",
        );
      }
    } catch (err) {
      console.error("[MaintenanceBillOCR] PDF解析エラー:", err);
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
  const handleParseText = async () => {
    const trimmed = pasteText.trim();
    if (!trimmed) {
      setParseResult("⚠ テキストエリアが空です。請求書の文字をコピーして貼り付けてください。");
      return;
    }

    resetOcrSession();

    const activeMode = importModeRef.current;
    if (activeMode === "fuel" && isKashimaBillText(trimmed)) {
      setFuelPrefill({ text: trimmed });
      setParseResult(
        "✓ 加島様燃料代テキストを検出しました。車番計を車両別に自動入力します。",
      );
      return;
    }

    if (activeMode === "maintenance" && isKashimaBillText(trimmed)) {
      setParseResult(
        "⚠ 燃料代請求書のテキストです。「燃料代（加島）」タブを選択してください。",
      );
      return;
    }

    if (activeMode !== "maintenance") {
      setParseResult("⚠ 整備請求書タブを選択してからテキストを解析してください。");
      return;
    }

    try {
      await applyParsedText(trimmed);
    } catch (err) {
      console.error("[MaintenanceBillOCR] テキスト貼り付け解析エラー:", {
        error: err,
        textLength: trimmed.length,
        fullText: trimmed,
      });
      setParseResult(
        `⚠ 解析中にエラーが発生しましたが、テキストは保持されています。\n${err instanceof Error ? err.message : String(err)}\n\n車両別内訳は手動で追加できます。`,
      );
    }
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
      const billingMonth =
        parseJapaneseBillingMonth(form.billingMonth) ?? form.billingMonth;
      const issueDate =
        parseJapaneseDate(form.issueDate) ?? form.issueDate;

      const validRows = vehiclePreview.filter(
        (r) => r.vehicleNumber.trim() || rowLineTotal(r) > 0,
      );

      const editedSnapshot = buildEditedSnapshot({
        vendorName: form.vendorName,
        clientName: form.clientName,
        billingMonth,
        issueDate,
        billType: form.billType,
        totalAmount: inclTaxTotal,
        maintenanceSubtotalExTax: parseAmount(form.maintenanceSubtotalExTax),
        taxAmount: parseAmount(form.taxAmount),
        expensesSubtotal: parseAmount(form.expensesSubtotal),
        memo: form.memo,
        vehicles: validRows,
      });

      const existingBill = editingBillId
        ? await getMaintenanceBillById(editingBillId)
        : undefined;

      const bill = buildMaintenanceBill(
        {
          vendorName: form.vendorName,
          clientName: form.clientName,
          billingMonth,
          issueDate,
          billType: form.billType,
          totalAmount: inclTaxTotal,
          maintenanceSubtotalExTax: parseAmount(form.maintenanceSubtotalExTax),
          taxAmount: parseAmount(form.taxAmount),
          expensesSubtotal: parseAmount(form.expensesSubtotal),
        },
        {
          id: editingBillId ?? undefined,
          createdAt: editingCreatedAt ?? existingBill?.createdAt,
          memo: form.memo,
          sourceFileName,
          billType: form.billType,
          ocrOriginalData:
            existingBill?.ocrOriginalData ?? ocrOriginalSnapshot ?? undefined,
          editedData: editedSnapshot,
        },
      );

      const expenseRecords =
        validRows.length > 0
          ? buildVehicleExpenseRecords(validRows, bill)
          : [];

      if (editingBillId) {
        await updateBillWithExpenses(bill, expenseRecords);
      } else {
        await upsertBillWithExpenses(bill, expenseRecords);
      }

      await load();
      await notifyVehicleExpensesChange();
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (bill: VehicleMaintenanceBill) => {
    const expenses = await loadVehicleExpensesByBillId(bill.id);
    setEditingBillId(bill.id);
    setEditingCreatedAt(bill.createdAt);
    setOcrOriginalSnapshot(bill.ocrOriginalData ?? null);
    setLastParsedText(bill.ocrOriginalData?.rawText ?? "");
    setSourceFileName(bill.sourceFileName ?? "");
    setTaxInferred(false);
    setForm({
      vendorName: bill.vendorName,
      clientName: bill.clientName,
      billingMonth: bill.billingMonth,
      issueDate: bill.issueDate,
      billType: bill.billType,
      totalAmount: String(safeNumber(bill.totalAmount)),
      maintenanceSubtotalExTax: String(safeNumber(bill.maintenanceSubtotalExTax)),
      taxAmount: String(safeNumber(bill.taxAmount)),
      expensesSubtotal: String(safeNumber(bill.expensesSubtotal)),
      memo: bill.memo ?? "",
    });
    setVehiclePreview(
      expenses.length > 0
        ? expenses.map(expenseToEditableRow)
        : [emptyVehicleRow()],
    );
    setParseResult(
      bill.editedData
        ? "✏️ 編集モード — 保存すると編集内容がFirestoreに反映されます。"
        : "✏️ 編集モード — 車両別内訳を修正して保存してください。",
    );
    setShowForm(true);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(bill.id);
      return next;
    });
  };

  const resetForm = () => {
    resetOcrSession({ clearPasteText: true });
    setShowForm(false);
    importModeRef.current = "maintenance";
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
    await notifyVehicleExpensesChange();
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
        <Button
          size="sm"
          onClick={() => {
            if (showForm) {
              resetForm();
            } else {
              resetOcrSession();
              setShowForm(true);
            }
          }}
        >
          <Plus className="mr-1 size-4" />
          請求書を登録
        </Button>
      </div>

      {/* ── 登録フォーム ── */}
      {showForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="px-4 py-2.5">
            <CardTitle className="text-sm">
              {editingBillId ? "✏️ 請求書の編集" : "新規経費の登録"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4">
            {!editingBillId && (
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
                  onClick={() => handleImportModeChange(mode)}
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
            )}

            {importMode === "fuel" && !editingBillId && (
              <FuelBillImportForm
                vehicles={vehicleList}
                initialText={fuelPrefill?.text}
                initialFileName={fuelPrefill?.fileName}
                onPrefillConsumed={() => setFuelPrefill(null)}
                onSaved={() => {
                  void load().then(() => notifyVehicleExpensesChange());
                  resetForm();
                }}
                onCancel={resetForm}
              />
            )}

            {importMode === "toll" && !editingBillId && (
              <TollCsvImportForm
                vehicles={vehicleList}
                onSaved={() => {
                  void load().then(() => notifyVehicleExpensesChange());
                  resetForm();
                }}
                onCancel={resetForm}
              />
            )}

            {(importMode === "maintenance" || editingBillId) && (
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
                        <th className="min-w-[120px] px-1 py-1.5 text-left font-medium">整備種別</th>
                        <th className="min-w-[100px] px-1 py-1.5 text-left font-medium">税区分</th>
                        <th className="min-w-[80px] px-1 py-1.5 text-right font-medium">技術料</th>
                        <th className="min-w-[80px] px-1 py-1.5 text-right font-medium">部品代</th>
                        <th className="min-w-[72px] px-1 py-1.5 text-right font-medium">消費税</th>
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
                            <Select
                              value={v.maintenanceType ?? "その他"}
                              onValueChange={(val) =>
                                updateVehicleRow(v.id, {
                                  maintenanceType: val as MaintenanceType,
                                })
                              }
                            >
                              <SelectTrigger className="h-7 w-full text-[10px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MAINTENANCE_TYPE_OPTIONS.map((opt) => (
                                  <SelectItem
                                    key={opt.value}
                                    value={opt.value}
                                    className="text-xs"
                                  >
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-1 py-1">
                            <Select
                              value={v.taxCategory ?? "ex_tax"}
                              onValueChange={(val) =>
                                updateVehicleRow(v.id, {
                                  taxCategory: val as VehicleRowTaxCategory,
                                })
                              }
                            >
                              <SelectTrigger className="h-7 w-full text-[10px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TAX_CATEGORY_OPTIONS.map((opt) => (
                                  <SelectItem
                                    key={opt.value}
                                    value={opt.value}
                                    className="text-xs"
                                  >
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
                              value={safeNumber(v.consumptionTax)}
                              onChange={(n) =>
                                updateVehicleRow(v.id, { consumptionTax: n })
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
                          <td className="px-1 py-1 text-right">
                            <div className="tabular-nums text-xs font-semibold">
                              {formatYen(rowLineTotal(v))}
                            </div>
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
                        <td />
                        <td />
                        <td className="px-1 py-1.5 text-right tabular-nums text-blue-800">
                          {formatYen(vehiclePreview.reduce((s, v) => s + safeNumber(v.laborFee), 0))}
                        </td>
                        <td className="px-1 py-1.5 text-right tabular-nums text-blue-800">
                          {formatYen(vehiclePreview.reduce((s, v) => s + safeNumber(v.partsFee), 0))}
                        </td>
                        <td className="px-1 py-1.5 text-right tabular-nums text-blue-800">
                          {formatYen(vehiclePreview.reduce((s, v) => s + safeNumber(v.consumptionTax), 0))}
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
              <div className="sm:col-span-2 rounded-lg border border-amber-200/80 bg-amber-50/40 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-amber-900">
                    金額内訳（税区分）
                  </span>
                  {taxInferred && (
                    <Badge
                      variant="outline"
                      className="border-amber-500 bg-amber-100 text-[10px] text-amber-800"
                    >
                      推測値 — 目視で確認してください
                    </Badge>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FieldRow
                    label="税抜金額（円）"
                    hint="小計・本体価格・今回売上金額"
                  >
                    <CurrencyInput
                      className={`h-8 text-sm ${taxInferred ? "border-amber-400 bg-amber-50/80" : ""}`}
                      value={exTaxTotal}
                      onChange={setExTaxTotal}
                    />
                  </FieldRow>
                  <FieldRow label="消費税額（円）" hint="消費税・地方消費税">
                    <CurrencyInput
                      className={`h-8 text-sm ${taxInferred ? "border-amber-400 bg-amber-50/80" : ""}`}
                      value={taxTotal}
                      onChange={setTaxAmountField}
                    />
                  </FieldRow>
                  <FieldRow label="税込合計金額（円）" hint="税抜 ＋ 消費税（自動計算）">
                    <div className="flex h-8 items-center rounded-md border bg-muted/50 px-3 text-sm font-bold tabular-nums">
                      {formatYen(inclTaxTotal)}
                    </div>
                  </FieldRow>
                </div>
                {safeNumber(form.expensesSubtotal) > 0 && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    諸費用（税抜内訳）: {formatYen(form.expensesSubtotal)}
                    {" — "}
                    車両別テーブルの諸費用列と連動
                  </p>
                )}
              </div>
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
              <Button size="sm" onClick={() => void handleSave()} disabled={saving || aiParsing}>
                {saving
                  ? "保存中…"
                  : aiParsing
                    ? "AI解析中…"
                    : editingBillId
                      ? `更新保存${vehiclePreview.length > 0 ? `（車両${vehiclePreview.length}件）` : ""}`
                      : `確定${vehiclePreview.length > 0 ? `（車両${vehiclePreview.length}件）` : ""}`}
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
                          <DetailRow
                            label="税抜金額"
                            value={formatYen(
                              safeNumber(bill.maintenanceSubtotalExTax) +
                                safeNumber(bill.expensesSubtotal),
                            )}
                            mono
                          />
                          <DetailRow label="消費税額" value={formatYen(bill.taxAmount)} mono />
                          <DetailRow label="税込合計" value={formatYen(bill.totalAmount)} mono />
                          {safeNumber(bill.expensesSubtotal) > 0 && (
                            <DetailRow
                              label="諸費用（内訳）"
                              value={formatYen(bill.expensesSubtotal)}
                              mono
                            />
                          )}
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
                                    <th className="px-2 py-1 text-left font-medium text-muted-foreground">整備種別</th>
                                    <th className="px-2 py-1 text-right font-medium text-muted-foreground">技術料</th>
                                    <th className="px-2 py-1 text-right font-medium text-muted-foreground">部品代</th>
                                    <th className="px-2 py-1 text-right font-medium text-muted-foreground">消費税</th>
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
                                      <td className="px-2 py-1 text-[11px]">
                                        {exp.maintenanceType ?? "—"}
                                      </td>
                                      <td className="px-2 py-1 text-right tabular-nums">
                                        {formatYen(exp.laborFee, { zeroAsDash: true })}
                                      </td>
                                      <td className="px-2 py-1 text-right tabular-nums">
                                        {formatYen(exp.partsFee, { zeroAsDash: true })}
                                      </td>
                                      <td className="px-2 py-1 text-right tabular-nums">
                                        {formatYen(exp.consumptionTax ?? 0, { zeroAsDash: true })}
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

                        {/* 編集・削除 */}
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={() => void handleEdit(bill)}
                          >
                            <Pencil className="mr-1 size-3" />
                            編集
                          </Button>
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

