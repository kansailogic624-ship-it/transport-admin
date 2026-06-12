"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadBackupJson } from "@/lib/backup";
import { formatYenOrDash as fmtYen } from "@/lib/currency-format";
import { loadCustomMappingRules } from "@/lib/custom-mapping-rules";
// day-revenue utilities used indirectly via trip-fusion-utils
import { withReportStatusManual } from "@/lib/record-manual-override";
import { recomputeAllReportStatuses } from "@/lib/report-status";
import { consolidateDailyRecordsByDriverDay } from "@/lib/record-consolidate";
import {
  ReportStatusBadge,
  ReportStatusSelect,
} from "@/components/report-status-control";
import { TripFusionEditor } from "@/components/trip-fusion-editor";
import {
  finalizeFusionRecord,
  patchRecordDayFusion,
} from "@/lib/trip-fusion-utils";
import { addUniqueToList } from "@/lib/masters";
import {
  isKnownVehicle,
  loadVehicleMappingRules,
  upsertVehicleMappingRule,
} from "@/lib/vehicle-mapping-rules";
import { normalizeRecord } from "@/lib/trip-normalize";
import { newCrewMember } from "@/lib/crew-utils";
import type { DailyRecord, MasterData, TripEntry } from "@/lib/types";

const NONE_VALUE = "__none__";

// ---------------------------------------------------------------------------
// 未登録車両セル
// ---------------------------------------------------------------------------
type VehicleCellProps = {
  record: DailyRecord;
  masters: MasterData;
  onPatch: (record: DailyRecord, masters: MasterData) => void;
};

function VehicleCell({ record, masters, onPatch }: VehicleCellProps) {
  const vehicleNum = record.trips[0]?.vehicleNumber ?? "";
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState("");
  const [newVehicleInput, setNewVehicleInput] = useState("");

  const rules = loadVehicleMappingRules();
  const known = isKnownVehicle(vehicleNum, masters.vehicles, rules);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (known) {
    return (
      <span className="whitespace-nowrap tabular-nums text-xs">
        {vehicleNum || "—"}
      </span>
    );
  }

  const applyVehicleChange = (canonical: string, nextMasters: MasterData) => {
    upsertVehicleMappingRule(vehicleNum, canonical);
    const updatedTrips = record.trips.map((t) =>
      t.vehicleNumber === vehicleNum ? { ...t, vehicleNumber: canonical } : t,
    );
    onPatch({ ...record, trips: updatedTrips }, nextMasters);
    setOpen(false);
  };

  return (
    <div className="relative flex items-center gap-1" ref={popupRef}>
      <span className="whitespace-nowrap tabular-nums text-xs text-amber-700">
        {vehicleNum || "—"}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-200"
      >
        <AlertTriangle className="size-2.5" /> 未登録
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[220px] space-y-2 rounded-lg border bg-white p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] font-semibold text-amber-700">
            ⚠ 未登録の車両: {vehicleNum}
          </p>
          {masters.vehicles.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">既存の車両に紐付け（学習）</p>
              <div className="flex gap-1">
                <select
                  className="h-6 flex-1 rounded border px-1 text-xs"
                  value={selectedExisting}
                  onChange={(e) => setSelectedExisting(e.target.value)}
                >
                  <option value="">選択...</option>
                  {masters.vehicles.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => { if (selectedExisting) applyVehicleChange(selectedExisting, masters); }}
                  disabled={!selectedExisting}
                  className="rounded bg-blue-600 px-2 text-[10px] text-white disabled:opacity-40"
                >
                  適用
                </button>
              </div>
            </div>
          )}
          <hr className="border-muted" />
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">新規車両としてマスタに追加</p>
            <div className="flex gap-1">
              <input
                className="h-6 flex-1 rounded border px-1 text-xs"
                placeholder={vehicleNum}
                value={newVehicleInput}
                onChange={(e) => setNewVehicleInput(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  const target = newVehicleInput.trim() || vehicleNum;
                  if (!target) return;
                  applyVehicleChange(target, {
                    ...masters,
                    vehicles: addUniqueToList(masters.vehicles, target),
                  });
                }}
                className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-2 text-[10px] text-white"
              >
                <Plus className="size-2.5" /> 追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 休み・公休判定
// ---------------------------------------------------------------------------
function isHolidayRecord(record: DailyRecord): boolean {
  if (record.dayStatus === "公休" || record.dayStatus === "有給") return true;
  if (record.reportStatus === "not_required") return true;
  return record.trips.some((t) =>
    /^(休|公休|有給|欠勤|代休)/.test((t.jobName ?? "").trim()),
  );
}

// ---------------------------------------------------------------------------
// 合計売上表示
// ---------------------------------------------------------------------------
function totalRevenueDisplay(record: DailyRecord): string {
  const nonZeroRevs = record.trips
    .map((t) => Number(String(t.revenue).replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nonZeroRevs.length === 0) return "";
  const uniqueRevs = new Set(nonZeroRevs);
  if (uniqueRevs.size === 1) return String([...uniqueRevs][0]);
  return String(nonZeroRevs.reduce((s, n) => s + n, 0));
}

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------
export type FusionImportReviewProps = {
  reviewRecords: DailyRecord[];
  allRecords: DailyRecord[];
  masters: MasterData;
  onRecordsChange: (records: DailyRecord[]) => void;
  onMastersChange: (masters: MasterData) => void;
  onDismiss: () => void;
};

function sortedReviewRecords(records: DailyRecord[]): DailyRecord[] {
  return [...records].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.driverName.localeCompare(b.driverName, "ja");
  });
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
export function FusionImportReview({
  reviewRecords,
  allRecords,
  masters,
  onRecordsChange,
  onMastersChange,
  onDismiss,
}: FusionImportReviewProps) {
  const [learn, setLearn] = useState(true);
  const [drafts, setDrafts] = useState<DailyRecord[]>(() =>
    sortedReviewRecords(reviewRecords),
  );
  const [mastersState, setMastersState] = useState(masters);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => sortedReviewRecords(reviewRecords)[0]?.id ?? null,
  );
  const [activeTripIdx, setActiveTripIdx] = useState(0);

  useEffect(() => {
    const next = sortedReviewRecords(reviewRecords);
    setDrafts(next);
    if (next.length > 0 && !selectedId) setSelectedId(next[0]!.id);
  }, [reviewRecords]);

  useEffect(() => { setMastersState(masters); }, [masters]);

  if (drafts.length === 0) return null;

  const selectedRecord = drafts.find((d) => d.id === selectedId) ?? drafts[0]!;
  const safeActiveTripIdx = Math.min(
    activeTripIdx,
    Math.max(0, selectedRecord.trips.length - 1),
  );
  const activeTrip = selectedRecord.trips[safeActiveTripIdx] ?? null;

  // ---------- 状態同期 ----------
  const syncToParent = (nextDrafts: DailyRecord[], nextMasters: MasterData) => {
    setDrafts(nextDrafts);
    setMastersState(nextMasters);
    const mergedAll = allRecords.map((r) => {
      const draft = nextDrafts.find((d) => d.id === r.id);
      return draft ?? r;
    });
    const onlyInDrafts = nextDrafts.filter(
      (d) => !allRecords.some((r) => r.id === d.id),
    );
    onRecordsChange([...onlyInDrafts, ...mergedAll]);
    onMastersChange(nextMasters);
  };

  const patchDraft = (updated: DailyRecord, nextMasters: MasterData) => {
    const nextDrafts = drafts.map((r) => (r.id === updated.id ? updated : r));
    syncToParent(nextDrafts, nextMasters);
  };

  // ---------- トリップ追加 ----------
  const addTrip = () => {
    const m = newCrewMember("employee");
    m.name = selectedRecord.driverName;
    const newTrip: TripEntry = {
      id: crypto.randomUUID(),
      runType: "own",
      vehicleNumber: selectedRecord.trips[0]?.vehicleNumber ?? "",
      shipperName: "",
      jobName: "",
      revenue: "",
      tollFee: "",
      startMeter: "",
      endMeter: "",
      crew: [m],
      partnerName: "",
      partnerFee: "",
    };
    const nextTrips = [...selectedRecord.trips, newTrip];
    const nextRecord = normalizeRecord({ ...selectedRecord, trips: nextTrips });
    setActiveTripIdx(nextTrips.length - 1);
    patchDraft(nextRecord, mastersState);
  };

  // ---------- トリップ削除 ----------
  const removeTrip = (idx: number) => {
    if (selectedRecord.trips.length <= 1) return;
    const nextTrips = selectedRecord.trips.filter((_, i) => i !== idx);
    const nextRecord = normalizeRecord({ ...selectedRecord, trips: nextTrips });
    setActiveTripIdx(Math.min(idx, nextTrips.length - 1));
    patchDraft(nextRecord, mastersState);
  };

  // ---------- 確認完了 ----------
  const confirmAll = () => {
    const rulesBefore = loadCustomMappingRules().length;
    let nextMasters = mastersState;
    let finalized = [...drafts];

    finalized = finalized.map((draft) => {
      const { record: finalizedRecord, masters: m } = finalizeFusionRecord(
        draft,
        { learn },
        nextMasters,
      );
      nextMasters = m;
      return finalizedRecord;
    });

    let nextAll = allRecords.map((r) => {
      const hit = finalized.find((f) => f.id === r.id);
      return hit ?? r;
    });
    for (const f of finalized) {
      if (!nextAll.some((r) => r.id === f.id)) {
        nextAll = [f, ...nextAll];
      }
    }
    nextAll = recomputeAllReportStatuses(
      consolidateDailyRecordsByDriverDay(nextAll),
    );
    onMastersChange(nextMasters);
    onRecordsChange(nextAll);
    downloadBackupJson(nextAll, nextMasters);

    if (learn) {
      const rulesAfter = loadCustomMappingRules().length;
      const newRules = rulesAfter - rulesBefore;
      if (newRules > 0) {
        // eslint-disable-next-line no-console
        console.info(`[学習] ${newRules} 件の配車マッピングルールを保存しました`);
      }
    }

    onDismiss();
  };

  const customRuleCount = loadCustomMappingRules().length;
  const holiday = isHolidayRecord(selectedRecord);

  return (
    <Card className="border-primary/40 bg-primary/5">
      {/* ── ヘッダー ── */}
      <CardHeader className="px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">
            融合インポート確認 — {drafts.length} 件
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-xs font-normal">
              <Checkbox
                checked={learn}
                onCheckedChange={(v) => setLearn(v === true)}
                className="size-3.5"
              />
              修正を記憶
            </label>
            <Button size="sm" className="h-7 text-xs" onClick={confirmAll}>
              <CheckCircle2 className="mr-1 size-3.5" />
              すべて確認完了
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onDismiss}
            >
              あとで確認
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          学習ルール {customRuleCount} 件 ・ 行をクリックして選択 → 左パネルで編集
          {learn && (
            <span className="ml-1 text-primary">
              ・確認完了時に日報ラベルと配車名のマッピングを自動保存します
            </span>
          )}
        </p>
      </CardHeader>

      <CardContent className="px-3 pb-3 pt-0">
        {/* ── 2 カラムレイアウト ── */}
        <div className="flex gap-3" style={{ height: "64vh" }}>

          {/* ── 左: 記録を編集パネル ── */}
          <div className="flex w-[44%] shrink-0 flex-col overflow-hidden rounded border bg-background">
            <div className="overflow-y-auto p-3 space-y-3">
              {/* 選択ドライバー・日付 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold leading-tight">
                    {selectedRecord.driverName}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {selectedRecord.date}
                  </p>
                </div>
                <div className={[
                  "rounded px-2 py-0.5 text-[10px] font-medium",
                  holiday
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700",
                ].join(" ")}>
                  {holiday ? "休日・対象外" : "稼働日"}
                </div>
              </div>

              {/* レコードレベル項目: 2列グリッド */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div>
                  <Label className="text-[11px] text-muted-foreground">
                    日報ステータス
                  </Label>
                  <ReportStatusSelect
                    compact
                    value={selectedRecord.reportStatus}
                    onChange={(status) =>
                      patchDraft(
                        withReportStatusManual(selectedRecord, status),
                        mastersState,
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">
                    走行距離（km）
                  </Label>
                  <Input
                    className="h-6 px-1.5 text-xs"
                    inputMode="numeric"
                    value={selectedRecord.reportedDistanceKm?.toString() ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const km = raw === "" ? undefined : Number(raw);
                      patchDraft(
                        {
                          ...selectedRecord,
                          reportedDistanceKm:
                            km != null && !Number.isNaN(km) && km > 0
                              ? km
                              : undefined,
                        },
                        mastersState,
                      );
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">
                    FM配車（日単位）
                  </Label>
                  <Select
                    value={
                      (selectedRecord.primaryLinkedDispatchName &&
                      (selectedRecord.fusionDispatchOptions ?? []).some(
                        (o) =>
                          o.dispatchName ===
                          selectedRecord.primaryLinkedDispatchName,
                      )
                        ? selectedRecord.primaryLinkedDispatchName
                        : NONE_VALUE) ?? ""
                    }
                    onValueChange={(v) => {
                      const name = v === NONE_VALUE ? "" : v;
                      const opt = (
                        selectedRecord.fusionDispatchOptions ?? []
                      ).find((o) => o.dispatchName === name);
                      const { record: next, masters: nm } = patchRecordDayFusion(
                        selectedRecord,
                        {
                          dispatchName: name ?? "",
                          dayRevenue: opt?.revenue ?? totalRevenueDisplay(selectedRecord),
                          reportedDistanceKm: selectedRecord.reportedDistanceKm,
                          learn,
                        },
                        mastersState,
                      );
                      patchDraft(next, nm);
                    }}
                  >
                    <SelectTrigger className="h-6 w-full text-xs [&_svg]:size-3">
                      <SelectValue placeholder="配車" />
                    </SelectTrigger>
                    <SelectContent className="text-xs">
                      <SelectItem value={NONE_VALUE} className="py-1 text-xs">
                        （未選択）
                      </SelectItem>
                      {(selectedRecord.fusionDispatchOptions ?? []).map((o) => (
                        <SelectItem
                          key={o.dispatchName}
                          value={o.dispatchName}
                          className="py-1 text-xs"
                        >
                          {o.dispatchName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">
                    合計売上（全業務）
                  </Label>
                  <Input
                    className="h-6 px-1.5 text-xs text-right tabular-nums font-semibold"
                    value={fmtYen(totalRevenueDisplay(selectedRecord))}
                    readOnly
                    title="各業務の売上はタブ内で編集してください"
                  />
                </div>
              </div>

              {/* ── 業務タブ ── */}
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-1 border-b pb-1.5">
                  {selectedRecord.trips.map((trip, i) => {
                    const hasRev =
                      Number(String(trip.revenue).replace(/,/g, "")) > 0;
                    return (
                      <button
                        key={trip.id}
                        type="button"
                        onClick={() => setActiveTripIdx(i)}
                        className={[
                          "group relative rounded-t px-2.5 py-1 text-xs font-medium transition-colors",
                          safeActiveTripIdx === i
                            ? "bg-blue-600 text-white"
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                        ].join(" ")}
                      >
                        業務{i + 1}
                        {hasRev && (
                          <span className={[
                            "ml-1 inline-block h-1.5 w-1.5 rounded-full",
                            safeActiveTripIdx === i
                              ? "bg-blue-200"
                              : "bg-emerald-400",
                          ].join(" ")} />
                        )}
                        {selectedRecord.trips.length > 1 && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTrip(i);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                removeTrip(i);
                              }
                            }}
                            className={[
                              "ml-1 inline-flex items-center opacity-0 group-hover:opacity-100 transition-opacity",
                              safeActiveTripIdx === i
                                ? "text-blue-200 hover:text-white"
                                : "text-muted-foreground hover:text-destructive",
                            ].join(" ")}
                            title={`業務${i + 1}を削除`}
                          >
                            <Trash2 className="size-2.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={addTrip}
                    className="flex items-center gap-0.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <Plus className="size-3" /> 追加
                  </button>
                </div>

                {/* アクティブトリップ編集 */}
                {activeTrip ? (
                  <div className="space-y-2">
                    {/* 業務基本情報: 2列グリッド */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">
                          業務名
                        </Label>
                        <Input
                          key={`job-${activeTrip.id}`}
                          className="h-6 px-1.5 text-xs"
                          defaultValue={activeTrip.jobName}
                          onBlur={(e) => {
                            if (e.target.value === activeTrip.jobName) return;
                            const nextTrips = selectedRecord.trips.map((t, i) =>
                              i === safeActiveTripIdx
                                ? { ...t, jobName: e.target.value }
                                : t,
                            );
                            patchDraft(
                              normalizeRecord({
                                ...selectedRecord,
                                trips: nextTrips,
                              }),
                              mastersState,
                            );
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">
                          荷主名
                        </Label>
                        <Input
                          key={`ship-${activeTrip.id}`}
                          className="h-6 px-1.5 text-xs"
                          defaultValue={activeTrip.shipperName}
                          onBlur={(e) => {
                            if (e.target.value === activeTrip.shipperName)
                              return;
                            const nextTrips = selectedRecord.trips.map((t, i) =>
                              i === safeActiveTripIdx
                                ? { ...t, shipperName: e.target.value }
                                : t,
                            );
                            patchDraft(
                              normalizeRecord({
                                ...selectedRecord,
                                trips: nextTrips,
                              }),
                              mastersState,
                            );
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">
                          実売上（円）
                        </Label>
                        <Input
                          key={`rev-${activeTrip.id}`}
                          className="h-6 px-1.5 text-xs text-right tabular-nums font-semibold"
                          inputMode="numeric"
                          defaultValue={activeTrip.revenue}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val === activeTrip.revenue) return;
                            const nextTrips = selectedRecord.trips.map((t, i) =>
                              i === safeActiveTripIdx
                                ? { ...t, revenue: val }
                                : t,
                            );
                            patchDraft(
                              normalizeRecord({
                                ...selectedRecord,
                                trips: nextTrips,
                              }),
                              mastersState,
                            );
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">
                          高速代（円）
                        </Label>
                        <Input
                          key={`toll-${activeTrip.id}`}
                          className="h-6 px-1.5 text-xs text-right tabular-nums"
                          inputMode="numeric"
                          defaultValue={activeTrip.tollFee}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val === activeTrip.tollFee) return;
                            const nextTrips = selectedRecord.trips.map((t, i) =>
                              i === safeActiveTripIdx
                                ? { ...t, tollFee: val }
                                : t,
                            );
                            patchDraft(
                              normalizeRecord({
                                ...selectedRecord,
                                trips: nextTrips,
                              }),
                              mastersState,
                            );
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">
                          車両番号
                        </Label>
                        <Input
                          key={`veh-${activeTrip.id}`}
                          className="h-6 px-1.5 text-xs"
                          defaultValue={activeTrip.vehicleNumber}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val === activeTrip.vehicleNumber) return;
                            const nextTrips = selectedRecord.trips.map((t, i) =>
                              i === safeActiveTripIdx
                                ? { ...t, vehicleNumber: val }
                                : t,
                            );
                            patchDraft(
                              normalizeRecord({
                                ...selectedRecord,
                                trips: nextTrips,
                              }),
                              mastersState,
                            );
                          }}
                        />
                      </div>
                      {activeTrip.reportSourceLabel && (
                        <div>
                          <Label className="text-[11px] text-muted-foreground">
                            日報ラベル
                          </Label>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {activeTrip.reportSourceLabel}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* FM配車マッチング（fusionDispatchOptions がある場合のみ） */}
                    {(selectedRecord.fusionDispatchOptions ?? []).length > 0 && (
                      <TripFusionEditor
                        record={selectedRecord}
                        trip={activeTrip}
                        tripIndex={safeActiveTripIdx}
                        masters={mastersState}
                        compact
                        learnEnabled={learn}
                        showLearnCheckbox={false}
                        onRecordChange={() => {}}
                        onMastersChange={() => {}}
                        onPatched={(next, nextM) => patchDraft(next, nextM)}
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">業務データなし</p>
                )}
              </div>
            </div>
          </div>

          {/* ── 右: 入力一覧（コンパクト＋アコーディオン） ── */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded border bg-background">
            {/* 列ヘッダー */}
            <div className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-3 py-1">
              <span className="text-[10px] text-muted-foreground">
                {drafts.length} 件 ／ クリックで選択・業務詳細を展開
              </span>
            </div>
            <div className="overflow-y-auto">
              {drafts.map((record) => {
                const isSelected = record.id === selectedId;
                const isHol = isHolidayRecord(record);
                const rev = totalRevenueDisplay(record);
                const vehicle =
                  record.trips.find((t) => t.vehicleNumber)?.vehicleNumber ?? "";
                return (
                  <div
                    key={record.id}
                    className={[
                      "border-b last:border-b-0 transition-colors",
                      isSelected
                        ? "bg-blue-50"
                        : isHol
                          ? "bg-gray-50"
                          : "",
                    ].join(" ")}
                  >
                    {/* 2行サマリー: クリックで選択 */}
                    <div
                      className={[
                        "cursor-pointer px-3 py-1.5",
                        isSelected
                          ? "hover:bg-blue-100/60"
                          : "hover:bg-muted/40",
                      ].join(" ")}
                      onClick={() => {
                        setSelectedId(record.id);
                        setActiveTripIdx(0);
                      }}
                    >
                      {/* 行1: 日付 + ドライバー + バッジ + 売上 */}
                      <div className="flex min-w-0 items-center justify-between gap-1">
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                            {record.date.slice(5)}
                          </span>
                          <span
                            className={[
                              "truncate text-xs font-semibold",
                              isSelected ? "text-blue-700" : "",
                            ].join(" ")}
                          >
                            {record.driverName}
                          </span>
                          <ReportStatusBadge
                            status={record.reportStatus}
                            className="shrink-0 px-1 py-0 text-[10px]"
                          />
                        </div>
                        <span className="ml-1 shrink-0 tabular-nums text-xs font-bold">
                          {fmtYen(rev)}
                        </span>
                      </div>
                      {/* 行2: 出退勤 + 車両 */}
                      <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>
                          🕒 {record.clockIn || "—"} 〜 {record.clockOut || "—"}
                        </span>
                        {vehicle && (
                          <VehicleCell
                            record={record}
                            masters={mastersState}
                            onPatch={patchDraft}
                          />
                        )}
                      </div>
                    </div>

                    {/* アコーディオン: 業務チップ横並び（選択時のみ展開） */}
                    {isSelected && record.trips.length > 0 && (
                      <div className="border-t border-blue-100 bg-blue-50/40 px-3 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {record.trips.map((trip, i) => {
                            const tripRev = fmtYen(trip.revenue);
                            const isActiveTrip = safeActiveTripIdx === i;
                            const label =
                              trip.jobName ||
                              trip.shipperName ||
                              `業務${i + 1}`;
                            return (
                              <button
                                key={trip.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveTripIdx(i);
                                }}
                                className={[
                                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                                  isActiveTrip
                                    ? "border-blue-500 bg-blue-600 text-white"
                                    : "border-blue-200 bg-white text-blue-700 hover:bg-blue-100",
                                ].join(" ")}
                              >
                                <span className="shrink-0">業務{i + 1}</span>
                                <span className="max-w-[72px] truncate opacity-80">
                                  {label}
                                </span>
                                {tripRev !== "—" && (
                                  <span className="shrink-0 tabular-nums">
                                    {tripRev}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
