import {
  getDoc,
  getDocs,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from "firebase/firestore";

/** ラベル別の getDocs / getDoc 呼び出し回数 */
const readStats = new Map<string, number>();
/** ラベル別の書き込み回数 */
const writeStats = new Map<string, number>();

function recordFirestoreRead(label: string): void {
  console.count("Firestore Read");
  readStats.set(label, (readStats.get(label) ?? 0) + 1);
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[Firestore Read] ${label}`);
  }
}

/** Firestore 書き込み（setDoc / updateDoc / deleteDoc / batch.commit）の計測 */
export function recordFirestoreWrite(label: string, count = 1): void {
  if (count <= 0) return;
  for (let i = 0; i < count; i++) {
    console.count("Firestore Write");
  }
  writeStats.set(label, (writeStats.get(label) ?? 0) + count);
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[Firestore Write] ${label} ×${count}`);
  }
}

/** 開発時の Firestore 読み取り回数計測（コレクション / クエリ） */
export async function tracedGetDocs(
  ref: CollectionReference<DocumentData> | Query<DocumentData>,
  label: string,
): Promise<QuerySnapshot<DocumentData>> {
  recordFirestoreRead(label);
  return getDocs(ref);
}

/** 開発時の Firestore 読み取り回数計測（単一ドキュメント） */
export async function tracedGetDoc<T = DocumentData>(
  ref: DocumentReference<T>,
  label: string,
): Promise<DocumentSnapshot<T>> {
  recordFirestoreRead(label);
  return getDoc(ref);
}

/** ラベル別の読み取り回数サマリー */
export function getFirestoreReadStats(): Record<string, number> {
  return Object.fromEntries(
    [...readStats.entries()].sort((a, b) => b[1] - a[1]),
  );
}

export function getFirestoreWriteStats(): Record<string, number> {
  return Object.fromEntries(
    [...writeStats.entries()].sort((a, b) => b[1] - a[1]),
  );
}

/** コンソールに読み取り回数レポートを出力 */
export function printFirestoreReadReport(): void {
  const stats = getFirestoreReadStats();
  const total = Object.values(stats).reduce((sum, n) => sum + n, 0);
  console.group("[Firestore Read Report]");
  if (Object.keys(stats).length === 0) {
    console.log("読み取りはまだ記録されていません。");
  } else {
    console.table(stats);
    console.log(`合計 API 呼び出し: ${total} 回`);
    console.log(
      "※ 1 回の getDocs はドキュメント件数分の課金読み取りになる場合があります。",
    );
  }
  console.groupEnd();
}

/** コンソールに書き込み回数レポートを出力 */
export function printFirestoreWriteReport(): void {
  const stats = getFirestoreWriteStats();
  const total = Object.values(stats).reduce((sum, n) => sum + n, 0);
  console.group("[Firestore Write Report]");
  if (Object.keys(stats).length === 0) {
    console.log("書き込みはまだ記録されていません。");
  } else {
    console.table(stats);
    console.log(`合計書き込み操作: ${total} 件`);
  }
  console.groupEnd();
}

/** 読み取り・書き込みをまとめて表示 */
export function printFirestoreIoReport(): void {
  printFirestoreReadReport();
  printFirestoreWriteReport();
}

export function resetFirestoreReadStats(): void {
  readStats.clear();
}

export function resetFirestoreWriteStats(): void {
  writeStats.clear();
}

export function resetFirestoreIoStats(): void {
  resetFirestoreReadStats();
  resetFirestoreWriteStats();
}
