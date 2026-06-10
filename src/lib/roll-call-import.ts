import { normalizeDriverName } from "./driving-report-parser";
import {
  datesMatch,
  employeeIdsMatch,
  resolveVehicleMasterLabel,
} from "./import-match-keys";
import { addUniqueToList } from "./masters";
import {
  applyVehicleImportUpgrades,
  upsertVehicleInMaster,
  type VehicleUpgrade,
} from "./vehicle-import-merge";
import {
  loadVehicleExpenses,
  saveVehicleExpenses,
} from "@/services/firestore-storage";
import { decodeCsvBufferShiftJis } from "./encoding-detect";
import {
  isCsvExportFormat,
  mergeRollCallEntries,
  parseRollCallCsvExport,
  parseCsvTextToMatrix,
  parseRollCallSheet,
  type ParsedRollCallEntry,
} from "./roll-call-parser";
import {
  recordIdsForTouchedDayKeys,
  touchRecordDay,
} from "./import-history-keys";
import {
  registerImportHistory,
  stampImportHistoryOnRecords,
} from "./import-history";
import { applyRollCallTimesPreservingManual } from "./record-manual-override";
import { recomputeAllReportStatuses } from "./report-status";
import { consolidateDailyRecordsByDriverDay } from "./record-consolidate";
import { allSheetMatricesFromArrayBuffer } from "./spreadsheet-read";
import { normalizeRecord } from "./trip-normalize";
import type { DailyRecord, MasterData } from "./types";

export type RollCallImportResult = {
  records: DailyRecord[];
  masters: MasterData;
  importedCount: number;
  messages: string[];
};

function applyRollCallToRecord(
  record: DailyRecord,
  entry: ParsedRollCallEntry,
  masterVehicles: string[],
): DailyRecord {
  const trips = [...record.trips];
  const canonicalVehicle = entry.vehicleNumber
    ? resolveVehicleMasterLabel(
        entry.vehicleNumber,
        masterVehicles,
        entry.vehicleNumber,
      )
    : "";
  if (canonicalVehicle && trips.length > 0) {
    trips[0] = {
      ...trips[0]!,
      vehicleNumber: canonicalVehicle,
    };
  }

  const times = applyRollCallTimesPreservingManual(record, {
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    rollCallTime: entry.rollCallTime,
  });

  return {
    ...record,
    ...times,
    rollCallEndTime: entry.hasPostRollCall
      ? entry.clockOut || record.rollCallEndTime
      : record.rollCallEndTime,
    employeeId: entry.employeeId ?? record.employeeId,
    rollCallPreRecorded: record.rollCallPreRecorded || entry.hasPreRollCall,
    rollCallPostRecorded: record.rollCallPostRecorded || entry.hasPostRollCall,
    trips,
  };
}

function emptyRecordFromRollCall(
  entry: ParsedRollCallEntry,
  masterVehicles: string[],
): DailyRecord {
  const canonicalVehicle = entry.vehicleNumber
    ? resolveVehicleMasterLabel(
        entry.vehicleNumber,
        masterVehicles,
        entry.vehicleNumber,
      )
    : "";
  return normalizeRecord({
    date: entry.date,
    operationType: "own",
    driverName: entry.driverName,
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    rollCallTime: entry.rollCallTime,
    rollCallEndTime: entry.hasPostRollCall ? entry.clockOut : undefined,
    employeeId: entry.employeeId,
    rollCallPreRecorded: entry.hasPreRollCall,
    rollCallPostRecorded: entry.hasPostRollCall,
    trips:
      canonicalVehicle.trim().length > 0
        ? [
            {
              id: crypto.randomUUID(),
              runType: "own",
              vehicleNumber: canonicalVehicle,
              shipperName: "",
              jobName: "",
              revenue: "",
              tollFee: "",
              startMeter: "",
              endMeter: "",
              crew: [],
              partnerName: "",
              partnerFee: "",
            },
          ]
        : [],
    createdAt: new Date().toISOString(),
  });
}

function mergeMastersFromRollCall(
  masters: MasterData,
  entry: ParsedRollCallEntry,
  vehicleUpgrades: VehicleUpgrade[],
): MasterData {
  let next = { ...masters };
  if (entry.driverName) {
    next = {
      ...next,
      drivers: addUniqueToList(next.drivers, entry.driverName),
    };
  }
  if (entry.vehicleNumber) {
    const result = upsertVehicleInMaster(
      next.vehicles,
      entry.vehicleNumber,
      "rollcall",
    );
    next = { ...next, vehicles: result.vehicles };
    if (result.upgrade) {
      vehicleUpgrades.push(result.upgrade);
    }
  }
  return next;
}

/**
 * 夜勤の「翌日業務後点呼」判定:
 * - 業務後点呼のみ（業務前なし・clockIn なし）
 * - clockOut が午前中（12 時未満）= 深夜〜早朝帰着
 */
function isNextDayPostRollCall(entry: ParsedRollCallEntry): boolean {
  if (!entry.hasPostRollCall) return false;
  if (entry.hasPreRollCall || entry.clockIn) return false;
  if (!entry.clockOut) return false;
  const h = parseInt(entry.clockOut.split(":")[0] ?? "12", 10);
  return h < 12;
}

/** YYYY-MM-DD 文字列から 1 日前を返す */
function prevDateStr(dateStr: string): string {
  // "2026-05-02" → new Date は UTC 0:00 として解釈するので
  // そのまま getDate()-1 で前日になる
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function findRecordIndex(
  records: DailyRecord[],
  entry: ParsedRollCallEntry,
): number {
  const key = normalizeDriverName(entry.driverName);
  const employeeMatch = (r: DailyRecord) =>
    entry.employeeId
      ? employeeIdsMatch(r.employeeId, entry.employeeId) || !r.employeeId
      : true;

  // ① 同一日付で完全一致
  const exactIdx = records.findIndex(
    (r) =>
      datesMatch(r.date, entry.date) &&
      normalizeDriverName(r.driverName) === key &&
      employeeMatch(r),
  );
  if (exactIdx >= 0) return exactIdx;

  // ② 夜勤跨ぎ: 翌朝の業務後点呼 → 前日のレコードを探す
  if (isNextDayPostRollCall(entry)) {
    const prev = prevDateStr(entry.date);
    return records.findIndex(
      (r) =>
        datesMatch(r.date, prev) &&
        normalizeDriverName(r.driverName) === key &&
        employeeMatch(r) &&
        !r.clockOut, // 退勤未記録のレコードのみ対象
    );
  }

  return -1;
}

export function applyRollCallEntriesToRecords(
  entries: ParsedRollCallEntry[],
  records: DailyRecord[],
  masters: MasterData,
): {
  records: DailyRecord[];
  masters: MasterData;
  applied: number;
  touchedDayKeys: Set<string>;
  vehicleUpgrades: VehicleUpgrade[];
} {
  let nextRecords = [...records];
  let nextMasters = masters;
  let applied = 0;
  const touchedDayKeys = new Set<string>();
  const vehicleUpgrades: VehicleUpgrade[] = [];

  for (const entry of entries) {
    if (!entry.date || !entry.driverName) continue;
    nextMasters = mergeMastersFromRollCall(
      nextMasters,
      entry,
      vehicleUpgrades,
    );

    const idx = findRecordIndex(nextRecords, entry);
    if (idx >= 0) {
      const target = nextRecords[idx]!;
      touchRecordDay(touchedDayKeys, target.date, target.driverName);
      nextRecords[idx] = applyRollCallToRecord(
        target,
        entry,
        nextMasters.vehicles,
      );
      applied++;
    } else if (!isNextDayPostRollCall(entry)) {
      touchRecordDay(touchedDayKeys, entry.date, entry.driverName);
      nextRecords = [
        emptyRecordFromRollCall(entry, nextMasters.vehicles),
        ...nextRecords,
      ];
      applied++;
    }
  }

  nextRecords = consolidateDailyRecordsByDriverDay(nextRecords);
  nextRecords = recomputeAllReportStatuses(nextRecords);

  return {
    records: nextRecords,
    masters: nextMasters,
    applied,
    touchedDayKeys,
    vehicleUpgrades,
  };
}

export async function importRollCallFiles(
  files: File[],
  records: DailyRecord[],
  masters: MasterData,
): Promise<RollCallImportResult> {
  const messages: string[] = [];
  const allEntries: ParsedRollCallEntry[] = [];

  for (const file of files) {
    try {
      const buffer = await file.arrayBuffer();
      let fileCount = 0;

      if (/\.csv$/i.test(file.name)) {
        const text = decodeCsvBufferShiftJis(buffer);
        const rows = parseCsvTextToMatrix(text);
        if (rows.length === 0) {
          messages.push(`× ${file.name}: データが空です`);
          continue;
        }
        const sheetName = file.name;
        const { entries, warnings } = isCsvExportFormat(rows)
          ? parseRollCallCsvExport(rows)
          : parseRollCallSheet(rows, sheetName);
        fileCount = entries.length;
        allEntries.push(...entries);
        for (const w of warnings) {
          messages.push(`  ⚠ ${file.name}: ${w}`);
        }
      } else {
        const sheets = await allSheetMatricesFromArrayBuffer(buffer, file.name);

        if (sheets.length === 0) {
          messages.push(`× ${file.name}: シートがありません`);
          continue;
        }

        for (const { sheetName, rows } of sheets) {
          if (rows.length === 0) continue;
          const { entries, warnings } = parseRollCallSheet(rows, sheetName);
          fileCount += entries.length;
          allEntries.push(...entries);
          for (const w of warnings) {
            messages.push(`  ⚠ ${file.name} / ${sheetName}: ${w}`);
          }
        }
      }

      messages.push(`ℹ ${file.name}: ${fileCount} 件の点呼行を読み取り`);
    } catch (e) {
      messages.push(
        `× ${file.name}: ${e instanceof Error ? e.message : "読み込み失敗"}`,
      );
    }
  }

  const merged = mergeRollCallEntries(allEntries);
  const {
    records: nextRecords,
    masters: nextMasters,
    applied,
    touchedDayKeys,
    vehicleUpgrades,
  } = applyRollCallEntriesToRecords(merged, records, masters);

  const expenses = await loadVehicleExpenses();
  const mergedVehicles = applyVehicleImportUpgrades(
    nextMasters.vehicles,
    nextRecords,
    expenses,
    vehicleUpgrades,
  );

  const fileNames = files.map((f) => f.name).join(", ");
  const errorCount = Math.max(0, merged.length - applied);

  const entry = registerImportHistory({
    importType: "rollcall",
    fileName: fileNames || "（ファイル名不明）",
    recordCount: merged.length,
    successCount: applied,
    errorCount,
    affectedRecordIds: recordIdsForTouchedDayKeys(
      mergedVehicles.records,
      touchedDayKeys,
    ),
    affectedDayKeys: [...touchedDayKeys],
  });

  const stampedRecords = stampImportHistoryOnRecords(
    mergedVehicles.records,
    entry,
  );

  if (mergedVehicles.upgrades.length > 0) {
    await saveVehicleExpenses(mergedVehicles.expenses);
    messages.push(
      `ℹ 車両マスタを ${mergedVehicles.upgrades.length} 件統合（点呼簿の正式表記に名寄せ）`,
    );
  }

  messages.unshift(
    `点呼記録簿を反映: ${applied} ドライバー×日（読取 ${merged.length} 件）`,
  );

  return {
    records: stampedRecords,
    masters: { ...nextMasters, vehicles: mergedVehicles.vehicles },
    importedCount: applied,
    messages,
  };
}
