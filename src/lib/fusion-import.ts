import {
  parseFileMakerDispatchSheet,
  resolveTimecardFromDispatches,
  type ParsedFileMakerDispatch,
} from "./filemaker-dispatch-parser";
import {
  datesMatch,
  driverNamesMatch,
  fusionMatchKey,
  normalizeIsoDate,
  vehiclesMatch,
} from "./import-match-keys";
import { cleanupImportedJobMasterNoise } from "./job-master-cleanup";
import { mergeMastersFromFileMakerDispatches } from "./masters";
import {
  countDeliveryDropsForReportTripSubset,
  normalizeDriverName,
  parseAllDrivingReportsFromSheet,
  type ParsedDrivingReport,
} from "./driving-report-parser";
import {
  loadVehicleMappingRules,
  resolveVehicleNumber,
} from "./vehicle-mapping-rules";
import { allMappingRulesForFusion } from "./custom-mapping-rules";
import { applyDayRevenueToTrips } from "./day-revenue";
import {
  bumpRuleHitCount,
  dispatchesForDriverDay,
  findBestMappingRule,
  findDispatchByName,
} from "./mapping-rules";
import {
  recordIdsForTouchedDayKeys,
  touchRecordDay,
} from "./import-history-keys";
import {
  registerImportHistory,
  stampImportHistoryOnRecords,
} from "./import-history";
import {
  loadVehicleExpenses,
  saveVehicleExpenses,
} from "@/services/firestore-storage";
import { applyVehicleImportUpgrades } from "./vehicle-import-merge";
import {
  recomputeAllReportStatuses,
  withInferredReportStatus,
} from "./report-status";
import { normalizeRecord } from "./trip-normalize";
import { newCrewMember } from "./crew-utils";
import { sheetRowsFromFile } from "./spreadsheet-read";
import {
  consolidateDailyRecordsByDriverDay,
  mergeTwoDailyRecords,
} from "./record-consolidate";
import {
  fusionOptionsFromDispatches,
  resolveDayRevenueFromPool,
} from "./trip-fusion-utils";
import {
  detectDayStatusFromText,
  type DayStatus,
} from "./schedule-day-status";
import type { DailyRecord, MappingRule, MasterData, TripEntry } from "./types";

export type FusionImportResult = {
  records: DailyRecord[];
  masters: MasterData;
  messages: string[];
  importedCount: number;
  skippedCount: number;
  /** 融合直後に確認が必要なレコードID */
  reviewRecordIds: string[];
  /** ロールバック用：この取込で触れた日次レコードID */
  affectedRecordIds: string[];
  /** ロールバック・明細用：この取込で触れたドライバー×日キー */
  touchedDayKeys: string[];
};

function reportMatchKey(r: ParsedDrivingReport): string | null {
  if (!r.date || !r.driverName) return null;
  return fusionMatchKey(r.date, r.driverName, r.vehicleNumber);
}

function dispatchRowId(d: ParsedFileMakerDispatch): string {
  return `${d.date}|${d.driverName}|${d.dispatchName}|${d.vehicleNumber}|${d.revenue}`;
}

function parseFmRevenue(revenue: string): number {
  const n = Number(String(revenue).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 同一配車名の重複を除き、売上のある FM 行を優先 */
function dedupeDispatchesByName(
  list: ParsedFileMakerDispatch[],
): ParsedFileMakerDispatch[] {
  const byName = new Map<string, ParsedFileMakerDispatch>();
  for (const d of list) {
    const key = d.dispatchName.trim();
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev || parseFmRevenue(d.revenue) > parseFmRevenue(prev.revenue)) {
      byName.set(key, d);
    }
  }
  return [...byName.values()];
}

function isHolidayDispatch(d: ParsedFileMakerDispatch): boolean {
  if (d.isAttendanceRow || d.dayStatus) return true;
  return (
    detectDayStatusFromText(d.dispatchName, d.shipperName) !== undefined
  );
}

function resolveHolidayDayStatus(
  dispatches: ParsedFileMakerDispatch[],
): DayStatus {
  for (const d of dispatches) {
    if (d.dayStatus === "有給") return "有給";
    const status =
      d.dayStatus ?? detectDayStatusFromText(d.dispatchName, d.shipperName);
    if (status === "有給") return "有給";
  }
  return "公休";
}

/** 売上登録済みの FM 配車のみ（テンプレート行の水増しを除外） */
export function activeFmDispatches(
  list: ParsedFileMakerDispatch[],
): ParsedFileMakerDispatch[] {
  const operational = list.filter((d) => !isHolidayDispatch(d));
  const withRevenue = operational.filter((d) => parseFmRevenue(d.revenue) > 0);
  if (withRevenue.length > 0) return dedupeDispatchesByName(withRevenue);
  return dedupeDispatchesByName(operational);
}

function filterDispatchesForVehicle(
  list: ParsedFileMakerDispatch[],
  report: ParsedDrivingReport,
): ParsedFileMakerDispatch[] {
  const rawReportVehicle = report.vehicleNumber.trim();
  if (!rawReportVehicle) return list;

  const vehicleRules = loadVehicleMappingRules();
  const reportVehicle = resolveVehicleNumber(
    rawReportVehicle,
    undefined,
    vehicleRules,
  );

  const matched = list.filter((d) => {
    if (!d.vehicleNumber.trim()) return true;
    const dispVehicle = resolveVehicleNumber(
      d.vehicleNumber,
      undefined,
      vehicleRules,
    );
    return (
      vehiclesMatch(dispVehicle, reportVehicle) ||
      vehiclesMatch(d.vehicleNumber, rawReportVehicle)
    );
  });

  return matched.length > 0 ? matched : list;
}

function applyReportMetersToTrips(
  trips: TripEntry[],
  report: ParsedDrivingReport,
): TripEntry[] {
  if (trips.length === 0) return trips;
  if (!report.startMeter && !report.endMeter) return trips;
  return trips.map((t, i) =>
    i === 0
      ? {
          ...t,
          startMeter: report.startMeter || t.startMeter,
          endMeter: report.endMeter || t.endMeter,
        }
      : t,
  );
}

/** FM 軸の融合結果で、日報立ち寄り行由来の水増し業務を置き換える */
function mergeFusionDriverDayRecords(
  existing: DailyRecord,
  incoming: DailyRecord,
): DailyRecord {
  const incomingFmBacked = incoming.trips.some((t) =>
    Boolean(t.linkedDispatchName?.trim()),
  );
  const merged =
    incomingFmBacked && existing.trips.length > incoming.trips.length
      ? mergeTwoDailyRecords({ ...existing, trips: [] }, incoming)
      : mergeTwoDailyRecords(existing, incoming);

  const fmScheduleUpdate =
    incoming.dayStatus !== undefined ||
    incoming.trips.some((t) => Boolean(t.linkedDispatchName?.trim()));

  return {
    ...merged,
    id: existing.id,
    ...(fmScheduleUpdate
      ? {
          timecardIn: incoming.timecardIn,
          timecardOut: incoming.timecardOut,
        }
      : {}),
  };
}

function markDriverDayDispatchesUsed(
  report: ParsedDrivingReport,
  dispatches: ParsedFileMakerDispatch[],
  usedIds: Set<string>,
): void {
  const driver = normalizeDriverName(report.driverName);
  for (const d of dispatches) {
    if (!datesMatch(d.date, report.date)) continue;
    if (normalizeDriverName(d.driverName) !== driver) continue;
    usedIds.add(dispatchRowId(d));
  }
}

/** 日報（車両付き）に一致する配車行を取得（候補リスト用） */
export function findDispatchesForReport(
  report: ParsedDrivingReport,
  dispatches: ParsedFileMakerDispatch[],
  usedIds: Set<string>,
): ParsedFileMakerDispatch[] {
  const driver = normalizeDriverName(report.driverName);
  const rawReportVehicle = report.vehicleNumber.trim();

  // 車両マッピングルールで解決（学習済みの表記揺れを適用）
  const vehicleRules = loadVehicleMappingRules();
  const reportVehicle = resolveVehicleNumber(rawReportVehicle, undefined, vehicleRules);

  const withVehicle = activeFmDispatches(
    dispatches.filter((d) => {
      if (usedIds.has(dispatchRowId(d))) return false;
      if (!datesMatch(d.date, report.date)) return false;
      if (normalizeDriverName(d.driverName) !== driver) return false;
      if (!d.vehicleNumber.trim()) return false;
      if (!reportVehicle && !rawReportVehicle) return true;
      const dispVehicle = resolveVehicleNumber(
        d.vehicleNumber,
        undefined,
        vehicleRules,
      );
      return (
        vehiclesMatch(dispVehicle, reportVehicle) ||
        vehiclesMatch(d.vehicleNumber, rawReportVehicle)
      );
    }),
  );

  if (withVehicle.length > 0) return withVehicle;

  if (!rawReportVehicle) {
    return activeFmDispatches(
      dispatches.filter((d) => {
        if (usedIds.has(dispatchRowId(d))) return false;
        if (!datesMatch(d.date, report.date)) return false;
        if (normalizeDriverName(d.driverName) !== driver) return false;
        return !d.vehicleNumber.trim();
      }),
    );
  }

  return [];
}

function sumTollFromReport(report: ParsedDrivingReport): string {
  let sum = 0;
  for (const t of report.trips) {
    const n = Number(t.tollFee);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum > 0 ? String(sum) : "";
}

function reportTripLabel(rt: { shipperName: string; jobName: string }): string {
  return rt.jobName.trim() || rt.shipperName.trim();
}

function makeCrew(driverName: string) {
  const m = newCrewMember("employee");
  m.name = driverName;
  return [m];
}

type ResolveResult = {
  dispatch: ParsedFileMakerDispatch | null;
  ruleId?: string;
};

function resolveDispatchForReportTrip(
  rt: { shipperName: string; jobName: string },
  pool: ParsedFileMakerDispatch[],
  rules: MappingRule[],
): ResolveResult {
  const label = reportTripLabel(rt);

  const rule = findBestMappingRule(rules, label, rt.shipperName);
  if (rule) {
    const fromFm = findDispatchByName(pool, rule.dispatchName);
    if (fromFm) return { dispatch: fromFm, ruleId: rule.id };
    const synthetic: ParsedFileMakerDispatch = {
      date: pool[0]?.date ?? "",
      driverName: pool[0]?.driverName ?? "",
      dispatchName: rule.dispatchName,
      shipperName: rule.shipperName || rt.shipperName,
      revenue: "",
      vehicleNumber: rule.vehicleNumber ?? pool[0]?.vehicleNumber ?? "",
      tollFee: "",
      sourceFileName: pool[0]?.sourceFileName ?? "",
      warnings: [],
    };
    return { dispatch: synthetic, ruleId: rule.id };
  }

  const labelNorm = label.replace(/\s/g, "").toLowerCase();
  if (labelNorm) {
    for (const d of pool) {
      const dn = d.dispatchName.replace(/\s/g, "").toLowerCase();
      if (dn && (labelNorm.includes(dn) || dn.includes(labelNorm))) {
        return { dispatch: d };
      }
    }
  }

  if (pool.length === 1) return { dispatch: pool[0]! };

  return { dispatch: null };
}

/** 日報の業務行をすべて保持し、配車・学習ルールで各業務を補完 */
export function buildFusedRecordFromReport(
  report: ParsedDrivingReport,
  allDispatches: ParsedFileMakerDispatch[],
  matchedDispatches: ParsedFileMakerDispatch[],
  rules: MappingRule[],
): DailyRecord | null {
  if (!report.date || !report.driverName) return null;

  const driverName = report.driverName;
  const driverDay = dispatchesForDriverDay(
    allDispatches,
    report.date,
    driverName,
  );
  const activeDay = activeFmDispatches(driverDay);
  const pool = dedupeDispatchesByName(
    matchedDispatches.length > 0
      ? activeFmDispatches(matchedDispatches)
      : filterDispatchesForVehicle(activeDay, report),
  );

  const fusionDispatchOptions = fusionOptionsFromDispatches(driverDay);
  const usedRuleIds: string[] = [];
  const dayRevenue = resolveDayRevenueFromPool(pool, report.vehicleNumber);
  const primaryDispatch =
    pool.length === 1
      ? pool[0]?.dispatchName
      : findBestMappingRule(
          rules,
          report.driverName,
          report.trips[0]?.shipperName ?? "",
        )?.dispatchName ?? pool[0]?.dispatchName;

  // ── 業務エントリ生成 ────────────────────────────────────────────────────
  // 【重要】FM配車が1件以上ある場合は「配車1件につき1業務タブ」を生成する。
  // 従来の「日報配送明細1行につき1業務タブ」方式では、配送停留所が12件あれば
  // 12業務タブが生成されてしまう（例：吉田勉の京都②が12タブに分裂）。
  // FM配車を基軸にすることで、配車数と業務タブ数が一致する。
  let trips: TripEntry[];

  if (pool.length > 0) {
    // 各日報配送行を最もマッチするFM配車に割り当てる（グループ化）
    const rtGroups = new Map<string, typeof report.trips>();
    for (const d of pool) rtGroups.set(d.dispatchName, []);

    for (const rt of report.trips) {
      const { dispatch: matchedD, ruleId } = resolveDispatchForReportTrip(
        rt,
        pool,
        rules,
      );
      if (ruleId) usedRuleIds.push(ruleId);

      // マッチした配車名を元にグループキーを決定する。
      // pool.length === 1 なら全日報行を唯一の配車にまとめる。
      // pool.length > 1: 学習ルール or ラベル一致で特定の配車にマッチした場合はそのキーへ。
      // 未マッチ（dispatch=null）または合成配車（pool外のdispatchName）の場合は
      // pool[0] へフォールバックして行が消えないようにする。
      const preferredKey = matchedD?.dispatchName ?? pool[0]!.dispatchName;
      const key = rtGroups.has(preferredKey)
        ? preferredKey
        : pool[0]!.dispatchName;
      rtGroups.get(key)!.push(rt);
    }

    // FM配車ごとに1つの業務エントリを生成
    trips = pool.map((dispatch) => {
      const matchingRts = rtGroups.get(dispatch.dispatchName) ?? [];
      const totalToll = matchingRts.reduce((s, rt) => {
        const n = Number(rt.tollFee);
        return s + (Number.isFinite(n) ? n : 0);
      }, 0);
      const reportLabel = matchingRts
        .map((rt) => reportTripLabel(rt))
        .filter(Boolean)
        .join(" / ");

      return {
        id: crypto.randomUUID(),
        runType: "own" as const,
        vehicleNumber: report.vehicleNumber || dispatch.vehicleNumber,
        shipperName:
          dispatch.shipperName.trim() ||
          matchingRts[0]?.shipperName.trim() ||
          "",
        jobName: dispatch.dispatchName,
        linkedDispatchName: dispatch.dispatchName,
        reportSourceLabel: reportLabel,
        // 配車ごとに個別の売上を設定（per-trip モデル）
        revenue: dispatch.revenue,
        tollFee: totalToll > 0 ? String(totalToll) : "",
        dropCount: countDeliveryDropsForReportTripSubset(matchingRts),
        startMeter: "",
        endMeter: "",
        crew: makeCrew(driverName),
        partnerName: "",
        partnerFee: "",
      };
    });
  } else if (report.trips.length > 0 && activeDay.length === 0) {
    // FM配車なし → 日報配送明細行から1:1で生成（FMが無い場合のみ）
    trips = report.trips.map((rt) => {
      const label = reportTripLabel(rt);
      const { dispatch, ruleId } = resolveDispatchForReportTrip(
        rt,
        pool,
        rules,
      );
      if (ruleId) usedRuleIds.push(ruleId);
      return {
        id: crypto.randomUUID(),
        runType: "own" as const,
        vehicleNumber: report.vehicleNumber || dispatch?.vehicleNumber || "",
        shipperName: dispatch?.shipperName.trim() || rt.shipperName.trim(),
        jobName: dispatch?.dispatchName || rt.jobName || label,
        linkedDispatchName: dispatch?.dispatchName ?? primaryDispatch,
        reportSourceLabel: label,
        revenue: dispatch?.revenue ?? "",
        tollFee: rt.tollFee,
        dropCount: rt.isDeliveryDrop ? 1 : 1,
        startMeter: "",
        endMeter: "",
        crew: makeCrew(driverName),
        partnerName: "",
        partnerFee: "",
      };
    });
  } else {
    // 日報業務行なし → FM先頭配車から単一業務を生成
    trips = [
      {
        id: crypto.randomUUID(),
        runType: "own" as const,
        vehicleNumber: report.vehicleNumber,
        shipperName: pool[0]?.shipperName ?? "",
        jobName: pool[0]?.dispatchName || "（日報業務なし）",
        linkedDispatchName: pool[0]?.dispatchName,
        reportSourceLabel: "",
        revenue: "",
        tollFee: sumTollFromReport(report),
        dropCount: countDeliveryDropsForReportTripSubset(report.trips),
        startMeter: "",
        endMeter: "",
        crew: makeCrew(driverName),
        partnerName: "",
        partnerFee: "",
      },
    ];
  }

  // 複数の異なる売上が既にある場合は per-trip モデルを維持。
  // 単一値または未設定のみ「1日1売上→先頭集約」モデルを適用する。
  const perTripNonZeroRevs = trips
    .map((t) => Number(String(t.revenue).replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (new Set(perTripNonZeroRevs).size <= 1) {
    trips = applyDayRevenueToTrips(trips, dayRevenue);
  }

  trips = applyReportMetersToTrips(trips, report);

  void usedRuleIds;

  const driverDayDispatches = dispatchesForDriverDay(
    allDispatches,
    report.date,
    driverName,
  );
  const { timecardIn, timecardOut } =
    driverDayDispatches.length > 0
      ? resolveTimecardFromDispatches(driverDayDispatches)
      : { timecardIn: undefined, timecardOut: undefined };

  return withInferredReportStatus(
    normalizeRecord({
      date: report.date,
      operationType: "own",
      driverName,
      clockIn: report.clockIn,
      clockOut: report.clockOut,
      rollCallTime: report.rollCallTime || report.clockIn,
      reportedDistanceKm:
        report.distanceKm > 0 ? report.distanceKm : undefined,
      trips,
      isFusionDraft: true,
      fusionDispatchOptions,
      primaryLinkedDispatchName: primaryDispatch,
      timecardIn,
      timecardOut,
      createdAt: new Date().toISOString(),
    }),
    { importedSubmitted: report.dailyReportSubmitted },
  );
}

function applyRuleHits(masters: MasterData, ruleIds: string[]): MasterData {
  let next = masters;
  for (const id of new Set(ruleIds)) {
    next = bumpRuleHitCount(next, id);
  }
  return next;
}

function buildHolidayFmRecord(
  dispatches: ParsedFileMakerDispatch[],
): DailyRecord | null {
  const head = dispatches[0];
  if (!head?.date || !head.driverName) return null;

  const dayStatus = resolveHolidayDayStatus(dispatches);
  const { timecardIn, timecardOut } = resolveTimecardFromDispatches(dispatches);

  return withInferredReportStatus(
    normalizeRecord({
      date: head.date,
      operationType: "own",
      driverName: head.driverName,
      trips: [],
      dayStatus,
      reportStatus: "not_required",
      fusionDispatchOptions: fusionOptionsFromDispatches(dispatches),
      isFusionDraft: true,
      timecardIn,
      timecardOut,
      createdAt: new Date().toISOString(),
    }),
  );
}

function buildFusedRecordFmOnly(
  dispatches: ParsedFileMakerDispatch[],
): DailyRecord | null {
  const head = dispatches[0];
  if (!head?.date || !head.driverName) return null;

  const driverName = head.driverName;
  const trips: TripEntry[] = dispatches.map((d) => ({
    id: crypto.randomUUID(),
    runType: "own" as const,
    vehicleNumber: d.vehicleNumber,
    shipperName: d.shipperName,
    jobName: d.dispatchName,
    linkedDispatchName: d.dispatchName,
    reportSourceLabel: d.dispatchName,
    revenue: d.revenue,
    tollFee: d.tollFee,
    startMeter: "",
    endMeter: "",
    crew: makeCrew(driverName),
    partnerName: "",
    partnerFee: "",
  }));

  const { timecardIn, timecardOut } = resolveTimecardFromDispatches(dispatches);

  return withInferredReportStatus(
    normalizeRecord({
      date: head.date,
      operationType: "own",
      driverName,
      trips,
      fusionDispatchOptions: fusionOptionsFromDispatches(dispatches),
      isFusionDraft: true,
      timecardIn,
      timecardOut,
      createdAt: new Date().toISOString(),
    }),
  );
}

export async function parseFileMakerFiles(
  files: File[],
): Promise<ParsedFileMakerDispatch[]> {
  const all: ParsedFileMakerDispatch[] = [];
  for (const file of files) {
    const rows = await sheetRowsFromFile(file);
    all.push(...parseFileMakerDispatchSheet(rows, file.name));
  }
  return all;
}

export async function parseSeeDriveReportFiles(
  files: File[],
): Promise<{ reports: ParsedDrivingReport[]; errors: string[] }> {
  const reports: ParsedDrivingReport[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const rows = await sheetRowsFromFile(file);
      const parsedList = parseAllDrivingReportsFromSheet(rows, file.name);
      if (parsedList.length === 0) {
        errors.push(`${file.name}: 日報ブロックを検出できません`);
        continue;
      }

      let added = 0;
      for (const parsed of parsedList) {
        if (!parsed.date || !parsed.driverName) {
          errors.push(
            `${file.name} (${parsed.driverName || "運転手不明"}): 日付・運転手を読み取れません`,
          );
          continue;
        }
        reports.push(parsed);
        added += 1;
      }

      if (added > 1) {
        // fuse 側メッセージ用（呼び出し元でログ）
        void added;
      }
    } catch (e) {
      errors.push(
        `${file.name}: ${e instanceof Error ? e.message : "読み込み失敗"}`,
      );
    }
  }

  return { reports, errors };
}

export function fuseDispatchesWithReports(
  dispatches: ParsedFileMakerDispatch[],
  reports: ParsedDrivingReport[],
  existingRecords: DailyRecord[],
  existingMasters: MasterData,
): FusionImportResult {
  let records = [...existingRecords];
  let masters = {
    ...existingMasters,
    mappingRules: existingMasters.mappingRules ?? [],
  };
  const messages: string[] = [];
  const reviewRecordIds: string[] = [];
  const touchedDayKeys = new Set<string>();
  let importedCount = 0;
  let skippedCount = 0;

  const usedDispatchIds = new Set<string>();

  // マスタ自動登録は FileMaker 配車データのみ（運転日報は一切反映しない）
  if (dispatches.length > 0) {
    masters = mergeMastersFromFileMakerDispatches(masters, dispatches);
  }

  // ファイル内の全配車・日報行を紐づけ対象に含める（再取込・0件成功時も明細表示可能に）
  for (const d of dispatches) {
    touchRecordDay(touchedDayKeys, d.date, d.driverName);
  }
  for (const report of reports) {
    touchRecordDay(touchedDayKeys, report.date, report.driverName);
  }

  const reportsByFile = new Map<string, number>();
  for (const report of reports) {
    const base = report.sourceFileName.replace(/\s*\[\d+\/\d+\]$/, "");
    reportsByFile.set(base, (reportsByFile.get(base) ?? 0) + 1);
  }
  for (const [file, count] of reportsByFile) {
    if (count > 1) {
      messages.push(`ℹ ${file}: 日報 ${count} 名分を検出・融合します`);
    }
  }

  for (const report of reports) {
    const reportKey = reportMatchKey(report);
    if (!reportKey) continue;

    const matched = findDispatchesForReport(
      report,
      dispatches,
      usedDispatchIds,
    );
    for (const d of matched) {
      usedDispatchIds.add(dispatchRowId(d));
    }
    if (matched.length > 0) {
      markDriverDayDispatchesUsed(report, dispatches, usedDispatchIds);
    }

    const fusionRules = allMappingRulesForFusion(masters);
    const ruleIds: string[] = [];
    const record = buildFusedRecordFromReport(
      report,
      dispatches,
      matched,
      fusionRules,
    );
    if (!record) {
      skippedCount += 1;
      continue;
    }

    for (const t of record.trips) {
      const label = t.reportSourceLabel ?? "";
      const rule = findBestMappingRule(fusionRules, label, t.shipperName);
      if (rule) ruleIds.push(rule.id);
    }
    masters = applyRuleHits(masters, ruleIds);

    const dupIndex = records.findIndex(
      (r) =>
        datesMatch(r.date, record.date) &&
        driverNamesMatch(r.driverName, record.driverName),
    );

    const jobNames = record.trips.map((t) => t.jobName).join("、");
    const km =
      record.reportedDistanceKm != null
        ? ` / 走行${record.reportedDistanceKm}km`
        : "";

    touchRecordDay(touchedDayKeys, record.date, record.driverName);

    if (dupIndex >= 0) {
      const id = records[dupIndex]!.id;
      records[dupIndex] = mergeFusionDriverDayRecords(records[dupIndex]!, {
        ...record,
        id,
      });
      if (!reviewRecordIds.includes(id)) reviewRecordIds.push(id);
      messages.push(
        `↻ 融合 ${record.date} ${record.driverName}（業務${record.trips.length}件: ${jobNames}${km}）`,
      );
    } else {
      records = [record, ...records];
      reviewRecordIds.push(record.id);
      messages.push(
        `✓ 融合 ${record.date} ${record.driverName}（業務${record.trips.length}件: ${jobNames}${km}）`,
      );
    }

    if (matched.length === 0) {
      messages.push(
        `  ⚠ ${report.sourceFileName}: 配車未照合（車両 ${report.vehicleNumber || "—"}）→日報業務のみ`,
      );
    } else {
      messages.push(
        `  ℹ 日報${report.trips.length}業務をすべて取込（配車候補${matched.length}件）`,
      );
    }

    importedCount += 1;
  }

  // 未使用配車を「ドライバー×日付」でグループ化してから処理する。
  // 1 件ずつ buildFusedRecordFmOnly → mergeTwoDailyRecords を繰り返すと
  // applyDayRevenueToTrips がループごとに再計算され売上が二重計上されるため、
  // 同一日の全配車をまとめて 1 つの fmRecord に変換することでこれを防ぐ。
  const dispatchGroups = new Map<string, ParsedFileMakerDispatch[]>();
  for (const d of dispatches) {
    if (usedDispatchIds.has(dispatchRowId(d))) continue;
    const groupKey = `${normalizeIsoDate(d.date)}|${normalizeDriverName(d.driverName)}`;
    const grp = dispatchGroups.get(groupKey);
    if (grp) {
      grp.push(d);
    } else {
      dispatchGroups.set(groupKey, [d]);
    }
  }

  for (const group of dispatchGroups.values()) {
    const holidayGroup = group.filter(isHolidayDispatch);
    const workGroup = group.filter((d) => !isHolidayDispatch(d));
    const activeHoliday = dedupeDispatchesByName(holidayGroup);

    if (workGroup.length === 0 && activeHoliday.length > 0) {
      const head = activeHoliday[0]!;
      const holidayRecord = buildHolidayFmRecord(activeHoliday);
      if (!holidayRecord) continue;

      const dupDriverDay = records.findIndex(
        (r) =>
          datesMatch(r.date, head.date) &&
          driverNamesMatch(r.driverName, head.driverName),
      );

      for (const d of activeHoliday) usedDispatchIds.add(dispatchRowId(d));

      if (dupDriverDay >= 0) {
        const existing = records[dupDriverDay]!;
        const hasWorkTrips = existing.trips.some(
          (t) => parseFmRevenue(t.revenue) > 0,
        );
        if (hasWorkTrips) {
          messages.push(
            `  ℹ 休日スキップ（運行あり）: ${head.date} ${head.driverName} / ${resolveHolidayDayStatus(activeHoliday)}`,
          );
          continue;
        }
        touchRecordDay(touchedDayKeys, existing.date, existing.driverName);
        records[dupDriverDay] = {
          ...mergeTwoDailyRecords(existing, {
            ...holidayRecord,
            id: existing.id,
            createdAt: new Date().toISOString(),
          }),
          timecardIn: holidayRecord.timecardIn,
          timecardOut: holidayRecord.timecardOut,
        };
        if (!reviewRecordIds.includes(existing.id)) {
          reviewRecordIds.push(existing.id);
        }
        messages.push(
          `↻ 休日反映 ${head.date} ${head.driverName}（${holidayRecord.dayStatus}）`,
        );
        importedCount += 1;
        continue;
      }

      touchRecordDay(touchedDayKeys, holidayRecord.date, holidayRecord.driverName);
      records = [holidayRecord, ...records];
      reviewRecordIds.push(holidayRecord.id);
      messages.push(
        `✓ 休日登録 ${holidayRecord.date} ${holidayRecord.driverName}（${holidayRecord.dayStatus}）`,
      );
      importedCount += 1;
      continue;
    }

    if (activeHoliday.length > 0) {
      for (const d of activeHoliday) usedDispatchIds.add(dispatchRowId(d));
      messages.push(
        `  ℹ 休日行スキップ（同日に運行あり）: ${activeHoliday[0]!.date} ${activeHoliday[0]!.driverName}`,
      );
    }

    const activeGroup = activeFmDispatches(workGroup);
    if (activeGroup.length === 0) continue;
    const head = activeGroup[0]!;

    // 日報から生成されたレコードの driverName は正規化前の場合がある。
    // 両辺を正規化して比較することで名前の表記揺れ（スペース有無など）を吸収する。
    const dupDriverDay = records.findIndex(
      (r) =>
        datesMatch(r.date, head.date) &&
        driverNamesMatch(r.driverName, head.driverName),
    );

    if (dupDriverDay >= 0) {
      // 既存レコード（日報先行取り込み等）に FM 売上・配車情報を後追いマージ
      const existing = records[dupDriverDay]!;

      // 同一配車名が既に trips に存在するものは除外（二重計上防止）
      const newDispatches = activeGroup.filter(
        (d) =>
          !existing.trips.some(
            (t) =>
              (t.linkedDispatchName?.trim() || t.jobName?.trim()) ===
              d.dispatchName.trim(),
          ),
      );

      if (newDispatches.length > 0) {
        const fmRecord = buildFusedRecordFmOnly(newDispatches);
        if (fmRecord) {
          touchRecordDay(touchedDayKeys, existing.date, existing.driverName);
          records[dupDriverDay] = mergeTwoDailyRecords(existing, {
            ...fmRecord,
            id: existing.id,
            createdAt: new Date().toISOString(),
          });
          if (!reviewRecordIds.includes(existing.id)) {
            reviewRecordIds.push(existing.id);
          }
          messages.push(
            `↻ FM売上追加 ${head.date} ${head.driverName}（${newDispatches.map((d) => d.dispatchName).join("、")}）`,
          );
          importedCount += 1;
        }
      } else {
        messages.push(
          `  ℹ スキップ（取込済）: ${head.date} ${head.driverName} / ${group.map((d) => d.dispatchName).join("、")}`,
        );
      }

      for (const d of activeGroup) usedDispatchIds.add(dispatchRowId(d));
      continue;
    }

    // 完全新規（既存なし）→ 同日グループ全件を 1 レコードとして登録
    const record = buildFusedRecordFmOnly(activeGroup);
    if (!record) continue;

    for (const d of activeGroup) usedDispatchIds.add(dispatchRowId(d));

    touchRecordDay(touchedDayKeys, record.date, record.driverName);
    records = [record, ...records];
    reviewRecordIds.push(record.id);
    messages.push(
      `✓ FM配車登録 ${record.date} ${record.driverName}（${activeGroup.map((d) => d.dispatchName).join("、")}）`,
    );
    if (reports.length > 0) {
      messages.push(
        `  ⚠ 日報未照合: ${activeGroup.map((d) => d.dispatchName).join("、")} / 車両 ${head.vehicleNumber || "—"}`,
      );
    }
    importedCount += 1;
  }

  // FM ファイルが提供されたが 1 件もパースできなかった場合のみ警告
  // （FM なし・日報のみ取り込みは正常動作のため警告しない）

  messages.push(
    "📝 融合結果は下書きです。確認画面または日次一覧で配車の手動修正ができます。",
  );

  records = recomputeAllReportStatuses(
    consolidateDailyRecordsByDriverDay(records),
  );

  // 日報取込後もマスタへは触れず、誤登録のクリーンアップのみ実施
  const cleaned = cleanupImportedJobMasterNoise(masters, {
    fmDispatches: dispatches,
    records,
  });
  if (cleaned.removed.length > 0) {
    masters = cleaned.masters;
    messages.push(
      `ℹ 業務名マスタから日報由来の誤登録を ${cleaned.removed.length} 件除去しました`,
    );
  }

  const finalReviewIds = records
    .filter((r) => r.isFusionDraft)
    .map((r) => r.id);

  const affectedRecordIds = recordIdsForTouchedDayKeys(records, touchedDayKeys);
  const touchedDayKeyList = [...touchedDayKeys];

  return {
    records,
    masters,
    messages,
    importedCount,
    skippedCount,
    reviewRecordIds: finalReviewIds,
    affectedRecordIds,
    touchedDayKeys: touchedDayKeyList,
  };
}

export async function importFusionBatch(
  fileMakerFiles: File[],
  seeDriveFiles: File[],
  existingRecords: DailyRecord[],
  existingMasters: MasterData,
): Promise<FusionImportResult> {
  const dispatches = await parseFileMakerFiles(fileMakerFiles);
  const { reports, errors } = await parseSeeDriveReportFiles(seeDriveFiles);

  const result = fuseDispatchesWithReports(
    dispatches,
    reports,
    existingRecords,
    existingMasters,
  );

  for (const e of errors) {
    result.messages.push(`× ${e}`);
    result.skippedCount += 1;
  }

  // 片側のみ取り込みは正常動作（エラーではなく情報として表示）
  if (fileMakerFiles.length === 0 && seeDriveFiles.length > 0) {
    result.messages.unshift(
      "ℹ 日報のみ取り込みモード — FM配車データは後から「FM配車のみ」で追加すると売上が自動マージされます",
    );
  }
  if (seeDriveFiles.length === 0 && fileMakerFiles.length > 0) {
    result.messages.unshift(
      "ℹ FM配車のみ取り込みモード — 走行・拘束データは後から「日報のみ」で追加すると自動マージされます",
    );
  }

  const fileNames = [...fileMakerFiles, ...seeDriveFiles]
    .map((f) => f.name)
    .join(", ");

  const expenses = await loadVehicleExpenses();
  const vehicleMerged = applyVehicleImportUpgrades(
    result.masters.vehicles,
    result.records,
    expenses,
    [],
  );
  result.records = vehicleMerged.records;
  result.masters = {
    ...result.masters,
    vehicles: vehicleMerged.vehicles,
  };
  if (vehicleMerged.upgrades.length > 0) {
    await saveVehicleExpenses(vehicleMerged.expenses);
    result.messages.push(
      `ℹ 車両マスタを ${vehicleMerged.upgrades.length} 件統合（正式表記に名寄せ）`,
    );
  }

  const entry = registerImportHistory({
    importType: "fusion",
    fileName: fileNames || "（ファイル名不明）",
    recordCount: result.importedCount + result.skippedCount,
    successCount: result.importedCount,
    errorCount: result.skippedCount,
    affectedRecordIds: recordIdsForTouchedDayKeys(
      result.records,
      new Set(result.touchedDayKeys),
    ),
    affectedDayKeys: result.touchedDayKeys,
  });

  result.records = stampImportHistoryOnRecords(result.records, entry);

  return result;
}
