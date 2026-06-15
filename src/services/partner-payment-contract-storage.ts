import {
  collection,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import {
  legacyToPaymentContract,
  linkPaymentContractsToPartnerProfiles,
} from "@/lib/shiga-fm/contract-migrate";
import type { LegacyPartnerContractRate } from "@/lib/shiga-fm/partner-contract-types";
import type { PartnerPaymentContract } from "@/lib/shiga-fm/partner-payment-types";
import {
  userPartnerContractRatesPath,
  userPartnerPaymentContractsPath,
} from "./firestore-paths";
import {
  firestoreCacheKey,
  getFirestoreCache,
  invalidateFirestoreCache,
  setFirestoreCache,
} from "./firestore-cache";
import { recordFirestoreWrite, tracedGetDocs } from "./firestore-read-trace";
import {
  cleanForFirestore,
  seedCollectionBaseline,
  syncCollectionDocs,
} from "./firestore-utils";

function requireUserId(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("ログインが必要です");
  return uid;
}

function sortPaymentContracts(
  rows: PartnerPaymentContract[],
): PartnerPaymentContract[] {
  return rows.sort((a, b) => {
    const name = a.partnerName.localeCompare(b.partnerName, "ja");
    if (name !== 0) return name;
    const course = a.courseId.localeCompare(b.courseId);
    if (course !== 0) return course;
    return b.effectiveFrom.localeCompare(a.effectiveFrom);
  });
}

async function loadLegacyPartnerContracts(
  uid: string,
): Promise<PartnerPaymentContract[]> {
  const path = userPartnerContractRatesPath(uid);
  const snap = await tracedGetDocs(
    collection(firestore, path),
    `loadLegacyPartnerContracts:${path}`,
  );
  return snap.docs.map((d) =>
    legacyToPaymentContract(d.data() as LegacyPartnerContractRate),
  );
}

export async function loadPartnerPaymentContracts(): Promise<
  PartnerPaymentContract[]
> {
  const uid = requireUserId();
  const cacheKey = firestoreCacheKey(uid, "partnerPaymentContracts");
  const path = userPartnerPaymentContractsPath(uid);
  const cached = getFirestoreCache<PartnerPaymentContract[]>(cacheKey);
  if (cached) {
    seedCollectionBaseline(path, cached, (item) => cleanForFirestore(item));
    return cached;
  }

  const snap = await tracedGetDocs(
    collection(firestore, path),
    `loadPartnerPaymentContracts:${path}`,
  );
  let rows = snap.docs.map((d) => d.data() as PartnerPaymentContract);

  if (rows.length === 0) {
    rows = await loadLegacyPartnerContracts(uid);
  }

  rows = sortPaymentContracts(rows);
  setFirestoreCache(cacheKey, rows);
  seedCollectionBaseline(path, rows, (item) => cleanForFirestore(item));
  return rows;
}

export async function savePartnerPaymentContracts(
  contracts: PartnerPaymentContract[],
): Promise<void> {
  const uid = requireUserId();
  const path = userPartnerPaymentContractsPath(uid);
  await syncCollectionDocs(
    firestore,
    path,
    contracts,
    (item) => cleanForFirestore(item),
  );
  setFirestoreCache(firestoreCacheKey(uid, "partnerPaymentContracts"), contracts);
}

export async function upsertPartnerPaymentContract(
  contract: PartnerPaymentContract,
): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userPartnerPaymentContractsPath(uid), contract.id),
    cleanForFirestore(contract),
  );
  recordFirestoreWrite("upsertPartnerPaymentContract");
  invalidateFirestoreCache(firestoreCacheKey(uid, "partnerPaymentContracts"));
}

export async function deletePartnerPaymentContract(id: string): Promise<void> {
  const uid = requireUserId();
  await deleteDoc(doc(firestore, userPartnerPaymentContractsPath(uid), id));
  recordFirestoreWrite("deletePartnerPaymentContract");
  invalidateFirestoreCache(firestoreCacheKey(uid, "partnerPaymentContracts"));
}

export function createPartnerPaymentContractId(): string {
  return crypto.randomUUID();
}

export async function loadPartnerPaymentContractsLinked(
  masters: Parameters<typeof linkPaymentContractsToPartnerProfiles>[1],
): Promise<PartnerPaymentContract[]> {
  const rows = await loadPartnerPaymentContracts();
  return linkPaymentContractsToPartnerProfiles(rows, masters);
}
