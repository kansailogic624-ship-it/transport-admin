/**
 * Firestore へのデータアクセス（クラウド同期）
 */
import {
  collection,
  deleteDoc,
  doc,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import { consolidateDailyRecordsByDriverDay } from "@/lib/record-consolidate";
import { normalizeRecord } from "@/lib/trip-normalize";
import { auth, firestore } from "@/lib/firebase";
import {
  DEFAULT_MASTERS,
  type AmazonPerformanceExpenseRecord,
  type BillType,
  type DailyRecord,
  type EmployeeDetail,
  type JobDetail,
  type MasterData,
  type VehicleDetail,
  type VehicleExpenseRecord,
  type VehicleMaintenanceBill,
} from "@/lib/types";
import {
  userAmazonPerformanceExpensesPath,
  userEmployeeDetailsPath,
  userJobsPath,
  userMaintenanceBillsPath,
  userMastersPath,
  userMetaPath,
  userRecordsPath,
  userVehicleExpensesPath,
  userVehiclesPath,
} from "./firestore-paths";
import {
  firestoreCacheKey,
  getFirestoreCache,
  invalidateFirestoreCache,
  setFirestoreCache,
} from "./firestore-cache";
import {
  recordFirestoreWrite,
  tracedGetDoc,
  tracedGetDocs,
} from "./firestore-read-trace";
import {
  cleanForFirestore,
  seedCollectionBaseline,
  syncCollectionDocs,
} from "./firestore-utils";

const BATCH_LIMIT = 450;

/** 直近ロード／保存済みレコードのスナップショット（差分保存用） */
let recordsBaseline = new Map<string, string>();
/** マスタの直近ハッシュ（変更なし書き込みをスキップ） */
let mastersBaselineHash: string | null = null;

function recordContentHash(record: DailyRecord): string {
  return JSON.stringify(cleanForFirestore(normalizeRecord(record)));
}

function syncRecordsBaseline(records: DailyRecord[]): void {
  recordsBaseline = new Map(
    records.map((r) => [r.id, recordContentHash(r)]),
  );
}

async function commitBatchOps(
  ops: Array<
    | { type: "delete"; ref: ReturnType<typeof doc> }
    | { type: "set"; ref: ReturnType<typeof doc>; data: ReturnType<typeof cleanForFirestore> }
  >,
  label: string,
): Promise<void> {
  if (ops.length === 0) return;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(firestore);
    for (const op of chunk) {
      if (op.type === "delete") {
        batch.delete(op.ref);
      } else {
        batch.set(op.ref, op.data);
      }
    }
    await batch.commit();
    recordFirestoreWrite(`${label}:batch`, chunk.length);
  }
}

function mastersContentHash(masters: MasterData): string {
  return JSON.stringify(cleanForFirestore(masters));
}

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
  recordFirestoreWrite("saveRecord");
  recordsBaseline.set(normalized.id, recordContentHash(normalized));
  invalidateFirestoreCache(firestoreCacheKey(uid, "records"));
}

/** @internal AppShell 初期化（loadRecords）からのみ呼ぶ */
async function getAllRecords(): Promise<DailyRecord[]> {
  console.count("getAllRecords");
  const uid = requireUserId();
  const cacheKey = firestoreCacheKey(uid, "records");
  const cached = getFirestoreCache<DailyRecord[]>(cacheKey);
  if (cached) {
    syncRecordsBaseline(cached);
    return cached;
  }

  const snap = await tracedGetDocs(
    collection(firestore, userRecordsPath(uid)),
    `getAllRecords:${userRecordsPath(uid)}`,
  );
  const rows = snap.docs.map((d) => normalizeRecord(d.data() as DailyRecord));
  const consolidated =
    rows.length === 0 ? [] : consolidateDailyRecordsByDriverDay(rows);
  setFirestoreCache(cacheKey, consolidated);
  syncRecordsBaseline(consolidated);
  return consolidated;
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
  recordFirestoreWrite("updateRecord");
}

export async function deleteRecord(id: string): Promise<void> {
  const uid = requireUserId();
  await deleteDoc(doc(firestore, userRecordsPath(uid), id));
  recordFirestoreWrite("deleteRecord");
}

// ---------------------------------------------------------------------------
// Records（アプリ互換の一括 API）
// ---------------------------------------------------------------------------

/**
 * 日次レコード全件読込（AppShell ログイン時のみ呼ぶこと）
 */
export async function loadRecords(): Promise<DailyRecord[]> {
  console.count("loadData");
  return getAllRecords();
}

/**
 * 差分のみ upsert / delete（全件 getDocs + 全削除を行わない）
 */
export async function saveRecords(records: DailyRecord[]): Promise<void> {
  const uid = requireUserId();
  const consolidated = consolidateDailyRecordsByDriverDay(
    records.map(normalizeRecord),
  );
  const colPath = userRecordsPath(uid);
  const colRef = collection(firestore, colPath);

  const nextIds = new Set(consolidated.map((r) => r.id));
  const toUpsert: DailyRecord[] = [];
  const toDelete: string[] = [];

  for (const record of consolidated) {
    const hash = recordContentHash(record);
    if (recordsBaseline.get(record.id) !== hash) {
      toUpsert.push(record);
      recordsBaseline.set(record.id, hash);
    }
  }

  for (const id of recordsBaseline.keys()) {
    if (!nextIds.has(id)) {
      toDelete.push(id);
      recordsBaseline.delete(id);
    }
  }

  if (toUpsert.length === 0 && toDelete.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[saveRecords] 変更なし — Firestore 書き込みをスキップ");
    }
    return;
  }

  const ops: Array<
    | { type: "delete"; ref: ReturnType<typeof doc> }
    | { type: "set"; ref: ReturnType<typeof doc>; data: ReturnType<typeof cleanForFirestore> }
  > = [
    ...toDelete.map((id) => ({
      type: "delete" as const,
      ref: doc(colRef, id),
    })),
    ...toUpsert.map((record) => ({
      type: "set" as const,
      ref: doc(colRef, record.id),
      data: cleanForFirestore(record),
    })),
  ];

  await commitBatchOps(ops, "saveRecords");
  invalidateFirestoreCache(firestoreCacheKey(uid, "records"));
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
  const cacheKey = firestoreCacheKey(uid, "masters");
  const cached = getFirestoreCache<MasterData>(cacheKey);
  if (cached) return cached;

  const snap = await tracedGetDoc(
    doc(firestore, userMastersPath(uid)),
    `loadMasters:${userMastersPath(uid)}`,
  );
  const masters = snap.exists()
    ? { ...DEFAULT_MASTERS, ...(snap.data() as MasterData) }
    : { ...DEFAULT_MASTERS };
  mastersBaselineHash = mastersContentHash(masters);
  setFirestoreCache(cacheKey, masters);
  return masters;
}

export async function saveMasters(masters: MasterData): Promise<void> {
  const uid = requireUserId();
  const hash = mastersContentHash(masters);
  if (mastersBaselineHash === hash) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[saveMasters] 変更なし — Firestore 書き込みをスキップ");
    }
    return;
  }
  await setDoc(
    doc(firestore, userMastersPath(uid)),
    cleanForFirestore(masters),
  );
  recordFirestoreWrite("saveMasters");
  mastersBaselineHash = hash;
  setFirestoreCache(firestoreCacheKey(uid, "masters"), masters);
}

export const idbLoadMasters = loadMasters;
export const idbSaveMasters = saveMasters;

// ---------------------------------------------------------------------------
// VehicleMaintenanceBills
// ---------------------------------------------------------------------------

export async function loadMaintenanceBills(): Promise<VehicleMaintenanceBill[]> {
  const uid = requireUserId();
  const cacheKey = firestoreCacheKey(uid, "maintenanceBills");
  const cached = getFirestoreCache<VehicleMaintenanceBill[]>(cacheKey);
  if (cached) return cached;

  const snap = await tracedGetDocs(
    collection(firestore, userMaintenanceBillsPath(uid)),
    `loadMaintenanceBills:${userMaintenanceBillsPath(uid)}`,
  );
  const bills = snap.docs
    .map((d) => d.data() as VehicleMaintenanceBill)
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
  setFirestoreCache(cacheKey, bills);
  return bills;
}

export async function getMaintenanceBillById(
  id: string,
): Promise<VehicleMaintenanceBill | undefined> {
  const uid = requireUserId();
  const snap = await tracedGetDoc(
    doc(firestore, userMaintenanceBillsPath(uid), id),
    `getMaintenanceBillById:${id}`,
  );
  if (!snap.exists()) return undefined;
  return snap.data() as VehicleMaintenanceBill;
}

export async function saveMaintenanceBill(
  bill: VehicleMaintenanceBill,
): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userMaintenanceBillsPath(uid), bill.id),
    cleanForFirestore(bill),
  );
  recordFirestoreWrite("saveMaintenanceBill");
  invalidateFirestoreCache(firestoreCacheKey(uid, "maintenanceBills"));
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
  recordFirestoreWrite("deleteMaintenanceBill");
  invalidateFirestoreCache(firestoreCacheKey(uid, "maintenanceBills"));
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
  const cacheKey = firestoreCacheKey(uid, "vehicleExpenses");
  const cached = getFirestoreCache<VehicleExpenseRecord[]>(cacheKey);
  if (cached) return cached;

  const snap = await tracedGetDocs(
    collection(firestore, userVehicleExpensesPath(uid)),
    `loadVehicleExpenses:${userVehicleExpensesPath(uid)}`,
  );
  const expenses = snap.docs
    .map((d) => d.data() as VehicleExpenseRecord)
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
  setFirestoreCache(cacheKey, expenses);
  return expenses;
}

export async function loadVehicleExpensesByBillId(
  parentBillId: string,
): Promise<VehicleExpenseRecord[]> {
  const uid = requireUserId();
  const cacheKey = firestoreCacheKey(uid, "vehicleExpenses", "byBill", parentBillId);
  const cached = getFirestoreCache<VehicleExpenseRecord[]>(cacheKey);
  if (cached) return cached;

  const snap = await tracedGetDocs(
    query(
      collection(firestore, userVehicleExpensesPath(uid)),
      where("parentBillId", "==", parentBillId),
    ),
    `loadVehicleExpensesByBillId:${parentBillId}`,
  );
  const expenses = snap.docs.map((d) => d.data() as VehicleExpenseRecord);
  setFirestoreCache(cacheKey, expenses);
  return expenses;
}

export async function saveVehicleExpense(
  record: VehicleExpenseRecord,
): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userVehicleExpensesPath(uid), record.id),
    cleanForFirestore(record),
  );
  recordFirestoreWrite("saveVehicleExpense");
  invalidateFirestoreCache(firestoreCacheKey(uid, "vehicleExpenses"));
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
  recordFirestoreWrite("deleteVehicleExpense");
  invalidateFirestoreCache(firestoreCacheKey(uid, "vehicleExpenses"));
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

// ---------------------------------------------------------------------------
// AmazonPerformanceExpense（生産性・経費管理）
// ---------------------------------------------------------------------------

const AMAZON_EXPENSE_BATCH_LIMIT = 400;
const AMAZON_EXPENSE_BATCH_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadAmazonPerformanceExpenses(): Promise<
  AmazonPerformanceExpenseRecord[]
> {
  const uid = requireUserId();
  const cacheKey = firestoreCacheKey(uid, "amazonPerformanceExpenses");
  const cached = getFirestoreCache<AmazonPerformanceExpenseRecord[]>(cacheKey);
  if (cached) return cached;

  const snap = await tracedGetDocs(
    collection(firestore, userAmazonPerformanceExpensesPath(uid)),
    `loadAmazonPerformanceExpenses:${userAmazonPerformanceExpensesPath(uid)}`,
  );
  const rows = snap.docs.map((d) => d.data() as AmazonPerformanceExpenseRecord);
  setFirestoreCache(cacheKey, rows);
  return rows;
}

/**
 * 指定 billingMonth のみ読み込み（Amazon取込確定時用。全件 getDocs を避ける）
 */
export async function loadAmazonPerformanceExpensesForMonths(
  billingMonths: string[],
): Promise<AmazonPerformanceExpenseRecord[]> {
  const uid = requireUserId();
  const months = [...new Set(billingMonths.map((m) => m.trim()).filter(Boolean))];
  if (months.length === 0) return [];

  const fullCacheKey = firestoreCacheKey(uid, "amazonPerformanceExpenses");
  const fullCached = getFirestoreCache<AmazonPerformanceExpenseRecord[]>(fullCacheKey);
  if (fullCached) {
    const monthSet = new Set(months);
    return fullCached.filter((row) => monthSet.has(row.billingMonth));
  }

  const monthCacheKey = firestoreCacheKey(
    uid,
    "amazonPerformanceExpenses",
    "months",
    months.join(","),
  );
  const monthCached =
    getFirestoreCache<AmazonPerformanceExpenseRecord[]>(monthCacheKey);
  if (monthCached) return monthCached;

  const colRef = collection(firestore, userAmazonPerformanceExpensesPath(uid));
  const rows: AmazonPerformanceExpenseRecord[] = [];
  const IN_LIMIT = 10;

  for (let i = 0; i < months.length; i += IN_LIMIT) {
    const chunk = months.slice(i, i + IN_LIMIT);
    const constraints: QueryConstraint[] =
      chunk.length === 1
        ? [where("billingMonth", "==", chunk[0]!)]
        : [where("billingMonth", "in", chunk)];
    const snap = await tracedGetDocs(
      query(colRef, ...constraints),
      `loadAmazonPerformanceExpensesForMonths:${chunk.join(",")}`,
    );
    rows.push(...snap.docs.map((d) => d.data() as AmazonPerformanceExpenseRecord));
  }

  setFirestoreCache(monthCacheKey, rows);
  return rows;
}

/**
 * Amazon経費をバッチ upsert（変更分のみ。1件ずつ setDoc しない）
 */
export async function batchUpsertAmazonPerformanceExpenses(
  records: AmazonPerformanceExpenseRecord[],
): Promise<{ batchCommits: number; writeCount: number }> {
  if (records.length === 0) {
    return { batchCommits: 0, writeCount: 0 };
  }

  const uid = requireUserId();
  const colPath = userAmazonPerformanceExpensesPath(uid);
  const colRef = collection(firestore, colPath);

  let batchCommits = 0;
  let writeCount = 0;

  for (let i = 0; i < records.length; i += AMAZON_EXPENSE_BATCH_LIMIT) {
    const chunk = records.slice(i, i + AMAZON_EXPENSE_BATCH_LIMIT);
    const batch = writeBatch(firestore);
    for (const record of chunk) {
      batch.set(
        doc(colRef, record.id),
        cleanForFirestore(record),
      );
    }
    await batch.commit();
    batchCommits++;
    writeCount += chunk.length;
    recordFirestoreWrite("batchUpsertAmazonPerformanceExpenses:batch", chunk.length);

    if (i + AMAZON_EXPENSE_BATCH_LIMIT < records.length) {
      await sleep(AMAZON_EXPENSE_BATCH_DELAY_MS);
    }
  }

  invalidateFirestoreCache(firestoreCacheKey(uid, "amazonPerformanceExpenses"));
  return { batchCommits, writeCount };
}

export async function saveAmazonPerformanceExpense(
  record: AmazonPerformanceExpenseRecord,
): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userAmazonPerformanceExpensesPath(uid), record.id),
    cleanForFirestore(record),
  );
  recordFirestoreWrite("saveAmazonPerformanceExpense");
  invalidateFirestoreCache(firestoreCacheKey(uid, "amazonPerformanceExpenses"));
}

export async function saveAmazonPerformanceExpenses(
  records: AmazonPerformanceExpenseRecord[],
): Promise<void> {
  await batchUpsertAmazonPerformanceExpenses(records);
}

// ---------------------------------------------------------------------------
// Maintenance bills lookup
// ---------------------------------------------------------------------------

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
  if (existing && existing.id !== bill.id) {
    await deleteMaintenanceBill(existing.id);
  }
  await saveMaintenanceBill(bill);
  if (expenses.length > 0) {
    await saveVehicleExpenses(expenses);
  }
}

/** 既存請求書を ID 保持で更新（編集保存用） */
export async function updateBillWithExpenses(
  bill: VehicleMaintenanceBill,
  expenses: VehicleExpenseRecord[],
): Promise<void> {
  await deleteVehicleExpensesByBillId(bill.id);
  await saveMaintenanceBill(bill);
  if (expenses.length > 0) {
    await saveVehicleExpenses(expenses);
  }
}

export const idbUpsertBillWithExpenses = upsertBillWithExpenses;

// ---------------------------------------------------------------------------
// Employee details（社員台帳）
// ---------------------------------------------------------------------------

export async function loadEmployeeDetails(): Promise<EmployeeDetail[]> {
  const uid = requireUserId();
  const cacheKey = firestoreCacheKey(uid, "employeeDetails");
  const path = userEmployeeDetailsPath(uid);
  const cached = getFirestoreCache<EmployeeDetail[]>(cacheKey);
  if (cached) {
    seedCollectionBaseline(path, cached, (item) => cleanForFirestore(item));
    return cached;
  }

  const snap = await tracedGetDocs(
    collection(firestore, path),
    `loadEmployeeDetails:${path}`,
  );
  const rows = snap.docs
    .map((d) => d.data() as EmployeeDetail)
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId, "ja"));
  setFirestoreCache(cacheKey, rows);
  seedCollectionBaseline(path, rows, (item) => cleanForFirestore(item));
  return rows;
}

export async function saveEmployeeDetails(
  employees: EmployeeDetail[],
): Promise<void> {
  const uid = requireUserId();
  const path = userEmployeeDetailsPath(uid);
  await syncCollectionDocs(
    firestore,
    path,
    employees,
    (item) => cleanForFirestore(item),
  );
  setFirestoreCache(firestoreCacheKey(uid, "employeeDetails"), employees);
}

export async function upsertEmployeeDetail(
  employee: EmployeeDetail,
): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userEmployeeDetailsPath(uid), employee.id),
    cleanForFirestore(employee),
  );
  recordFirestoreWrite("upsertEmployeeDetail");
  invalidateFirestoreCache(firestoreCacheKey(uid, "employeeDetails"));
}

export async function deleteEmployeeDetail(id: string): Promise<void> {
  const uid = requireUserId();
  await deleteDoc(doc(firestore, userEmployeeDetailsPath(uid), id));
  recordFirestoreWrite("deleteEmployeeDetail");
  invalidateFirestoreCache(firestoreCacheKey(uid, "employeeDetails"));
}

// ---------------------------------------------------------------------------
// Vehicles（車両台帳）
// ---------------------------------------------------------------------------

export async function loadVehicleDetails(): Promise<VehicleDetail[]> {
  const uid = requireUserId();
  const cacheKey = firestoreCacheKey(uid, "vehicleDetails");
  const path = userVehiclesPath(uid);
  const cached = getFirestoreCache<VehicleDetail[]>(cacheKey);
  if (cached) {
    seedCollectionBaseline(path, cached, (item) => cleanForFirestore(item));
    return cached;
  }

  const snap = await tracedGetDocs(
    collection(firestore, path),
    `loadVehicleDetails:${path}`,
  );
  const rows = snap.docs
    .map((d) => d.data() as VehicleDetail)
    .sort((a, b) => a.vehicleId.localeCompare(b.vehicleId, "ja", { numeric: true }));
  setFirestoreCache(cacheKey, rows);
  seedCollectionBaseline(path, rows, (item) => cleanForFirestore(item));
  return rows;
}

export async function saveVehicleDetails(
  vehicles: VehicleDetail[],
): Promise<void> {
  const uid = requireUserId();
  const path = userVehiclesPath(uid);
  await syncCollectionDocs(
    firestore,
    path,
    vehicles,
    (item) => cleanForFirestore(item),
  );
  setFirestoreCache(firestoreCacheKey(uid, "vehicleDetails"), vehicles);
}

export async function upsertVehicleDetail(
  vehicle: VehicleDetail,
): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userVehiclesPath(uid), vehicle.id),
    cleanForFirestore(vehicle),
  );
  recordFirestoreWrite("upsertVehicleDetail");
  invalidateFirestoreCache(firestoreCacheKey(uid, "vehicleDetails"));
}

export async function deleteVehicleDetail(id: string): Promise<void> {
  const uid = requireUserId();
  await deleteDoc(doc(firestore, userVehiclesPath(uid), id));
  recordFirestoreWrite("deleteVehicleDetail");
  invalidateFirestoreCache(firestoreCacheKey(uid, "vehicleDetails"));
}

// ---------------------------------------------------------------------------
// Jobs（業務台帳）
// ---------------------------------------------------------------------------

export async function loadJobDetails(): Promise<JobDetail[]> {
  const uid = requireUserId();
  const cacheKey = firestoreCacheKey(uid, "jobDetails");
  const path = userJobsPath(uid);
  const cached = getFirestoreCache<JobDetail[]>(cacheKey);
  if (cached) {
    seedCollectionBaseline(path, cached, (item) => cleanForFirestore(item));
    return cached;
  }

  const snap = await tracedGetDocs(
    collection(firestore, path),
    `loadJobDetails:${path}`,
  );
  const rows = snap.docs
    .map((d) => d.data() as JobDetail)
    .sort((a, b) => a.jobId.localeCompare(b.jobId, "ja", { numeric: true }));
  setFirestoreCache(cacheKey, rows);
  seedCollectionBaseline(path, rows, (item) => cleanForFirestore(item));
  return rows;
}

export async function saveJobDetails(jobs: JobDetail[]): Promise<void> {
  const uid = requireUserId();
  const path = userJobsPath(uid);
  await syncCollectionDocs(
    firestore,
    path,
    jobs,
    (item) => cleanForFirestore(item),
  );
  setFirestoreCache(firestoreCacheKey(uid, "jobDetails"), jobs);
}

export async function upsertJobDetail(job: JobDetail): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userJobsPath(uid), job.id),
    cleanForFirestore(job),
  );
  recordFirestoreWrite("upsertJobDetail");
  invalidateFirestoreCache(firestoreCacheKey(uid, "jobDetails"));
}

export async function deleteJobDetail(id: string): Promise<void> {
  const uid = requireUserId();
  await deleteDoc(doc(firestore, userJobsPath(uid), id));
  recordFirestoreWrite("deleteJobDetail");
  invalidateFirestoreCache(firestoreCacheKey(uid, "jobDetails"));
}

// ---------------------------------------------------------------------------
// ストレージ情報
// ---------------------------------------------------------------------------

export interface StorageInfo {
  recordCount: number;
  estimatedBytes: number | null;
  estimatedLabel: string;
}

export async function getStorageInfo(
  recordCountOverride?: number,
): Promise<StorageInfo> {
  let recordCount = recordCountOverride ?? 0;
  if (recordCountOverride === undefined) {
    try {
      const uid = requireUserId();
      recordCount =
        getFirestoreCache<DailyRecord[]>(firestoreCacheKey(uid, "records"))
          ?.length ?? 0;
    } catch {
      recordCount = 0;
    }
  }
  return {
    recordCount,
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
  const snap = await tracedGetDoc(
    doc(firestore, userMetaPath(uid)),
    `isIdbMigrationDone:${userMetaPath(uid)}`,
  );
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
  recordFirestoreWrite("markIdbMigrationDone");
}
