/**
 * Firestore 読み取りのインメモリキャッシュ（同一セッション内の重複 getDocs 防止）
 */

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

/** キャッシュ有効期限（ミリ秒） */
export const FIRESTORE_CACHE_TTL_MS = 5 * 60 * 1000;

export function firestoreCacheKey(uid: string, ...parts: string[]): string {
  return `${uid}:${parts.join(":")}`;
}

export function getFirestoreCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > FIRESTORE_CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setFirestoreCache<T>(key: string, data: T): void {
  store.set(key, { data, fetchedAt: Date.now() });
}

/** 書き込み後に関連キャッシュを無効化 */
export function invalidateFirestoreCache(keyOrPrefix: string): void {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) {
      store.delete(key);
    }
  }
}

export function clearFirestoreCache(): void {
  store.clear();
}
