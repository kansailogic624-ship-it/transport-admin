/**
 * Firestore へのデータアクセス（クラウド同期）
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { consolidateDailyRecordsByDriverDay } from "@/lib/record-consolidate";
import { normalizeRecord } from "@/lib/trip-normalize";
import { auth, firestore } from "@/lib/firebase";
import {
  DEFAULT_MASTERS,
  type BillType,
  type DailyRecord,
  type MasterData,
  type VehicleExpenseRecord,
  type VehicleMaintenanceBill,
} from "@/lib/types";
import {
  userMaintenanceBillsPath,
  userMastersPath,
  userMetaPath,
  userRecordsPath,
  userVehicleExpensesPath,
} from "./firestore-paths";
import { cleanForFirestore, replaceCollectionDocs } from "./firestore-utils";

function requireUserId(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("ログインが必要です");
  }
  return uid;
}

// ---------------------------------------------------------------------------
// 汎用 CRUD（レコード）
// ---------------------------------------------------------------------------

export async function saveRecord(record: DailyRecord): Promise<void> {
  const uid = requireUserId();
  const normalized = normalizeRecord(record);
  await setDoc(
    doc(firestore, userRecordsPath(uid), normalized.id),
    cleanForFirestore(normalized),
  );
}

export async function getAllRecords(): Promise<DailyRecord[]> {
  const uid = requireUserId();
  const snap = await getDocs(collection(firestore, userRecordsPath(uid)));
  const rows = snap.docs.map((d) => normalizeRecord(d.data() as DailyRecord));
  if (rows.length === 0) return [];
  return consolidateDailyRecordsByDriverDay(rows);
}

export async function updateRecord(
  id: string,
  patch: Partial<DailyRecord>,
): Promise<void> {
  const uid = requireUserId();
  await updateDoc(
    doc(firestore, userRecordsPath(uid), id),
    cleanForFirestore(patch),
  );
}

export async function deleteRecord(id: string): Promise<void> {
  const uid = requireUserId();
  await deleteDoc(doc(firestore, userRecordsPath(uid), id));
}

// ---------------------------------------------------------------------------
// Records（アプリ互換の一括 API）
// ---------------------------------------------------------------------------

export async function loadRecords(): Promise<DailyRecord[]> {
  return getAllRecords();
}

export async function saveRecords(records: DailyRecord[]): Promise<void> {
  const uid = requireUserId();
  const consolidated = consolidateDailyRecordsByDriverDay(
    records.map(normalizeRecord),
  );
  await replaceCollectionDocs(
    firestore,
    userRecordsPath(uid),
    consolidated,
    (item) => cleanForFirestore(item),
  );
}

/** @deprecated loadRecords を使用 */
export const idbLoadRecords = loadRecords;
/** @deprecated saveRecords を使用 */
export const idbSaveRecords = saveRecords;

// ---------------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------------

export async function loadMasters(): Promise<MasterData> {
  const uid = requireUserId();
  const snap = await getDoc(doc(firestore, userMastersPath(uid)));
  if (!snap.exists()) return { ...DEFAULT_MASTERS };
  return { ...DEFAULT_MASTERS, ...(snap.data() as MasterData) };
}

export async function saveMasters(masters: MasterData): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userMastersPath(uid)),
    cleanForFirestore(masters),
  );
}

export const idbLoadMasters = loadMasters;
export const idbSaveMasters = saveMasters;

// ---------------------------------------------------------------------------
// VehicleMaintenanceBills
// ---------------------------------------------------------------------------

export async function loadMaintenanceBills(): Promise<VehicleMaintenanceBill[]> {
  const uid = requireUserId();
  const snap = await getDocs(
    collection(firestore, userMaintenanceBillsPath(uid)),
  );
  return snap.docs
    .map((d) => d.data() as VehicleMaintenanceBill)
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
}

export async function saveMaintenanceBill(
  bill: VehicleMaintenanceBill,
): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userMaintenanceBillsPath(uid), bill.id),
    cleanForFirestore(bill),
  );
}

export async function saveMaintenanceBills(
  bills: VehicleMaintenanceBill[],
): Promise<void> {
  const uid = requireUserId();
  for (const bill of bills) {
    await saveMaintenanceBill(bill);
  }
}

export async function deleteMaintenanceBill(id: string): Promise<void> {
  const uid = requireUserId();
  await deleteDoc(doc(firestore, userMaintenanceBillsPath(uid), id));
  const expenses = await loadVehicleExpensesByBillId(id);
  await Promise.all(expenses.map((e) => deleteVehicleExpense(e.id)));
}

export const idbLoadMaintenanceBills = loadMaintenanceBills;
export const idbSaveMaintenanceBill = saveMaintenanceBill;
export const idbSaveMaintenanceBills = saveMaintenanceBills;
export const idbDeleteMaintenanceBill = deleteMaintenanceBill;

// ---------------------------------------------------------------------------
// VehicleExpenseRecord
// ---------------------------------------------------------------------------

export async function loadVehicleExpenses(): Promise<VehicleExpenseRecord[]> {
  const uid = requireUserId();
  const snap = await getDocs(
    collection(firestore, userVehicleExpensesPath(uid)),
  );
  return snap.docs
    .map((d) => d.data() as VehicleExpenseRecord)
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
}

export async function loadVehicleExpensesByBillId(
  parentBillId: string,
): Promise<VehicleExpenseRecord[]> {
  const all = await loadVehicleExpenses();
  return all.filter((e) => e.parentBillId === parentBillId);
}

export async function saveVehicleExpense(
  record: VehicleExpenseRecord,
): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userVehicleExpensesPath(uid), record.id),
    cleanForFirestore(record),
  );
}

export async function saveVehicleExpenses(
  records: VehicleExpenseRecord[],
): Promise<void> {
  const uid = requireUserId();
  await Promise.all(records.map((record) => saveVehicleExpense(record)));
}

async function deleteVehicleExpense(id: string): Promise<void> {
  const uid = requireUserId();
  await deleteDoc(doc(firestore, userVehicleExpensesPath(uid), id));
}

export async function deleteVehicleExpensesByBillId(
  parentBillId: string,
): Promise<void> {
  const targets = await loadVehicleExpensesByBillId(parentBillId);
  await Promise.all(targets.map((e) => deleteVehicleExpense(e.id)));
}

export const idbLoadVehicleExpenses = loadVehicleExpenses;
export const idbLoadVehicleExpensesByBillId = loadVehicleExpensesByBillId;
export const idbSaveVehicleExpense = saveVehicleExpense;
export const idbSaveVehicleExpenses = saveVehicleExpenses;
export const idbDeleteVehicleExpensesByBillId = deleteVehicleExpensesByBillId;

export async function findBillByVendorMonthType(
  vendorName: string,
  billingMonth: string,
  billType: BillType,
): Promise<VehicleMaintenanceBill | undefined> {
  const all = await loadMaintenanceBills();
  return all.find(
    (b) =>
      b.vendorName === vendorName &&
      b.billingMonth === billingMonth &&
      b.billType === billType,
  );
}

export const idbFindBillByVendorMonthType = findBillByVendorMonthType;

export async function upsertBillWithExpenses(
  bill: VehicleMaintenanceBill,
  expenses: VehicleExpenseRecord[],
): Promise<void> {
  const existing = await findBillByVendorMonthType(
    bill.vendorName,
    bill.billingMonth,
    bill.billType,
  );
  if (existing) {
    await deleteMaintenanceBill(existing.id);
  }
  await saveMaintenanceBill(bill);
  if (expenses.length > 0) {
    await saveVehicleExpenses(expenses);
  }
}

export const idbUpsertBillWithExpenses = upsertBillWithExpenses;

// ---------------------------------------------------------------------------
// ストレージ情報
// ---------------------------------------------------------------------------

export interface StorageInfo {
  recordCount: number;
  estimatedBytes: number | null;
  estimatedLabel: string;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const records = await loadRecords();
  return {
    recordCount: records.length,
    estimatedBytes: null,
    estimatedLabel: "Firestore（クラウド）",
  };
}

export const idbGetStorageInfo = getStorageInfo;

// ---------------------------------------------------------------------------
// 移行フラグ
// ---------------------------------------------------------------------------

export async function isIdbMigrationDone(): Promise<boolean> {
  const uid = requireUserId();
  const snap = await getDoc(doc(firestore, userMetaPath(uid)));
  return snap.data()?.idbMigrated === true;
}

export async function markIdbMigrationDone(): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userMetaPath(uid)),
    cleanForFirestore({
      idbMigrated: true,
      migratedAt: new Date().toISOString(),
    }),
    { merge: true },
  );
}
