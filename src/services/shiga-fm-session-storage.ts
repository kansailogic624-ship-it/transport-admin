import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import type { ShigaFmSessionDocument } from "@/lib/shiga-fm/session-types";
import { toSessionSummary } from "@/lib/shiga-fm/session-utils";
import type { ShigaFmSessionSummary } from "@/lib/shiga-fm/session-types";
import { userShigaFmSessionsPath } from "./firestore-paths";
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

function sessionListCacheKey(uid: string): string {
  return firestoreCacheKey(uid, "shigaFmSessionSummaries");
}

function sessionDocCacheKey(uid: string, monthPeriod: string): string {
  return firestoreCacheKey(uid, "shigaFmSession", monthPeriod);
}

export async function listShigaFmSessionSummaries(): Promise<
  ShigaFmSessionSummary[]
> {
  const uid = requireUserId();
  const cacheKey = sessionListCacheKey(uid);
  const cached = getFirestoreCache<ShigaFmSessionSummary[]>(cacheKey);
  if (cached) return cached;

  const path = userShigaFmSessionsPath(uid);
  const snap = await tracedGetDocs(
    collection(firestore, path),
    `listShigaFmSessionSummaries:${path}`,
  );
  const rows = snap.docs
    .map((d) => toSessionSummary(d.data() as ShigaFmSessionDocument))
    .sort((a, b) => b.monthPeriod.localeCompare(a.monthPeriod));
  setFirestoreCache(cacheKey, rows);
  return rows;
}

export async function loadShigaFmSession(
  monthPeriod: string,
): Promise<ShigaFmSessionDocument | null> {
  const uid = requireUserId();
  const cacheKey = sessionDocCacheKey(uid, monthPeriod);
  const cached = getFirestoreCache<ShigaFmSessionDocument>(cacheKey);
  if (cached) return cached;

  const path = userShigaFmSessionsPath(uid);
  const ref = doc(firestore, path, monthPeriod);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as ShigaFmSessionDocument;
  setFirestoreCache(cacheKey, data);
  return data;
}

export async function saveShigaFmSession(
  session: ShigaFmSessionDocument,
): Promise<void> {
  const uid = requireUserId();
  const path = userShigaFmSessionsPath(uid);
  await setDoc(
    doc(firestore, path, session.monthPeriod),
    cleanForFirestore(session),
  );
  recordFirestoreWrite("saveShigaFmSession");
  invalidateFirestoreCache(sessionListCacheKey(uid));
  invalidateFirestoreCache(sessionDocCacheKey(uid, session.monthPeriod));
}

export async function deleteShigaFmSession(monthPeriod: string): Promise<void> {
  const uid = requireUserId();
  const path = userShigaFmSessionsPath(uid);
  await deleteDoc(doc(firestore, path, monthPeriod));
  recordFirestoreWrite("deleteShigaFmSession");
  invalidateFirestoreCache(sessionListCacheKey(uid));
  invalidateFirestoreCache(sessionDocCacheKey(uid, monthPeriod));
}

export async function shigaFmSessionExists(
  monthPeriod: string,
): Promise<boolean> {
  const session = await loadShigaFmSession(monthPeriod);
  return session != null;
}
