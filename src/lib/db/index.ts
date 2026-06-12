/**
 * データアクセス層の公開 API。
 * UI・ビジネスロジックは @/services/firestore-storage ではなくここから import する。
 * 現状は Firestore 実装への薄いファサード。
 */

export type {
  IDataStore,
  RecordsRepository,
  MastersRepository,
  VehicleExpensesRepository,
  MaintenanceBillsRepository,
  AmazonPerformanceRepository,
  LedgerRepository,
} from "./types";

export {
  loadRecords,
  saveRecords,
  saveRecord,
  updateRecord,
  deleteRecord,
  loadMasters,
  saveMasters,
  loadMaintenanceBills,
  getMaintenanceBillById,
  saveMaintenanceBill,
  saveMaintenanceBills,
  deleteMaintenanceBill,
  loadVehicleExpenses,
  loadVehicleExpensesByBillId,
  saveVehicleExpense,
  saveVehicleExpenses,
  deleteVehicleExpensesByBillId,
  loadAmazonPerformanceExpenses,
  loadAmazonPerformanceExpensesForMonths,
  batchUpsertAmazonPerformanceExpenses,
  saveAmazonPerformanceExpense,
  saveAmazonPerformanceExpenses,
  findBillByVendorMonthType,
  upsertBillWithExpenses,
  updateBillWithExpenses,
  loadEmployeeDetails,
  saveEmployeeDetails,
  upsertEmployeeDetail,
  deleteEmployeeDetail,
  loadVehicleDetails,
  saveVehicleDetails,
  upsertVehicleDetail,
  deleteVehicleDetail,
  loadJobDetails,
  saveJobDetails,
  upsertJobDetail,
  deleteJobDetail,
  getStorageInfo,
  isIdbMigrationDone,
  markIdbMigrationDone,
  type StorageInfo,
} from "@/services/firestore-storage";
