import { storageService } from "@/services/storageService";

import { recordDayKey } from "./record-consolidate";

import type { DailyRecord, ImportHistory, ImportType } from "./types";



export const IMPORT_HISTORY_MAX = 100;

export const IMPORT_USER_LOCAL = "local-user";



export type RegisterImportHistoryInput = {

  importType: ImportType;

  fileName: string;

  recordCount: number;

  successCount: number;

  errorCount: number;

  importUser?: string;

  affectedRecordIds?: string[];

  affectedDayKeys?: string[];

};



export function registerImportHistory(

  input: RegisterImportHistoryInput,

): ImportHistory {

  const entry: ImportHistory = {

    id: crypto.randomUUID(),

    importType: input.importType,

    fileName: input.fileName,

    importDateTime: new Date().toISOString(),

    recordCount: input.recordCount,

    successCount: input.successCount,

    errorCount: input.errorCount,

    importUser: input.importUser ?? IMPORT_USER_LOCAL,

    affectedRecordIds: [...new Set(input.affectedRecordIds ?? [])],

    affectedDayKeys: [...new Set(input.affectedDayKeys ?? [])],

  };



  const prev = storageService.loadImportHistory();

  const next = [entry, ...prev].slice(0, IMPORT_HISTORY_MAX);

  storageService.saveImportHistory(next);



  return entry;

}



export function loadImportHistory(): ImportHistory[] {

  return storageService

    .loadImportHistory()

    .map((row) => ({

      ...row,

      affectedRecordIds: row.affectedRecordIds ?? [],

      affectedDayKeys: row.affectedDayKeys ?? [],

    }))

    .slice(0, IMPORT_HISTORY_MAX);

}



export function removeImportHistoryEntry(historyId: string): void {

  const next = loadImportHistory().filter((h) => h.id !== historyId);

  storageService.saveImportHistory(next);

}



/** 取込履歴と日次レコードの紐づけ情報があるか */

export function hasImportLinkage(history: ImportHistory): boolean {

  return (

    history.affectedRecordIds.length > 0 ||

    (history.affectedDayKeys?.length ?? 0) > 0

  );

}



/** 取込履歴に紐づく日次レコードを抽出（ID・日キー・importHistoryId のいずれかで一致） */

export function resolveImportAffectedRecords(

  history: ImportHistory,

  records: DailyRecord[],

): DailyRecord[] {

  const idSet = new Set(history.affectedRecordIds);

  const dayKeySet = new Set(history.affectedDayKeys);



  if (

    idSet.size === 0 &&

    dayKeySet.size === 0 &&

    !records.some((r) => r.importHistoryId === history.id)

  ) {

    return [];

  }



  return records.filter(

    (r) =>

      idSet.has(r.id) ||

      dayKeySet.has(recordDayKey(r)) ||

      r.importHistoryId === history.id,

  );

}



/** 取込で触れたレコードに importHistoryId を付与 */

export function stampImportHistoryOnRecords(

  records: DailyRecord[],

  entry: ImportHistory,

): DailyRecord[] {

  const idSet = new Set(entry.affectedRecordIds);

  const dayKeySet = new Set(entry.affectedDayKeys);



  if (idSet.size === 0 && dayKeySet.size === 0) return records;



  return records.map((r) => {

    const affected =

      idSet.has(r.id) ||

      dayKeySet.has(recordDayKey(r));

    if (!affected) return r;

    return { ...r, importHistoryId: entry.id };

  });

}



export type ImportRollbackResult = {

  records: DailyRecord[];

  removedRecordCount: number;

  history: ImportHistory | null;

};



/** 取込履歴に紐づく日次レコードを一括削除し、履歴行も除去する */

export function rollbackImportBatch(

  historyId: string,

  records: DailyRecord[],

): ImportRollbackResult {

  const history =

    loadImportHistory().find((h) => h.id === historyId) ?? null;

  if (!history) {

    return { records, removedRecordCount: 0, history: null };

  }



  const affected = resolveImportAffectedRecords(history, records);

  const removeIds = new Set(affected.map((r) => r.id));



  if (removeIds.size === 0) {

    removeImportHistoryEntry(historyId);

    return { records, removedRecordCount: 0, history };

  }



  const nextRecords = records.filter((r) => !removeIds.has(r.id));

  const removedRecordCount = records.length - nextRecords.length;



  removeImportHistoryEntry(historyId);



  return { records: nextRecords, removedRecordCount, history };

}



export function importTypeLabel(type: ImportType): string {

  switch (type) {

    case "rollcall":

      return "点呼記録簿";

    case "dailyReport":

      return "デジタコ運転日報";

    case "fusion":

      return "FileMaker・日報 融合";

    default:

      return type;

  }

}



export function formatImportStatus(row: ImportHistory): string {

  const parts = [`${row.successCount}件 成功`];

  if (row.errorCount > 0) {

    parts.push(`${row.errorCount}件 エラー`);

  }

  return parts.join(" / ");

}


