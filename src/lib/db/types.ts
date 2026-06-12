/**
 * データストア抽象型。
 * Firestore 実装を SQLite / PostgreSQL へ差し替える際はこのインターフェースを満たす。
 */

import type {
  AmazonPerformanceExpenseRecord,
  DailyRecord,
  EmployeeDetail,
  JobDetail,
  MasterData,
  VehicleDetail,
  VehicleExpenseRecord,
  VehicleMaintenanceBill,
} from "@/lib/types";

export interface RecordsRepository {
  load(): Promise<DailyRecord[]>;
  save(records: DailyRecord[]): Promise<void>;
}

export interface MastersRepository {
  load(): Promise<MasterData>;
  save(masters: MasterData): Promise<void>;
}

export interface VehicleExpensesRepository {
  loadAll(): Promise<VehicleExpenseRecord[]>;
  loadByBillId(parentBillId: string): Promise<VehicleExpenseRecord[]>;
}

export interface MaintenanceBillsRepository {
  loadAll(): Promise<VehicleMaintenanceBill[]>;
}

export interface AmazonPerformanceRepository {
  loadAll(): Promise<AmazonPerformanceExpenseRecord[]>;
}

export interface LedgerRepository {
  loadEmployees(): Promise<EmployeeDetail[]>;
  loadVehicles(): Promise<VehicleDetail[]>;
  loadJobs(): Promise<JobDetail[]>;
}

/** アプリ全体で利用するデータストアの契約（将来の SQL 実装用） */
export interface IDataStore {
  records: RecordsRepository;
  masters: MastersRepository;
  vehicleExpenses: VehicleExpensesRepository;
  maintenanceBills: MaintenanceBillsRepository;
  amazonPerformance: AmazonPerformanceRepository;
  ledger: LedgerRepository;
}
