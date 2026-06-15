import type { PartnerCompanyProfile } from "./partner-company-types";
import type { ShipperCompanyProfile } from "./shipper-company-types";

export type RunType = "own" | "partner";

/** 日報提出ステータス */
export type DailyReportStatus =
  | "submitted"
  | "not_submitted"
  | "not_required";

export type CrewMemberType = "employee" | "part_time" | "dispatch";

export type TripCrewMember = {
  id: string;
  memberType: CrewMemberType;
  name: string;
  /** アルバイト・派遣の日額（円）。社員は給与マスタから自動按分 */
  dailyCost: string;
};

export type FusionDispatchOption = {
  dispatchName: string;
  shipperName: string;
  revenue: string;
  vehicleNumber: string;
};

/** 日報ラベル → FileMaker配車名 の学習ルール */
export type MappingRule = {
  id: string;
  /** 日報の品名・経由地など（部分一致） */
  reportKeyword: string;
  shipperName: string;
  dispatchName: string;
  vehicleNumber?: string;
  createdAt: string;
  updatedAt: string;
  hitCount: number;
};

export type TripEntry = {
  id: string;
  /** 自社便 / 傭車（協力会社） */
  runType: RunType;
  vehicleNumber: string;
  shipperName: string;
  /** 業務名（荷主マスタに紐づく） */
  jobName: string;
  revenue: string;
  /** 高速代（円） */
  tollFee: string;
  startMeter: string;
  endMeter: string;
  /** 当該業務の乗務員（1〜複数名） */
  crew: TripCrewMember[];
  /** 傭車時：協力会社名 */
  partnerName: string;
  /** 傭車時：支払運賃（円） */
  partnerFee: string;
  /** 日報取込時の元ラベル（学習・表示用） */
  reportSourceLabel?: string;
  /** 手動選択した FileMaker 配車名 */
  linkedDispatchName?: string;
  /** 配送件数（ドロップ数）。運転日報明細から自動算出、手動修正可 */
  dropCount?: number;
  /** Amazon実績CSV: 差異 */
  amazonDiff?: string;
  /** Amazon実績CSV: 備考 */
  amazonMemo?: string;
  /** Amazon実績CSV: 人件費 */
  amazonLaborCost?: string;
};

export type DailyRecord = {
  id: string;
  date: string;
  /** 記録全体の運行区分（傭車のみの日は partner） */
  operationType: RunType;
  driverName: string;
  clockIn: string;
  clockOut: string;
  rollCallTime: string;
  /** 業務後点呼の実施時刻（HH:MM） */
  rollCallEndTime?: string;
  /** 日報提出ステータス（提出済 / 未提出 / 提出不要） */
  reportStatus: DailyReportStatus;
  /** @deprecated 読み込み時のみ互換。新規は reportStatus を使用 */
  dailyReportSubmitted?: boolean;
  trips: TripEntry[];
  createdAt: string;
  /** 日報インポート時の走行距離（km）。メーター未入力時の月次集計に使用 */
  reportedDistanceKm?: number;
  /** 融合インポートの下書き（管理者が確認・修正するまで） */
  isFusionDraft?: boolean;
  /** 手動紐付け用の FileMaker 配車候補 */
  fusionDispatchOptions?: FusionDispatchOption[];
  /** 1日単位で選択した FileMaker 配車名（プレビュー行） */
  primaryLinkedDispatchName?: string;
  /** 点呼記録簿インポートで業務前点呼を反映済み */
  rollCallPreRecorded?: boolean;
  /** 点呼記録簿インポートで業務後点呼を反映済み */
  rollCallPostRecorded?: boolean;
  /** 点呼記録簿の社員ID（あれば） */
  employeeId?: string;
  /** 画面から日報ステータスを手動設定済み（再取込で上書きしない） */
  reportStatusManualOverride?: boolean;
  /** 画面から出勤時刻を手動設定済み */
  clockInManualOverride?: boolean;
  /** 画面から退勤時刻を手動設定済み */
  clockOutManualOverride?: boolean;
  /** FileMaker タイムカードの出勤時刻（HH:MM） */
  timecardIn?: string;
  /** FileMaker タイムカードの退勤時刻（HH:MM） */
  timecardOut?: string;
  /** 最後にこのレコードを作成・更新した取込履歴ID（明細ドリルダウン用） */
  importHistoryId?: string;
  /** FileMakerスケジュールから検出した休日ステータス（公休・有給） */
  dayStatus?: "公休" | "有給";
};

export type ImportType =
  | "rollcall"
  | "dailyReport"
  | "fusion"
  | "amazonPerformance";

export type ImportHistory = {
  id: string;
  importType: ImportType;
  fileName: string;
  importDateTime: string;
  recordCount: number;
  successCount: number;
  errorCount: number;
  importUser: string;
  /** この取込で作成・更新された日次レコードID（ロールバック用） */
  affectedRecordIds: string[];
  /** この取込で触れたドライバー×日キー（ID変化・再取込時の明細用） */
  affectedDayKeys?: string[];
};

/** 月次集計へ按分する固定経費（家賃・光熱費など） */
export type AllocationExpenseEntry = {
  id: string;
  /** 項目名（例: 家賃） */
  label: string;
  /** 月額（円） */
  amount: number;
  updatedAt?: string;
};

export type MasterData = {
  drivers: string[];
  /** 協力会社（傭車先）— partnerProfiles の名前と同期 */
  partners: string[];
  /** 協力会社プロファイル（協力会社台帳） */
  partnerProfiles?: PartnerCompanyProfile[];
  /** 荷主プロファイル（荷主台帳） */
  shipperProfiles?: ShipperCompanyProfile[];
  vehicles: string[];
  shippers: string[];
  /** 荷主名 → その荷主で選べる業務名の一覧 */
  shipperJobs: Record<string, string[]>;
  /** 社員名 → 月給（円） */
  employeeSalaries: Record<string, number>;
  /** アルバイトの標準日額（円） */
  defaultPartTimeDaily: number;
  /** 派遣の標準日額（円） */
  defaultDispatchDaily: number;
  /** 日報⇔FileMaker 配車の学習ルール */
  mappingRules: MappingRule[];
  /** 月次集計に自動加算する按分経費（複数登録可） */
  allocationExpenses: AllocationExpenseEntry[];
};

export const STORAGE_KEY = "transport-admin-records";
export const DRIVERS_KEY = "transport-admin-drivers";
export const MASTERS_KEY = "transport-admin-masters";
export const CUSTOM_MAPPING_RULES_KEY = "custom_mapping_rules";
export const IMPORT_HISTORY_KEY = "transport-admin-import-history";
export const VEHICLE_MAPPING_RULES_KEY = "custom_vehicle_mapping_rules";

// ---------------------------------------------------------------------------
// 車両整備請求書（車両経費管理）
// ---------------------------------------------------------------------------

/** 整備業者からの請求書1通を表すレコード */
/** 請求書の種別（ダイサブは整備費と部品代が別々に届く） */
export type BillType =
  | "整備費"
  | "部品代"
  | "一括"
  | "燃料代"
  | "高速代"
  | "その他";

/**
 * Amazon実績の生産性・経費管理用レコード（FMスケジュールテーブルとは別保存）
 */
export type AmazonPerformanceExpenseRecord = {
  id: string;
  /** 運行日 YYYY-MM-DD */
  serviceDate: string;
  driverName: string;
  companyName: string;
  routeLabel: string;
  revenue: number;
  payment: number;
  diff: number;
  memo: string;
  laborCost: number;
  /** own_update / own_new / partner_new */
  mergeKind: "own_update" | "own_new" | "partner_new";
  /** 参照用（FMスケジュールへは書き戻さない） */
  linkedScheduleRecordId?: string;
  /** 集計月 YYYY-MM */
  billingMonth: string;
  sourceFileName: string;
  createdAt: string;
  updatedAt: string;
};

/** OCR取込時の1行スナップショット（監査・精度改善用） */
export type InvoiceOcrLineSnapshot = {
  vehicle_number: string;
  repair_type: string;
  amount_text: string;
  tax_text?: string;
  common_text?: string;
  tax_type: string;
  labor_fee?: number;
  parts_fee?: number;
  common_expense?: number;
  consumption_tax?: number;
  total_amount?: number;
};

/** OCR取込時の原本データ */
export type InvoiceOcrSnapshot = {
  rawText: string;
  extractionMode: "native_text" | "ocr_fallback" | "text" | "ai" | "legacy";
  parsedAt: string;
  vendor_name?: string;
  lines: InvoiceOcrLineSnapshot[];
  aiResponse?: unknown;
};

/** ユーザー編集後のスナップショット */
export type InvoiceEditedSnapshot = {
  updatedAt: string;
  vendorName: string;
  clientName: string;
  billingMonth: string;
  issueDate: string;
  billType: BillType;
  totalAmount: number;
  maintenanceSubtotalExTax: number;
  taxAmount: number;
  expensesSubtotal: number;
  memo: string;
  lines: {
    vehicleNumber: string;
    maintenanceType?: MaintenanceType;
    workDescription: string;
    laborFee: number;
    partsFee: number;
    commonExpense: number;
    consumptionTax: number;
    totalAmount: number;
    taxCategory?: string;
  }[];
};

export type VehicleMaintenanceBill = {
  id: string;
  /** 請求元業者名（例: 株式会社ダイサブ） */
  vendorName: string;
  /** 請求先（例: 株式会社カンサイロジック） */
  clientName: string;
  /**
   * 請求対象月（整備実施月）
   * YYYY-MM 形式（例: "2026-05"）
   */
  billingMonth: string;
  /**
   * 発行日（請求年月日）
   * YYYY-MM-DD 形式（例: "2026-06-02"）
   */
  issueDate: string;
  /**
   * 請求書種別（同一業者から整備費・部品代が別々に届く場合に区別）
   * 省略時は "その他" として扱う
   */
  billType: BillType;
  /** 御請求総額（税込）（円） */
  totalAmount: number;
  /** 整備費用小計（税抜）（円） */
  maintenanceSubtotalExTax: number;
  /** 整備費用の消費税額（円） */
  taxAmount: number;
  /** 諸費用小計（車検代・代行費など）（円） */
  expensesSubtotal: number;
  /** 備考・メモ */
  memo: string;
  /** 登録日時（ISO 8601） */
  createdAt: string;
  /** インポート元ファイル名 */
  sourceFileName: string;
  /** OCR取込時の原本（編集しても保持） */
  ocrOriginalData?: InvoiceOcrSnapshot;
  /** 最終編集後のスナップショット（表示・監査用） */
  editedData?: InvoiceEditedSnapshot;
};

/** 整備種別（車両別内訳の項目分類） */
export type MaintenanceType =
  | "車検"
  | "3か月点検（法定）"
  | "一般整備"
  | "その他";

/**
 * 車両別経費明細レコード
 * VehicleMaintenanceBill に紐づく車両単位の明細。
 * ダイサブの「整備費」と「部品代」は billType が異なるため別レコードとして共存できる。
 */
export type VehicleExpenseRecord = {
  id: string;
  /** 請求月 (YYYY-MM) */
  billingMonth: string;
  /** 請求元業者名 */
  vendorName: string;
  /** 請求書種別 */
  billType: BillType;
  /** 車両ナンバー（正規化済み: 例 "京都101あ600"） */
  vehicleNumber: string;
  /** 作業内容メモ（任意） */
  workDescription: string;
  /** 技術料・工賃（円） */
  laborFee: number;
  /** 部品代（円） */
  partsFee: number;
  /** 諸費用（円） */
  commonExpense: number;
  /** 行の消費税額（円） */
  consumptionTax?: number;
  /** 整備種別 */
  maintenanceType?: MaintenanceType;
  /** 合計金額（円） */
  totalAmount: number;
  /** 親請求書 ID（VehicleMaintenanceBill.id） */
  parentBillId: string;
  /** 登録日時 */
  createdAt: string;
  /** ソースファイル名 */
  sourceFileName: string;
};

/** 車両番号の表記揺れ吸収用学習ルール */
export type VehicleMappingRule = {
  id: string;
  /** インポートデータ側の表記（例: "京都9144", "9144", "京都A"） */
  rawVehicle: string;
  /** マスタ側の正規表記（例: "品川500あ1234"） */
  canonicalVehicle: string;
  createdAt: string;
  updatedAt: string;
  hitCount: number;
};

export const DEFAULT_DRIVERS = [
  "山田 太郎",
  "佐藤 花子",
  "鈴木 一郎",
  "高橋 次郎",
];

export const DEFAULT_MASTERS: MasterData = {
  drivers: [...DEFAULT_DRIVERS],
  partners: ["〇〇運輸", "▲▲ロジスティクス"],
  partnerProfiles: [],
  vehicles: ["品川500あ1234", "品川500い5678"],
  shippers: ["株式会社ABC物流", "東京食品運輸"],
  shipperJobs: {
    株式会社ABC物流: ["常温配送", "冷凍配送"],
    東京食品運輸: ["店舗配送", "センター搬入"],
  },
  employeeSalaries: {
    "山田 太郎": 320000,
    "佐藤 花子": 300000,
  },
  defaultPartTimeDaily: 10000,
  defaultDispatchDaily: 15000,
  mappingRules: [],
  allocationExpenses: [],
};

export type SystemBackup = {
  version: 1;
  exportedAt: string;
  records: DailyRecord[];
  masters: MasterData;
};

/** 社員台帳（社員マスタ.xlsx 由来の個人情報） */
export type EmployeeDetail = {
  /** Firestore ドキュメント ID（社員ID と同一） */
  id: string;
  employeeId: string;
  name: string;
  nameKana: string;
  address: string;
  /** YYYY-MM-DD */
  birthDate: string;
  hireDate: string;
  appointmentDate: string;
  licenseNumber: string;
  /** 1=在籍中, 0=退職・非在籍 */
  activeFlag: 0 | 1;
  retirementReason: string;
  updatedAt: string;
};

/** 車両台帳（車両マスタ.xlsx 由来） */
export type VehicleDetail = {
  /** Firestore ドキュメント ID（車両ID と同一） */
  id: string;
  vehicleId: string;
  /** 社内管理用コード（例: 38-12） */
  vehicleCode: string;
  /** ナンバープレート（例: 京都100い38-12） */
  plateNumber: string;
  tonnageDisplay: string;
  vehicleName: string;
  modelType: string;
  /** YYYY-MM-DD */
  inspectionExpiry: string;
  /** 和暦表記（例: H23.03） */
  firstYear: string;
  loadCapacity: number;
  grossWeight: number;
  registeredDate: string;
  scrappedDate: string;
  heightMm?: number;
  lengthMm?: number;
  widthMm?: number;
  updatedAt: string;
};

/** 業務単価の改定履歴 */
export type JobPriceHistoryEntry = {
  /** 契約単価（円） */
  price: number;
  /** 適用開始日 YYYY-MM-DD */
  effectiveFrom: string;
  note?: string;
};

/** 業務台帳（業務マスタ.xlsx 由来） */
export type JobDetail = {
  /** Firestore ドキュメント ID（業務ID と同一） */
  id: string;
  jobId: string;
  shipperName: string;
  jobName: string;
  /** 最新の契約単価（円）— 一覧表示用 */
  revenue: number;
  /** 単価改定履歴 */
  priceHistory: JobPriceHistoryEntry[];
  notes: string;
  updatedAt: string;
};
