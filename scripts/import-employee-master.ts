/**
 * 社員マスタ.xlsx を Firestore employee_details へ一括取り込み
 *
 * 使い方:
 *   npm run import:employees
 *   npm run import:employees -- "C:/path/to/社員マスタ.xlsx"
 *
 * 環境変数（.env.local から自動読み込み）:
 *   NEXT_PUBLIC_FIREBASE_*  — Firebase 設定
 *   IMPORT_FIREBASE_EMAIL   — ログイン用メール（未指定時は社長アカウント）
 *   IMPORT_FIREBASE_PASSWORD — ログイン用パスワード（必須）
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
import { parseEmployeeMasterSheet } from "../src/lib/employee-master-parser";
import { userEmployeeDetailsPath } from "../src/services/firestore-paths";
import { cleanForFirestore } from "../src/services/firestore-utils";
import type { EmployeeDetail } from "../src/lib/types";

const DEFAULT_XLSX =
  "C:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/社員マスタ.xlsx";

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

async function replaceEmployeeDetails(
  uid: string,
  employees: EmployeeDetail[],
): Promise<void> {
  const collectionPath = userEmployeeDetailsPath(uid);
  const db = getFirestore();
  const colRef = collection(db, collectionPath);
  const existingSnap = await getDocs(colRef);

  const BATCH_LIMIT = 450;
  const ops: Array<
    | { type: "delete"; ref: ReturnType<typeof doc> }
    | { type: "set"; ref: ReturnType<typeof doc>; data: EmployeeDetail }
  > = [
    ...existingSnap.docs.map((d) => ({
      type: "delete" as const,
      ref: d.ref,
    })),
    ...employees.map((emp) => ({
      type: "set" as const,
      ref: doc(colRef, emp.id),
      data: cleanForFirestore(emp),
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
  const { employees, warnings } = parseEmployeeMasterSheet(rows);

  if (employees.length === 0) {
    console.error("取り込める社員データがありません。");
    for (const w of warnings) console.error("  ⚠", w);
    process.exit(1);
  }

  const user = await signIn();
  await replaceEmployeeDetails(user.uid, employees);

  const active = employees.filter((e) => e.activeFlag === 1).length;
  console.log(`✓ ${employees.length} 名を users/${user.uid}/employee_details へ保存しました`);
  console.log(`  在籍中: ${active} 名 / 退職・非在籍: ${employees.length - active} 名`);
  if (warnings.length > 0) {
    console.log(`  警告: ${warnings.length} 件`);
    for (const w of warnings) console.log("  ⚠", w);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
