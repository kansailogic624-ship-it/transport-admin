import type { MappingRule, MasterData } from "./types";
import type { ParsedFileMakerDispatch } from "./filemaker-dispatch-parser";
import { normalizeDriverName } from "./driving-report-parser";
import { normalizeDispatchName } from "./filemaker-dispatch-parser";

export function normalizeKeyword(raw: string): string {
  return raw
    .replace(/\s/g, "")
    .replace(/\u3000/g, "")
    .toLowerCase();
}

export function findBestMappingRule(
  rules: MappingRule[],
  reportLabel: string,
  shipperName: string,
): MappingRule | null {
  const labelNorm = normalizeKeyword(reportLabel);
  if (!labelNorm) return null;

  const shipperNorm = normalizeKeyword(shipperName);

  let best: MappingRule | null = null;
  let bestScore = 0;

  for (const rule of rules) {
    const kw = normalizeKeyword(rule.reportKeyword);
    if (!kw) continue;
    if (!labelNorm.includes(kw) && !kw.includes(labelNorm)) continue;

    let score = kw.length;
    if (rule.shipperName && shipperNorm) {
      const ruleShipper = normalizeKeyword(rule.shipperName);
      if (ruleShipper === shipperNorm || labelNorm.includes(ruleShipper)) {
        score += 20;
      } else {
        continue;
      }
    }
    score += rule.hitCount * 0.1;

    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }

  return best;
}

export function findDispatchByName(
  dispatches: ParsedFileMakerDispatch[],
  dispatchName: string,
): ParsedFileMakerDispatch | undefined {
  const target = normalizeDispatchName(dispatchName);
  return dispatches.find((d) => normalizeDispatchName(d.dispatchName) === target);
}

export function bumpRuleHitCount(
  masters: MasterData,
  ruleId: string,
): MasterData {
  return {
    ...masters,
    mappingRules: masters.mappingRules.map((r) =>
      r.id === ruleId ? { ...r, hitCount: r.hitCount + 1 } : r,
    ),
  };
}

export function upsertMappingRule(
  masters: MasterData,
  input: {
    reportKeyword: string;
    shipperName: string;
    dispatchName: string;
    vehicleNumber?: string;
  },
): MasterData {
  const keyword = input.reportKeyword.trim();
  const dispatchName = normalizeDispatchName(input.dispatchName);
  if (!keyword || !dispatchName) return masters;

  const shipperName = input.shipperName.trim();
  const existing = masters.mappingRules.find(
    (r) =>
      normalizeKeyword(r.reportKeyword) === normalizeKeyword(keyword) &&
      normalizeKeyword(r.shipperName) === normalizeKeyword(shipperName) &&
      normalizeDispatchName(r.dispatchName) === dispatchName,
  );

  if (existing) {
    return {
      ...masters,
      mappingRules: masters.mappingRules.map((r) =>
        r.id === existing.id
          ? {
              ...r,
              hitCount: r.hitCount + 1,
              updatedAt: new Date().toISOString(),
            }
          : r,
      ),
    };
  }

  const rule: MappingRule = {
    id: crypto.randomUUID(),
    reportKeyword: keyword,
    shipperName,
    dispatchName,
    vehicleNumber: input.vehicleNumber?.trim() || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hitCount: 1,
  };

  return {
    ...masters,
    mappingRules: [rule, ...masters.mappingRules],
  };
}

export function dispatchesForDriverDay(
  dispatches: ParsedFileMakerDispatch[],
  date: string,
  driverName: string,
): ParsedFileMakerDispatch[] {
  const driver = normalizeDriverName(driverName);
  return dispatches.filter(
    (d) => d.date === date && normalizeDriverName(d.driverName) === driver,
  );
}
