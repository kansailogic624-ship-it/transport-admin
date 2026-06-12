"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Car,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Upload,
  FileUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  countShabanKeiBlocks,
  extractShabanKeiBlocksForAi,
  fuelVehicleWorkDescription,
  KASHIMA_VENDOR,
  parseKashimaFuelBill,
  parseVehicleSummariesFromBill,
  type FuelVehicleSummary,
} from "@/lib/fuel-bill-parser";
import { extractFuelWithAi } from "@/lib/fuel-ocr-client";
import { parseFuelAiResponse } from "@/lib/fuel-ocr-normalize";
import {
  computeFuelBillTaxTotals,
  computeFuelRowTax,
  DEFAULT_FUEL_TAX_RATE,
  formatFuelTaxRateLabel,
  resolveFuelTaxRate,
} from "@/lib/fuel-tax-calc";
import { extractTextFromPdf, type OcrProgress } from "@/lib/pdf-extract";
import { parseJapaneseBillingMonth } from "@/lib/maintenance-bill-parser";
import {
  detectTollCsvKind,
  parseTollCsv,
} from "@/lib/toll-csv-parser";
import {
  assignBreakdownVehicle,
  buildTollImportRows,
  countUnregisteredBreakdown,
  flattenTollImportRowsForSave,
  removeTollImportRow,
  TOLL_UNREGISTERED_LABEL,
  tollImportRowCount,
  updateTollMatchedRow,
  type TollImportRow,
} from "@/lib/toll-import-rows";
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
  vehicles: unknown;
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
  vehicles: unknown,
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

type FuelVehicleRow = {
  id: string;
  vehicleCode: string;
  vehicleNumber: string;
  ocrHint?: string;
  totalQuantity: number;
  totalAmount: number;
};

function emptyFuelVehicleRow(): FuelVehicleRow {
  return {
    id: crypto.randomUUID(),
    vehicleCode: "",
    vehicleNumber: "",
    ocrHint: "",
    totalQuantity: 0,
    totalAmount: 0,
  };
}

function summariesToFuelRows(
  summaries: FuelVehicleSummary[],
  vehicles: unknown,
): FuelVehicleRow[] {
  return summaries.map((s) => {
    const { vehicleNumber, ocrHint } = matchFuelCardToVehicle(
      s.vehicleCode,
      vehicles,
    );
    return {
      id: crypto.randomUUID(),
      vehicleCode: s.vehicleCode,
      vehicleNumber,
      ocrHint: ocrHint || s.vehicleCode,
      totalQuantity: s.totalQuantity,
      totalAmount: s.totalAmount,
    };
  });
}

function FuelVehicleTable({
  rows,
  vehicles,
  fuelTaxRate,
  taxTotals,
  confirmedIds,
  onToggleConfirmed,
  onUpdate,
  onAdd,
  onRemove,
}: {
  rows: FuelVehicleRow[];
  vehicles: unknown;
  fuelTaxRate: number;
  taxTotals: ReturnType<typeof computeFuelBillTaxTotals>;
  confirmedIds: Set<string>;
  onToggleConfirmed: (id: string, checked: boolean) => void;
  onUpdate: (id: string, patch: Partial<FuelVehicleRow>) => void;
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
          車両別集計がありません。「＋手動で車両を追加」から入力してください。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-emerald-200 text-emerald-800">
                <th className="w-10 px-1 py-1.5 text-center font-medium">
                  確認
                </th>
                <th className="min-w-[160px] px-2 py-1.5 text-left font-medium">
                  車両
                </th>
                <th className="min-w-[88px] px-1 py-1.5 text-right font-medium">
                  数量計(L)
                </th>
                <th className="min-w-[100px] px-1 py-1.5 text-right font-medium">
                  車番計(円)
                </th>
                <th className="min-w-[72px] px-1 py-1.5 text-right font-medium">
                  消費税
                </th>
                <th className="min-w-[88px] px-1 py-1.5 text-right font-medium">
                  税込合計
                </th>
                <th className="w-8 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const confirmed = confirmedIds.has(r.id);
                const tax = computeFuelRowTax(
                  r.totalQuantity,
                  r.totalAmount,
                  fuelTaxRate,
                );
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-emerald-100 last:border-0 ${
                      confirmed
                        ? "bg-emerald-100/70 hover:bg-emerald-100/80"
                        : "hover:bg-emerald-50/80"
                    }`}
                  >
                    <td className="px-1 py-1 text-center">
                      <Checkbox
                        checked={confirmed}
                        onCheckedChange={(v) =>
                          onToggleConfirmed(r.id, v === true)
                        }
                        aria-label={`${r.vehicleCode || r.vehicleNumber} の照合確認`}
                      />
                    </td>
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
                      <Input
                        className="h-7 text-right text-xs tabular-nums"
                        type="number"
                        step="0.01"
                        value={r.totalQuantity || ""}
                        onChange={(e) =>
                          onUpdate(r.id, {
                            totalQuantity: parseFloat(e.target.value) || 0,
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
                    <td className="px-1 py-1 text-right tabular-nums text-emerald-800/90">
                      {formatYen(tax.consumptionTax)}
                    </td>
                    <td className="px-1 py-1 text-right tabular-nums font-medium text-emerald-900">
                      {formatYen(tax.taxInclusiveTotal)}
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
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-100/80 font-semibold">
                <td />
                <td className="px-2 py-1.5 text-emerald-900">合計</td>
                <td className="px-1 py-1.5 text-right tabular-nums text-emerald-900">
                  {taxTotals.totalQuantity.toLocaleString("ja-JP", {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums text-emerald-900">
                  {formatYen(taxTotals.totalShabanKei)}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums text-emerald-900">
                  {formatYen(taxTotals.totalConsumptionTax)}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums text-emerald-900">
                  {formatYen(taxTotals.totalTaxInclusive)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          <div className="border-t border-emerald-200 px-3 py-2 text-[11px] text-emerald-800">
            <p>
              適用中の軽油税率:{" "}
              <span className="font-semibold text-emerald-900">
                {formatFuelTaxRateLabel(fuelTaxRate)}
              </span>
            </p>
            <p className="mt-0.5 text-emerald-700/90">
              軽油税合計: {formatYen(taxTotals.totalDieselTax)} ／ 消費税合計:{" "}
              {formatYen(taxTotals.totalConsumptionTax)} ／ 税込総合計:{" "}
              {formatYen(taxTotals.totalTaxInclusive)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 燃料代（加島様）
// ---------------------------------------------------------------------------

type FuelBillImportFormProps = {
  vehicles: unknown;
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
  const [rows, setRows] = useState<FuelVehicleRow[]>([]);
  const [parseResult, setParseResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sourceFileName, setSourceFileName] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmedRowIds, setConfirmedRowIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [fuelTaxRate, setFuelTaxRate] = useState(DEFAULT_FUEL_TAX_RATE);
  const fileRef = useRef<HTMLInputElement>(null);

  const taxTotals = useMemo(
    () => computeFuelBillTaxTotals(rows, fuelTaxRate),
    [rows, fuelTaxRate],
  );

  const toggleRowConfirmed = useCallback((id: string, checked: boolean) => {
    setConfirmedRowIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const updateRow = useCallback((id: string, patch: Partial<FuelVehicleRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }, []);

  const applyFuelText = useCallback(
    async (text: string, fileName?: string) => {
      const parsed = parseKashimaFuelBill(text, fileName);
      let summaries: FuelVehicleSummary[] =
        parseVehicleSummariesFromBill(text);
      if (summaries.length === 0) {
        summaries = parsed.vehicles.map((v) => ({
          vehicleCode: v.vehicleCode,
          totalQuantity: v.totalQuantity,
          totalAmount: v.totalAmount,
        }));
      }
      let source = "ルールベース（車番計・原本順）";
      let aiData: unknown;

      const shabanKeiBlockCount = countShabanKeiBlocks(text);
      const needsAi =
        summaries.length === 0 ||
        (shabanKeiBlockCount > 0 && summaries.length < shabanKeiBlockCount);

      if (needsAi) {
        const shabanKeiText = extractShabanKeiBlocksForAi(text);
        if (shabanKeiText.trim()) {
          setAiParsing(true);
          try {
            const ai = await extractFuelWithAi(shabanKeiText);
            if (ai.success && ai.data) {
              aiData = ai.data;
              const aiVehicles = parseFuelAiResponse(ai.data);
              if (aiVehicles.length > 0) {
                if (summaries.length === 0) {
                  summaries = aiVehicles;
                } else {
                  const seen = new Set(
                    summaries.map((s) => s.vehicleCode),
                  );
                  for (const ai of aiVehicles) {
                    if (!seen.has(ai.vehicleCode)) {
                      summaries.push(ai);
                      seen.add(ai.vehicleCode);
                    }
                  }
                }
                source =
                  summaries.length > 0 && shabanKeiBlockCount > 0
                    ? `AI（車番計ブロック ${shabanKeiBlockCount}件・原本順）`
                    : "AI（車番計・原本順）";
              }
            }
          } finally {
            setAiParsing(false);
          }
        }
      }

      if (summaries.length === 0) {
        setParseResult(
          "⚠ 車番ごとの集計データを検出できませんでした。PDFのレイアウトをご確認ください。",
        );
        return;
      }

      const { rate, source: rateSource } = resolveFuelTaxRate(text, aiData);
      setFuelTaxRate(rate);
      setRows(summariesToFuelRows(summaries, vehicles));
      setConfirmedRowIds(new Set());
      if (parsed.billingMonth) setBillingMonth(parsed.billingMonth);
      if (fileName) setSourceFileName(fileName);
      setPasteText(text);
      const totals = computeFuelBillTaxTotals(summaries, rate);
      const rateSourceLabel =
        rateSource === "pdf"
          ? "PDFから自動判別"
          : rateSource === "ai"
            ? "AIから自動判別"
            : "標準値（デフォルト）";
      setParseResult(
        `✓ 請求元: ${parsed.vendorName}\n✓ 種別: 燃料代\n✓ 請求月: ${parsed.billingMonth || "（要入力）"}\n✓ 車両別集計 ${summaries.length}件（${source}）\n✓ 軽油税率: ${formatFuelTaxRateLabel(rate)}（${rateSourceLabel}）\n✓ 車番計合計: ${formatYen(totals.totalShabanKei)}\n✓ 消費税合計: ${formatYen(totals.totalConsumptionTax)}\n✓ 税込総合計: ${formatYen(totals.totalTaxInclusive)}`,
      );
    },
    [vehicles],
  );

  useEffect(() => {
    if (!initialText?.trim()) return;
    void applyFuelText(initialText, initialFileName);
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
        await applyFuelText(text, file.name);
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
      await applyFuelText(text, file.name);
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
    void applyFuelText(text, sourceFileName || undefined);
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
      alert("保存する車両別集計がありません");
      return;
    }
    setSaving(true);
    try {
      const total = valid.reduce((s, r) => {
        const tax = computeFuelRowTax(
          r.totalQuantity,
          r.totalAmount,
          fuelTaxRate,
        );
        return s + tax.taxInclusiveTotal;
      }, 0);
      const bill = buildExpenseBillHeader({
        vendorName: KASHIMA_VENDOR,
        billingMonth: ym,
        billType: "燃料代",
        totalAmount: total,
        sourceFileName,
        memo: `加島様燃料代（車両別${valid.length}件・軽油税${formatFuelTaxRateLabel(fuelTaxRate)}）`,
      });
      const records = buildSimpleExpenseRecords(
        valid.map((r) => {
          const tax = computeFuelRowTax(
            r.totalQuantity,
            r.totalAmount,
            fuelTaxRate,
          );
          return {
            vehicleNumber: r.vehicleNumber,
            totalAmount: tax.taxInclusiveTotal,
            workDescription: fuelVehicleWorkDescription({
              vehicleCode: r.vehicleCode,
              totalQuantity: r.totalQuantity,
              totalAmount: r.totalAmount,
            }),
          };
        }),
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
        {pdfLoading || aiParsing ? (
          <div className="space-y-1 px-2">
            {ocrProgress ? (
              <p className="text-xs text-muted-foreground">{ocrProgress.stage}</p>
            ) : aiParsing ? (
              <p className="text-xs text-muted-foreground">
                AIで車番計を抽出中…
              </p>
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

      <FuelVehicleTable
        rows={rows}
        vehicles={vehicles}
        fuelTaxRate={fuelTaxRate}
        taxTotals={taxTotals}
        confirmedIds={confirmedRowIds}
        onToggleConfirmed={toggleRowConfirmed}
        onUpdate={updateRow}
        onAdd={() => setRows((p) => [...p, emptyFuelVehicleRow()])}
        onRemove={(id) => {
          setRows((p) => p.filter((r) => r.id !== id));
          setConfirmedRowIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }}
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

function TollCsvVehicleTable({
  rows,
  vehicles,
  onUpdateMatched,
  onAssignBreakdown,
  onRemove,
}: {
  rows: TollImportRow[];
  vehicles: unknown;
  onUpdateMatched: (
    id: string,
    patch: Partial<Pick<TollImportRow, "vehicleNumber" | "totalAmount" | "ocrHint">>,
  ) => void;
  onAssignBreakdown: (
    groupRowId: string,
    breakdownItemId: string,
    vehicleNumber: string,
  ) => void;
  onRemove: (id: string) => void;
}) {
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const totalAmount = rows.reduce((s, r) => s + safeNumber(r.totalAmount), 0);
  const unregisteredCount = countUnregisteredBreakdown(rows);

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-teal-200 px-3 py-2">
        <Car className="size-4 text-teal-700" />
        <span className="text-xs font-semibold text-teal-900">
          車両別集計（{tollImportRowCount(rows)}件）
        </span>
        {unregisteredCount > 0 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
            未登録内訳 {unregisteredCount}件
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-teal-800/80">
          車両が検出されませんでした。CSVを読み込んでください。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-teal-200 text-teal-800">
                <th className="w-8 px-1 py-1.5" />
                <th className="min-w-[180px] px-2 py-1.5 text-left font-medium">
                  車両
                </th>
                <th className="min-w-[120px] px-1 py-1.5 text-right font-medium">
                  高速代
                </th>
                <th className="w-8 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                if (r.kind === "unregistered_group") {
                  const expanded = expandedGroupId === r.id;
                  const itemCount = r.breakdown?.length ?? 0;
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-teal-100 bg-amber-50/50 hover:bg-amber-50/70">
                        <td className="px-1 py-1 text-center">
                          {itemCount > 0 ? (
                            <button
                              type="button"
                              className="rounded p-1 text-teal-700 hover:bg-teal-100"
                              onClick={() =>
                                setExpandedGroupId(expanded ? null : r.id)
                              }
                              aria-expanded={expanded}
                              aria-label="内訳を見る"
                            >
                              {expanded ? (
                                <ChevronDown className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )}
                            </button>
                          ) : null}
                        </td>
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() =>
                              itemCount > 0 &&
                              setExpandedGroupId(expanded ? null : r.id)
                            }
                          >
                            <span className="font-semibold text-amber-900">
                              {TOLL_UNREGISTERED_LABEL}
                            </span>
                            <span className="ml-1.5 text-[10px] text-amber-800/80">
                              （{itemCount}件のCSV車番を合算）
                            </span>
                          </button>
                        </td>
                        <td className="px-1 py-1 text-right tabular-nums font-semibold text-amber-900">
                          {formatYen(r.totalAmount)}
                        </td>
                        <td className="px-1 py-1" />
                      </tr>
                      {expanded && itemCount > 0 && (
                        <tr className="border-b border-teal-100 bg-muted/20">
                          <td colSpan={4} className="p-0">
                            <div className="border-t border-amber-200/60 px-3 py-2">
                              <p className="mb-2 text-[10px] font-medium text-muted-foreground">
                                CSV内訳 — 正しい車両を選択すると親テーブルへ移動します
                              </p>
                              <table className="w-full text-[11px]">
                                <tbody>
                                  {r.breakdown!.map((item) => (
                                    <tr
                                      key={item.id}
                                      className="border-b border-teal-100/60 last:border-0"
                                    >
                                      <td className="w-8" />
                                      <td className="py-1.5 pr-2">
                                        <span className="font-mono text-teal-900">
                                          CSV車番 {item.csvPlate}
                                        </span>
                                      </td>
                                      <td className="w-24 py-1.5 text-right tabular-nums text-teal-900">
                                        {formatYen(item.totalAmount)}
                                      </td>
                                      <td className="min-w-[200px] py-1.5 pl-2">
                                        <VehiclePlateSelect
                                          value={item.vehicleNumber}
                                          vehicles={vehicles}
                                          ocrHint={item.ocrHint}
                                          onChange={(plate) =>
                                            onAssignBreakdown(
                                              r.id,
                                              item.id,
                                              plate,
                                            )
                                          }
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }

                return (
                  <tr
                    key={r.id}
                    className="border-b border-teal-100 last:border-0 hover:bg-teal-50/80"
                  >
                    <td className="px-1 py-1" />
                    <td className="px-2 py-1">
                      <VehiclePlateSelect
                        value={r.vehicleNumber}
                        vehicles={vehicles}
                        ocrHint={r.ocrHint}
                        onChange={(plate) =>
                          onUpdateMatched(r.id, {
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
                        onChange={(n) =>
                          onUpdateMatched(r.id, { totalAmount: n })
                        }
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
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-teal-100/80 font-semibold">
                <td />
                <td className="px-2 py-1.5 text-teal-900">合計</td>
                <td className="px-1 py-1.5 text-right tabular-nums text-teal-900">
                  {formatYen(totalAmount)}
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

type TollCsvImportFormProps = {
  vehicles: unknown;
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
  const [rows, setRows] = useState<TollImportRow[]>([]);
  const [parseResult, setParseResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sourceFileName, setSourceFileName] = useState("");
  const [csvKind, setCsvKind] = useState<"kjs" | "corpo" | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    const workDescription =
      kind === "kjs" ? "KJS高速明細" : "コーポ高速明細";
    const entries = parsed.vehicles.map((v) => {
      const { vehicleNumber, ocrHint } = normalizeVehicleForMaster(
        v.rawPlate,
        vehicles,
      );
      return {
        rawPlate: v.rawPlate,
        totalAmount: v.totalAmount,
        vehicleNumber,
        ocrHint: ocrHint || v.rawPlate,
      };
    });
    const importRows = buildTollImportRows(entries, workDescription);
    const matchedCount = importRows.filter((r) => r.kind === "matched").length;
    const unregisteredCount = countUnregisteredBreakdown(importRows);
    setRows(importRows);
    setCsvKind(kind);
    if (parsed.billingMonth) setBillingMonth(parsed.billingMonth);
    if (fileName) setSourceFileName(fileName);
    setParseResult(
      `✓ 種別: ${parsed.vendorName}\n✓ CSV車番 ${entries.length}件 → 表示 ${tollImportRowCount(importRows)}行（マスタ照合 ${matchedCount}件 / 未登録合算 ${unregisteredCount}件）\n✓ 合計: ${formatYen(parsed.totalAmount)}`,
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
    const flat = flattenTollImportRowsForSave(rows).filter(
      (r) => r.vehicleNumber.trim() || safeNumber(r.totalAmount) > 0,
    );
    if (flat.length === 0) {
      alert("保存する車両データがありません");
      return;
    }
    setSaving(true);
    try {
      const vendorName =
        csvKind === "kjs" ? "KJS高速明細" : "コーポ高速明細";
      const total = flat.reduce((s, r) => s + safeNumber(r.totalAmount), 0);
      const bill = buildExpenseBillHeader({
        vendorName,
        billingMonth: ym,
        billType: "高速代",
        totalAmount: total,
        sourceFileName,
        memo: `${vendorName} CSVインポート`,
      });
      const records = buildSimpleExpenseRecords(
        flat.map((r) => ({
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

      <TollCsvVehicleTable
        rows={rows}
        vehicles={vehicles}
        onUpdateMatched={(id, patch) =>
          setRows((prev) => updateTollMatchedRow(prev, id, patch))
        }
        onAssignBreakdown={(groupId, itemId, plate) =>
          setRows((prev) =>
            assignBreakdownVehicle(prev, groupId, itemId, plate),
          )
        }
        onRemove={(id) => setRows((prev) => removeTollImportRow(prev, id))}
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
          {saving ? "保存中…" : `高速代を登録（${tollImportRowCount(rows)}件）`}
        </Button>
      </div>
    </div>
  );
}
