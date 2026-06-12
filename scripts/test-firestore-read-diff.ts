/**
 * Firestore 差分保存まわりの静的検証（Firebase 接続不要）
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  clearCollectionBaselines,
  seedCollectionBaseline,
} from "../src/services/firestore-utils";
import {
  getFirestoreReadStats,
  resetFirestoreReadStats,
} from "../src/services/firestore-read-trace";

function assertNoReads(label: string): void {
  const stats = getFirestoreReadStats();
  if (Object.keys(stats).length > 0) {
    throw new Error(`${label}: Firestore Read が発生しました: ${JSON.stringify(stats)}`);
  }
}

function assertSourceExcludesGetDocs(relativePath: string, fnName: string): void {
  const src = readFileSync(join(process.cwd(), relativePath), "utf8");
  const fnStart = src.indexOf(`export async function ${fnName}`);
  if (fnStart < 0) {
    throw new Error(`${fnName} not found in ${relativePath}`);
  }
  const nextFn = src.indexOf("export async function", fnStart + 1);
  const body = src.slice(fnStart, nextFn > 0 ? nextFn : undefined);
  if (/tracedGetDocs|getDocs\(/.test(body)) {
    throw new Error(`${fnName} must not call getDocs: ${relativePath}`);
  }
}

resetFirestoreReadStats();
clearCollectionBaselines();

seedCollectionBaseline("users/test/employees", [{ id: "e1", name: "A" }]);
assertNoReads("seedCollectionBaseline");

assertSourceExcludesGetDocs(
  "src/services/firestore-storage.ts",
  "saveRecords",
);
assertSourceExcludesGetDocs(
  "src/services/firestore-utils.ts",
  "syncCollectionDocs",
);

const backupSrc = readFileSync(
  join(process.cwd(), "src/components/backup-controls.tsx"),
  "utf8",
);
if (/getAllRecords|loadRecords|getStorageInfo|getDocs/.test(backupSrc)) {
  throw new Error("backup-controls must not call Firestore loaders");
}

console.log("OK firestore read guards");
