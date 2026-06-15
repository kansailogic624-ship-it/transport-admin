import {
  collection,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { extractBillingContractsFromLegacy } from "@/lib/shiga-fm/contract-migrate";
import type { LegacyPartnerContractRate } from "@/lib/shiga-fm/partner-contract-types";
import type { ShipperBillingContract } from "@/lib/shiga-fm/shipper-billing-types";
import type { MasterData } from "@/lib/types";
import {
  userPartnerContractRatesPath,
  userShipperBillingContractsPath,
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

function sortBillingContracts(
  rows: ShipperBillingContract[],
): ShipperBillingContract[] {
  return rows.sort((a, b) => {
    const name = a.shipperName.localeCompare(b.shipperName, "ja");
    if (name !== 0) return name;
    return b.effectiveFrom.localeCompare(a.effectiveFrom);
  });
}

export async function loadShipperBillingContracts(
  masters?: MasterData,
): Promise<ShipperBillingContract[]> {
  const uid = requireUserId();
  const cacheKey = firestoreCacheKey(uid, "shipperBillingContracts");
  const path = userShipperBillingContractsPath(uid);
  const cached = getFirestoreCache<ShipperBillingContract[]>(cacheKey);
  if (cached) {
    seedCollectionBaseline(path, cached, (item) => cleanForFirestore(item));
    return cached;
  }

  const snap = await tracedGetDocs(
    collection(firestore, path),
    `loadShipperBillingContracts:${path}`,
  );
  let rows = snap.docs.map((d) => d.data() as ShipperBillingContract);

  if (rows.length === 0 && masters) {
    const legacyPath = userPartnerContractRatesPath(uid);
    const legacySnap = await tracedGetDocs(
      collection(firestore, legacyPath),
      `loadShipperBillingContractsLegacy:${legacyPath}`,
    );
    if (legacySnap.docs.length > 0) {
      const legacy = legacySnap.docs.map(
        (d) => d.data() as LegacyPartnerContractRate,
      );
      rows = extractBillingContractsFromLegacy(legacy, masters);
    }
  }

  rows = sortBillingContracts(rows);
  setFirestoreCache(cacheKey, rows);
  seedCollectionBaseline(path, rows, (item) => cleanForFirestore(item));
  return rows;
}

export async function saveShipperBillingContracts(
  contracts: ShipperBillingContract[],
): Promise<void> {
  const uid = requireUserId();
  const path = userShipperBillingContractsPath(uid);
  await syncCollectionDocs(
    firestore,
    path,
    contracts,
    (item) => cleanForFirestore(item),
  );
  setFirestoreCache(firestoreCacheKey(uid, "shipperBillingContracts"), contracts);
}

export async function upsertShipperBillingContract(
  contract: ShipperBillingContract,
): Promise<void> {
  const uid = requireUserId();
  await setDoc(
    doc(firestore, userShipperBillingContractsPath(uid), contract.id),
    cleanForFirestore(contract),
  );
  recordFirestoreWrite("upsertShipperBillingContract");
  invalidateFirestoreCache(firestoreCacheKey(uid, "shipperBillingContracts"));
}

export async function deleteShipperBillingContract(id: string): Promise<void> {
  const uid = requireUserId();
  await deleteDoc(doc(firestore, userShipperBillingContractsPath(uid), id));
  recordFirestoreWrite("deleteShipperBillingContract");
  invalidateFirestoreCache(firestoreCacheKey(uid, "shipperBillingContracts"));
}

export function createShipperBillingContractId(): string {
  return crypto.randomUUID();
}
