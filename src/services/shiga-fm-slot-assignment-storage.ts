import {
  collection,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import type { ShigaFmSlotAssignment } from "@/lib/import-preprocessor/shiga-fm-reconciliation/slot-assignment-types";
import { auth, firestore } from "@/lib/firebase";
import { userShigaFmSlotAssignmentsPath } from "./firestore-paths";
import {
  firestoreCacheKey,
  getFirestoreCache,
  invalidateFirestoreCache,
  setFirestoreCache,
} from "./firestore-cache";
import { recordFirestoreWrite, tracedGetDocs } from "./firestore-read-trace";
import { cleanForFirestore } from "./firestore-utils";

function requireUserId(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("ログインが必要です");
  return uid;
}

function assignmentCachePrefix(uid: string): string {
  return firestoreCacheKey(uid, "shigaFmSlotAssignments");
}

export async function loadShigaFmSlotAssignments(
  monthPeriod?: string | null,
): Promise<ShigaFmSlotAssignment[]> {
  const uid = requireUserId();
  const cacheKey = firestoreCacheKey(
    uid,
    "shigaFmSlotAssignments",
    monthPeriod ?? "all",
  );
  const path = userShigaFmSlotAssignmentsPath(uid);
  const cached = getFirestoreCache<ShigaFmSlotAssignment[]>(cacheKey);
  if (cached) return cached;

  const snap = await tracedGetDocs(
    collection(firestore, path),
    `loadShigaFmSlotAssignments:${path}`,
  );
  let rows = snap.docs.map((d) => d.data() as ShigaFmSlotAssignment);
  if (monthPeriod) {
    rows = rows.filter((r) => r.monthPeriod === monthPeriod);
  }
  rows.sort((a, b) => {
    const d = a.businessDate.localeCompare(b.businessDate);
    if (d !== 0) return d;
    const c = a.courseId.localeCompare(b.courseId);
    if (c !== 0) return c;
    return a.slotIndex - b.slotIndex;
  });
  setFirestoreCache(cacheKey, rows);
  return rows;
}

export async function upsertShigaFmSlotAssignment(
  assignment: ShigaFmSlotAssignment,
): Promise<void> {
  const uid = requireUserId();
  const path = userShigaFmSlotAssignmentsPath(uid);
  await setDoc(
    doc(firestore, path, assignment.id),
    cleanForFirestore(assignment),
  );
  recordFirestoreWrite("upsertShigaFmSlotAssignment");
  invalidateFirestoreCache(assignmentCachePrefix(uid));
}

export async function deleteShigaFmSlotAssignment(id: string): Promise<void> {
  const uid = requireUserId();
  const path = userShigaFmSlotAssignmentsPath(uid);
  await deleteDoc(doc(firestore, path, id));
  recordFirestoreWrite("deleteShigaFmSlotAssignment");
  invalidateFirestoreCache(assignmentCachePrefix(uid));
}
