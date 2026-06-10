import {
  collection,
  doc,
  getDocs,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

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

export async function replaceCollectionDocs<T extends { id: string }>(
  db: Firestore,
  collectionPath: string,
  items: T[],
  toDocData: (item: T) => DocumentData = (item) =>
    cleanForFirestore(item) as DocumentData,
): Promise<void> {
  const colRef = collection(db, collectionPath);
  const existingSnap = await getDocs(colRef);

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

  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    for (const op of chunk) {
      if (op.type === "delete") {
        batch.delete(op.ref);
      } else {
        batch.set(op.ref, op.data);
      }
    }
    await batch.commit();
  }
}
