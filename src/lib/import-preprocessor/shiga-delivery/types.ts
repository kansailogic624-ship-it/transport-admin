export const SHIGA_DELIVERY_SCHEMA_VERSION = "1.0" as const;

/** 内部管理用コースコード（売上データ結合用キー要素） */
export type ShigaDeliveryCourseId =
  | "SHIGA_01"
  | "SHIGA_02"
  | "SHIGA_03"
  | "SHIGA_04";

export type ShigaDeliveryWarningCode =
  | "MISSING_BUSINESS_DATE"
  | "DAILY_TOTAL_MISMATCH"
  | "MONTHLY_TOTAL_MISMATCH"
  | "PARSE_ROW_SKIPPED"
  | "MANUAL_EDITED";

export type ShigaDeliveryRecordStatus = "ok" | "warning" | "skipped";

/** 将来の売上データ結合用キー（4要素） */
export type ShigaDeliveryJoinKeyParts = {
  vendorCode: string;
  vendorName: string;
  courseId: ShigaDeliveryCourseId;
  businessDate: string;
};

export type ShigaDeliveryStagingRecord = {
  id: string;
  sourceFileName: string;
  sourceRowNumber: number;
  sheetName: string;

  year: number;
  month: number;
  /** 例: "2026-05" */
  monthPeriod: string;
  /** 例: "2026-05"（締め月度・monthPeriod と同一） */
  closingMonth: string;

  vendorCode: string;
  vendorName: string;
  vehicleType: string;

  businessDate: string;
  weekday: string;

  courseId: ShigaDeliveryCourseId;
  courseName: string;
  routeName: string;

  /** `${vendorCode}|${vendorName}|${courseId}|${businessDate}` */
  joinKey: string;
  joinKeyParts: ShigaDeliveryJoinKeyParts;

  unitCount: number;
  freightAmount: number;
  overtimeHours: number;
  overtimePayAmount: number;
  freightPlusOvertimeAmount: number;
  tollAmount: number;
  coursePayTotal: number;

  dailyVehicleAmountTotal: number | null;
  dailyTollTotal: number | null;
  dailyUnitCountTotal: number | null;
  dailyPayTotal: number | null;

  status: ShigaDeliveryRecordStatus;
  warningFlags: ShigaDeliveryWarningCode[];
  warningMessages: string[];

  isManuallyEdited: boolean;
  originalSnapshot?: ShigaDeliveryStagingRecord;

  raw: Record<string, unknown>;
};

export type ShigaDeliveryDaySummary = {
  businessDate: string;
  weekday: string;
  sourceRowNumber: number;
  coursePaySum: number;
  excelDailyPayTotal: number | null;
  excelVehicleAmountTotal: number | null;
  excelTollTotal: number | null;
  isBalanced: boolean;
  mismatchReasons: string[];
  detailCount: number;
};

export type ShigaDeliveryCourseCount = {
  courseId: ShigaDeliveryCourseId;
  courseName: string;
  count: number;
};

export type ShigaDeliveryAmountTotals = {
  /** Excel上の日付行数 */
  importedDayCount: number;
  /** 明細が1件以上ある日数 */
  importedActiveDayCount: number;
  importedDetailCount: number;
  skippedRowCount: number;
  missingDateCount: number;
  /** 合計行など非ISO日付で突合対象から除外したコース明細数 */
  excludedNonIsoDateRowCount: number;
  unitCountTotal: number;
  freightTotal: number;
  overtimePayTotal: number;
  tollTotal: number;
  payTotal: number;
  dailyMismatchCount: number;
  monthlyMismatchCount: number;
  courseCounts: ShigaDeliveryCourseCount[];
  excelMonthlyTotals: {
    vehicleAmount: number | null;
    toll: number | null;
    unitCount: number | null;
    payTotal: number | null;
    found: boolean;
    sourceRowNumber: number | null;
  };
  reconciliation: {
    matches: {
      vehicleAmount: boolean | null;
      toll: boolean | null;
      unitCount: boolean | null;
      payTotal: boolean | null;
      allMatch: boolean | null;
    };
    mismatchReasons: string[];
  };
};

export const SHIGA_DELIVERY_WARNING_LABELS: Record<
  ShigaDeliveryWarningCode,
  string
> = {
  MISSING_BUSINESS_DATE: "日付不明",
  DAILY_TOTAL_MISMATCH: "日次金額不一致",
  MONTHLY_TOTAL_MISMATCH: "月次金額不一致",
  PARSE_ROW_SKIPPED: "取込スキップ行",
  MANUAL_EDITED: "手動修正済み",
};

export const SHIGA_DELIVERY_STATUS_LABELS: Record<
  ShigaDeliveryRecordStatus,
  string
> = {
  ok: "正常",
  warning: "警告",
  skipped: "スキップ",
};

/** JSON/CSV 出力用（業者・コース・経由地を含む） */
export type ShigaDeliveryExportRecord = {
  id: string;
  sourceRowNumber: number;
  monthPeriod: string;
  closingMonth: string;
  businessDate: string;
  weekday: string;
  vendorCode: string;
  vendorName: string;
  vehicleType: string;
  courseId: ShigaDeliveryCourseId;
  courseName: string;
  routeName: string;
  joinKey: string;
  joinKeyParts: ShigaDeliveryJoinKeyParts;
  unitCount: number;
  freightAmount: number;
  overtimeHours: number;
  overtimePayAmount: number;
  freightPlusOvertimeAmount: number;
  tollAmount: number;
  coursePayTotal: number;
  status: ShigaDeliveryRecordStatus;
  warningFlags: ShigaDeliveryWarningCode[];
  warningMessages: string[];
  isManuallyEdited: boolean;
};
