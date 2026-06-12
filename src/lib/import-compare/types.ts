import type { PreprocessSourceType } from "@/lib/import-preprocessor/types";

/** 旧/新パイプラインを横並び比較する1行 */
export type ComparableImportRow = {
  pipeline: "old" | "new";
  rowIndex: number;
  matchKey: string;
  date: string;
  driver: string;
  vehicle: string;
  shipper: string;
  job: string;
  route: string;
  sales: number;
  payment: number;
  tollFee: number;
  clockIn: string;
  clockOut: string;
  rollCallTime: string;
  warnings: string;
  errors: string;
  operationType: string;
  company: string;
};

export type ImportCompareFieldDiff = {
  matchKey: string;
  field: string;
  oldValue: string;
  newValue: string;
  oldRowIndex: number;
  newRowIndex: number;
};

export type ImportCompareReport = {
  sourceType: PreprocessSourceType;
  fileName: string;
  oldFunction: string;
  newFunction: string;
  oldCount: number;
  newCount: number;
  matchedKeys: number;
  oldOnlyKeys: string[];
  newOnlyKeys: string[];
  fieldDiffs: ImportCompareFieldDiff[];
  oldRows: ComparableImportRow[];
  newRows: ComparableImportRow[];
  notes: string[];
};
