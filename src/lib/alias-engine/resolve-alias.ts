import { isSameVehicle } from "@/lib/import-match-keys";
import { normalizeAliasKey } from "./normalize-alias-key";
import type {
  AliasCandidate,
  AliasMasterRecord,
  AliasMasterStore,
  AliasResolveContext,
  AliasResolveResult,
  AliasType,
} from "./types";

const RESOLVED_THRESHOLD = 80;
const AMBIGUOUS_MIN_GAP = 15;

function contextMatches(
  record: AliasMasterRecord,
  context: AliasResolveContext,
): boolean {
  const c = record.context;
  if (c.shipperCanonicalName && context.shipperCanonicalName) {
    if (c.shipperCanonicalName !== context.shipperCanonicalName) return false;
  }
  if (c.regionCode && context.regionCode && c.regionCode !== context.regionCode) {
    return false;
  }
  if (
    c.courseBlockIndex != null &&
    context.courseBlockIndex != null &&
    c.courseBlockIndex !== context.courseBlockIndex
  ) {
    return false;
  }
  return true;
}

function sourceSystemMatches(
  record: AliasMasterRecord,
  sourceSystem: string,
): boolean {
  if (!record.sourceSystems.length) return true;
  return record.sourceSystems.includes(sourceSystem);
}

function scoreRecord(
  record: AliasMasterRecord,
  aliasKey: string,
  context: AliasResolveContext,
): number {
  let score = record.priority;
  if (record.aliasKey === aliasKey) score += 50;
  if (record.confirmedByUser) score += 30;
  if (context.shipperCanonicalName && record.context.shipperCanonicalName === context.shipperCanonicalName) {
    score += 20;
  }
  if (context.regionCode && record.context.regionCode === context.regionCode) {
    score += 10;
  }
  score += Math.min(record.hitCount, 10);
  return score;
}

function findCandidates(
  store: AliasMasterStore,
  aliasType: AliasType,
  raw: string,
  context: AliasResolveContext,
): AliasCandidate[] {
  const aliasKey = normalizeAliasKey(aliasType, raw);
  if (!aliasKey) return [];

  const exact = store.byTypeAndKey.get(`${aliasType}:${aliasKey}`) ?? [];
  const scored: AliasCandidate[] = [];

  for (const record of store.records) {
    if (record.aliasType !== aliasType || !record.isActive) continue;
    if (!sourceSystemMatches(record, context.sourceSystem)) continue;
    if (!contextMatches(record, context)) continue;

    let matches = record.aliasKey === aliasKey;
    if (!matches && aliasType === "vehicle") {
      matches = isSameVehicle(record.aliasOriginal, raw);
    }
    if (!matches) continue;

    scored.push({
      aliasId: record.id,
      canonicalName: record.canonicalName,
      score: scoreRecord(record, aliasKey, context),
      reason: record.aliasOriginal,
    });
  }

  for (const record of exact) {
    if (!sourceSystemMatches(record, context.sourceSystem)) continue;
    if (!contextMatches(record, context)) continue;
    if (scored.some((s) => s.aliasId === record.id)) continue;
    scored.push({
      aliasId: record.id,
      canonicalName: record.canonicalName,
      score: scoreRecord(record, aliasKey, context),
      reason: record.aliasOriginal,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function resolveAlias(
  store: AliasMasterStore,
  input: {
    aliasType: AliasType;
    raw: string;
    context: AliasResolveContext;
  },
): AliasResolveResult {
  const raw = (input.raw ?? "").trim();
  const aliasKey = normalizeAliasKey(input.aliasType, raw);

  if (!raw) {
    return {
      status: "unresolved",
      canonicalId: null,
      canonicalName: null,
      matchedAliasId: null,
      candidates: [],
      aliasKey,
    };
  }

  const candidates = findCandidates(
    store,
    input.aliasType,
    raw,
    input.context,
  );

  if (candidates.length === 0) {
    return {
      status: "unresolved",
      canonicalId: null,
      canonicalName: null,
      matchedAliasId: null,
      candidates: [],
      aliasKey,
    };
  }

  const top = candidates[0]!;
  const second = candidates[1];
  const gap = second ? top.score - second.score : RESOLVED_THRESHOLD;
  const sameCanonicalTie =
    second != null && second.canonicalName === top.canonicalName;

  if (
    top.score >= RESOLVED_THRESHOLD &&
    (gap >= AMBIGUOUS_MIN_GAP || sameCanonicalTie)
  ) {
    const matched = store.records.find((r) => r.id === top.aliasId);
    return {
      status: "resolved",
      canonicalId: matched?.canonicalId ?? top.canonicalName,
      canonicalName: top.canonicalName,
      matchedAliasId: top.aliasId,
      candidates,
      aliasKey,
    };
  }

  if (candidates.length >= 1 && top.score >= 50) {
    return {
      status: "ambiguous",
      canonicalId: null,
      canonicalName: null,
      matchedAliasId: null,
      candidates,
      aliasKey,
    };
  }

  return {
    status: "unresolved",
    canonicalId: null,
    canonicalName: null,
    matchedAliasId: null,
    candidates,
    aliasKey,
  };
}
