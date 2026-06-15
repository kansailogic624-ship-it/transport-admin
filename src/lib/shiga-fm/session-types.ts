import type { PreprocessResult } from "@/lib/import-preprocessor/types";
import type { ShigaFmReconciliationResult } from "@/lib/import-preprocessor/shiga-fm-reconciliation/types";

export const SHIGA_FM_SESSION_SCHEMA_VERSION = 1 as const;

/** Firestore: users/{uid}/shiga_fm_sessions/{monthPeriod} */
export type ShigaFmSessionSummary = {
  monthPeriod: string;
  shigaFileName: string | null;
  fmFileName: string | null;
  savedAt: string;
  reconciledAt: string | null;
  shigaRecordCount: number;
  fmRecordCount: number;
  reconcileRowCount: number;
  fmShortageCount: number;
  unregisteredCount: number;
  employeeCount: number;
  partnerCount: number;
};

export type ShigaFmSessionDocument = ShigaFmSessionSummary & {
  schemaVersion: typeof SHIGA_FM_SESSION_SCHEMA_VERSION;
  updatedAt: string;
  employeeNames: string[];
  shigaPreprocess: PreprocessResult | null;
  fmPreprocess: PreprocessResult | null;
  reconcileResult: ShigaFmReconciliationResult | null;
};

export type ShigaFmSessionSaveInput = {
  monthPeriod: string;
  preprocessCache: {
    shiga: PreprocessResult | null;
    fm: PreprocessResult | null;
    employeeNames: string[];
  };
  reconcileResult: ShigaFmReconciliationResult | null;
  /** 既存セッションの savedAt を維持する場合 */
  preserveSavedAt?: string | null;
  /** 突合日時を維持する場合（再保存のみ） */
  preserveReconciledAt?: string | null;
};
