/**
 * IndexedDB (Dexie) → Firestore への一回限りの自動移行
 */
import { collection, setDoc, doc } from "firebase/firestore";
import { tracedGetDoc, tracedGetDocs } from "./firestore-read-trace";
import { firestore } from "@/lib/firebase";
import { normalizeRecord } from "@/lib/trip-normalize";
import { consolidateDailyRecordsByDriverDay } from "@/lib/record-consolidate";
import {
  DEFAULT_MASTERS,
  type DailyRecord,
  type MasterData,
  type VehicleExpenseRecord,
  type VehicleMaintenanceBill,
} from "@/lib/types";
import { db } from "./db";
import { cleanForFirestore } from "./firestore-utils";
import {
  markIdbMigrationDone,
  saveMasters,
  saveRecords,
  saveMaintenanceBills,
  saveVehicleExpenses,
} from "./firestore-storage";
import {
  userMaintenanceBillsPath,
  userMastersPath,
  userMetaPath,
  userRecordsPath,
  userVehicleExpensesPath,
} from "./firestore-paths";

const LS_MIGRATION_PREFIX = "firestore_idb_migrated_";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function localMigrationFlag(uid: string): string {
  return `${LS_MIGRATION_PREFIX}${uid}`;
}

async function readIndexedDbSnapshot(): Promise<{
  records: DailyRecord[];
  masters: MasterData | null;
  maintenanceBills: VehicleMaintenanceBill[];
  vehicleExpenses: VehicleExpenseRecord[];
}> {
  const recordsRaw = await db.records.toArray();
  const records = consolidateDailyRecordsByDriverDay(
    recordsRaw.map(normalizeRecord),
  );

  const mastersDoc = await db.settings.get("masters");
  const masters = mastersDoc
    ? safeParse<MasterData>(mastersDoc.json, { ...DEFAULT_MASTERS })
    : null;

  const maintenanceBills = await db.maintenanceBills.toArray();
  const vehicleExpenses = await db.vehicleExpenses.toArray();

  return { records, masters, maintenanceBills, vehicleExpenses };
}

export async function migrateIndexedDbToFirestoreOnce(
  uid: string,
): Promise<{ migrated: boolean; message: string }> {
  if (typeof window === "undefined") {
    return { migrated: false, message: "サーバー環境では移行しません" };
  }

  if (localStorage.getItem(localMigrationFlag(uid))) {
    return { migrated: false, message: "ローカルフラグにより移行済み" };
  }

  const metaSnap = await tracedGetDoc(
    doc(firestore, userMetaPath(uid)),
    `migrate:meta:${userMetaPath(uid)}`,
  );
  if (metaSnap.data()?.idbMigrated === true) {
    localStorage.setItem(localMigrationFlag(uid), "1");
    return { migrated: false, message: "Firestore メタにより移行済み" };
  }

  const snapshot = await readIndexedDbSnapshot();
  const hasData =
    snapshot.records.length > 0 ||
    snapshot.masters != null ||
    snapshot.maintenanceBills.length > 0 ||
    snapshot.vehicleExpenses.length > 0;

  if (!hasData) {
    await markIdbMigrationDone();
    localStorage.setItem(localMigrationFlag(uid), "1");
    return { migrated: false, message: "IndexedDB に移行対象データなし" };
  }

  const [recordsSnap, mastersSnap, billsSnap, expensesSnap] = await Promise.all([
    tracedGetDocs(
      collection(firestore, userRecordsPath(uid)),
      `migrate:records:${userRecordsPath(uid)}`,
    ),
    tracedGetDoc(
      doc(firestore, userMastersPath(uid)),
      `migrate:masters:${userMastersPath(uid)}`,
    ),
    tracedGetDocs(
      collection(firestore, userMaintenanceBillsPath(uid)),
      `migrate:bills:${userMaintenanceBillsPath(uid)}`,
    ),
    tracedGetDocs(
      collection(firestore, userVehicleExpensesPath(uid)),
      `migrate:expenses:${userVehicleExpensesPath(uid)}`,
    ),
  ]);

  if (snapshot.records.length > 0 && recordsSnap.size === 0) {
    await saveRecords(snapshot.records);
  }
  if (snapshot.masters && !mastersSnap.exists()) {
    await saveMasters(snapshot.masters);
  }
  if (snapshot.maintenanceBills.length > 0 && billsSnap.size === 0) {
    await saveMaintenanceBills(snapshot.maintenanceBills);
  }
  if (snapshot.vehicleExpenses.length > 0 && expensesSnap.size === 0) {
    await saveVehicleExpenses(snapshot.vehicleExpenses);
  }

  await markIdbMigrationDone();
  await setDoc(
    doc(firestore, userMetaPath(uid)),
    cleanForFirestore({
      idbMigrated: true,
      migratedAt: new Date().toISOString(),
      migratedRecords: snapshot.records.length,
      migratedBills: snapshot.maintenanceBills.length,
      migratedExpenses: snapshot.vehicleExpenses.length,
    }),
    { merge: true },
  );
  localStorage.setItem(localMigrationFlag(uid), "1");

  console.info(
    `[Firestore] IndexedDB から移行完了: records=${snapshot.records.length}, bills=${snapshot.maintenanceBills.length}, expenses=${snapshot.vehicleExpenses.length}`,
  );

  return {
    migrated: true,
    message: `IndexedDB から ${snapshot.records.length} 件のレコードを移行しました`,
  };
}
