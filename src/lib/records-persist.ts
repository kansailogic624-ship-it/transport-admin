import type { DailyRecord } from "./types";

/** レコード永続化時のオプション */
export type RecordsPersistOptions = {
  /** true のときクラウド全件同期をスキップ（個別保存済みの場合） */
  skipCloudSave?: boolean;
};

export type RecordsChangeHandler = (
  records: DailyRecord[],
  options?: RecordsPersistOptions,
) => void;
