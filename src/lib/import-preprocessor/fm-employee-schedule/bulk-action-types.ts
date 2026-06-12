import type { FmScheduleWarningCode } from "./types";

/** 将来の一括操作種別 */
export type FmBulkWarningActionType = "dismiss_ok" | "hold" | "reopen";

export type FmBulkWarningTarget = {
  recordId: string;
  flag: FmScheduleWarningCode;
};

/** 一括操作リクエスト（将来 UI から投入） */
export type FmBulkWarningActionRequest = {
  action: FmBulkWarningActionType;
  targets: FmBulkWarningTarget[];
  decidedBy?: string;
  note?: string;
};

/** 一覧の複数行選択状態（将来） */
export type FmRecordSelectionState = {
  mode: "none" | "multi";
  selectedRecordIds: string[];
};

export const FM_BULK_ACTION_LABELS: Record<FmBulkWarningActionType, string> = {
  dismiss_ok: "一括で問題なし",
  hold: "一括で保留",
  reopen: "一括で要修正に戻す",
};

export function createEmptySelectionState(): FmRecordSelectionState {
  return { mode: "none", selectedRecordIds: [] };
}
