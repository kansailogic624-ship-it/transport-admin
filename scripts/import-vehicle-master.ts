/**
 * 車両マスタ.xlsx を Firestore vehicles へ一括取り込み
 *
 * 使い方:
 *   npm run import:vehicles
 *   npm run import:vehicles -- "C:/path/to/車両マスタ.xlsx"
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { PRESIDENT_EMAIL } from "../src/lib/auth-access";
import { parseVehicleMasterSheet } from "../src/lib/vehicle-master-parser";
import { userVehiclesPath } from "../src/services/firestore-paths";
import { cleanForFirestore } from "../src/services/firestore-utils";
import type { VehicleDetail } from "../src/lib/types";

const DEFAULT_XLSX =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/車両マスタ.xlsx";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function loadRows(filePath: string): unknown[][] {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

async function replaceVehicleDetails(
  uid: string,
  vehicles: VehicleDetail[],
): Promise<void> {
  const collectionPath = userVehiclesPath(uid);
  const db = getFirestore();
  const colRef = collection(db, collectionPath);
  const existingSnap = await getDocs(colRef);

  const BATCH_LIMIT = 450;
  const ops: Array<
    | { type: "delete"; ref: ReturnType<typeof doc> }
    | { type: "set"; ref: ReturnType<typeof doc>; data: VehicleDetail }
  > = [
    ...existingSnap.docs.map((d) => ({
      type: "delete" as const,
      ref: d.ref,
    })),
    ...vehicles.map((vehicle) => ({
      type: "set" as const,
      ref: doc(colRef, vehicle.id),
      data: cleanForFirestore(vehicle),
    })),
  ];

  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) {
      if (op.type === "delete") batch.delete(op.ref);
      else batch.set(op.ref, op.data);
    }
    await batch.commit();
  }
}

async function signIn(): Promise<User> {
  const email =
    process.env.IMPORT_FIREBASE_EMAIL?.trim() || PRESIDENT_EMAIL;
  const password = process.env.IMPORT_FIREBASE_PASSWORD?.trim();
  if (!password) {
    throw new Error(
      "IMPORT_FIREBASE_PASSWORD を .env.local または環境変数に設定してください。",
    );
  }

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };

  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error("NEXT_PUBLIC_FIREBASE_* が .env.local に設定されていません。");
  }

  if (getApps().length === 0) {
    initializeApp(firebaseConfig);
  }

  const auth = getAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const xlsxPath = process.argv[2] ?? DEFAULT_XLSX;
  if (!fs.existsSync(xlsxPath)) {
    console.error("ファイルが見つかりません:", xlsxPath);
    process.exit(1);
  }

  const rows = loadRows(xlsxPath);
  const { vehicles, warnings } = parseVehicleMasterSheet(rows);

  if (vehicles.length === 0) {
    console.error("取り込める車両データがありません。");
    for (const w of warnings) console.error("  ⚠", w);
    process.exit(1);
  }

  const user = await signIn();
  await replaceVehicleDetails(user.uid, vehicles);

  const active = vehicles.filter((v) => !v.scrappedDate).length;
  console.log(`✓ ${vehicles.length} 台を users/${user.uid}/vehicles へ保存しました`);
  console.log(`  稼働中: ${active} 台 / 廃車済: ${vehicles.length - active} 台`);
  if (warnings.length > 0) {
    console.log(`  警告: ${warnings.length} 件`);
    for (const w of warnings) console.log("  ⚠", w);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
