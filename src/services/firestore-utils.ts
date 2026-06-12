import {
  collection,
  doc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { recordFirestoreWrite, tracedGetDocs } from "./firestore-read-trace";

const BATCH_LIMIT = 450;

/**
 * Firestore は undefined を保存できない。
 * ネストしたオブジェクト・配列を含め、undefined を再帰的に null へ変換する。
 */
export function cleanForFirestore<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) =>
      v === undefined ? null : v,
    ),
  ) as T;
}

/** @deprecated cleanForFirestore を使用 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return cleanForFirestore(obj);
}

/** マスタ台帳コレクションの差分保存用ベースライン（getDocs 不要） */
const collectionBaselines = new Map<string, Map<string, string>>();

export function seedCollectionBaseline<T extends { id: string }>(
  collectionPath: string,
  items: T[],
  toDocData: (item: T) => DocumentData = (item) =>
    cleanForFirestore(item) as DocumentData,
): void {
  collectionBaselines.set(
    collectionPath,
    new Map(items.map((item) => [item.id, JSON.stringify(toDocData(item))])),
  );
}

export function clearCollectionBaselines(): void {
  collectionBaselines.clear();
}

async function commitCollectionBatchOps(
  db: Firestore,
  ops: Array<
    | { type: "delete"; ref: ReturnType<typeof doc> }
    | { type: "set"; ref: ReturnType<typeof doc>; data: DocumentData }
  >,
  label: string,
): Promise<void> {
  if (ops.length === 0) return;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
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

/**
 * 差分のみ upsert / delete（getDocs なし）。
 * 日次レコード保存経路とは別系統のマスタ台帳用。
 */
export async function syncCollectionDocs<T extends { id: string }>(
  db: Firestore,
  collectionPath: string,
  items: T[],
  toDocData: (item: T) => DocumentData = (item) =>
    cleanForFirestore(item) as DocumentData,
): Promise<{ upserted: number; deleted: number }> {
  const colRef = collection(db, collectionPath);
  if (!collectionBaselines.has(collectionPath)) {
    collectionBaselines.set(collectionPath, new Map());
  }
  const baseline = collectionBaselines.get(collectionPath)!;

  const nextIds = new Set(items.map((item) => item.id));
  const toUpsert: T[] = [];
  const toDelete: string[] = [];

  for (const item of items) {
    const hash = JSON.stringify(toDocData(item));
    if (baseline.get(item.id) !== hash) {
      toUpsert.push(item);
      baseline.set(item.id, hash);
    }
  }

  for (const id of baseline.keys()) {
    if (!nextIds.has(id)) {
      toDelete.push(id);
      baseline.delete(id);
    }
  }

  if (toUpsert.length === 0 && toDelete.length === 0) {
    return { upserted: 0, deleted: 0 };
  }

  const ops: Array<
    | { type: "delete"; ref: ReturnType<typeof doc> }
    | { type: "set"; ref: ReturnType<typeof doc>; data: DocumentData }
  > = [
    ...toDelete.map((id) => ({
      type: "delete" as const,
      ref: doc(colRef, id),
    })),
    ...toUpsert.map((item) => ({
      type: "set" as const,
      ref: doc(colRef, item.id),
      data: toDocData(item),
    })),
  ];

  await commitCollectionBatchOps(db, ops, `syncCollectionDocs:${collectionPath}`);
  return { upserted: toUpsert.length, deleted: toDelete.length };
}

/**
 * 全件 getDocs → 全削除 → 全書き込み（移行・スクリプト専用。UI 保存経路では使わない）
 * @deprecated syncCollectionDocs を使用
 */
export async function replaceCollectionDocs<T extends { id: string }>(
  db: Firestore,
  collectionPath: string,
  items: T[],
  toDocData: (item: T) => DocumentData = (item) =>
    cleanForFirestore(item) as DocumentData,
): Promise<void> {
  const colRef = collection(db, collectionPath);
  const existingSnap = await tracedGetDocs(
    colRef,
    `replaceCollectionDocs:${collectionPath}`,
  );

  const deletes = existingSnap.docs.map((d) => d.ref);
  const writes = items.map((item) => ({
    ref: doc(colRef, item.id),
    data: toDocData(item),
  }));

  const ops: Array<
    | { type: "delete"; ref: ReturnType<typeof doc> }
    | { type: "set"; ref: ReturnType<typeof doc>; data: DocumentData }
  > = [
    ...deletes.map((ref) => ({ type: "delete" as const, ref })),
    ...writes.map((w) => ({ type: "set" as const, ref: w.ref, data: w.data })),
  ];

  await commitCollectionBatchOps(db, ops, `replaceCollectionDocs:${collectionPath}`);
  seedCollectionBaseline(collectionPath, items, toDocData);
}
