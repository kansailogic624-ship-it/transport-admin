import { storageService } from "@/services/storageService";
import type { MappingRule, MasterData } from "./types";

/** @deprecated types.CUSTOM_MAPPING_RULES_KEY を参照 */
export const CUSTOM_MAPPING_RULES_KEY = "custom_mapping_rules";

export function loadCustomMappingRules(): MappingRule[] {
  return storageService.loadMappings();
}

export function saveCustomMappingRules(rules: MappingRule[]): void {
  storageService.saveMappings(rules);
}

export function upsertCustomMappingRule(
  input: {
    reportKeyword: string;
    shipperName: string;
    dispatchName: string;
    vehicleNumber?: string;
    driverName?: string;
    date?: string;
  },
  existing?: MappingRule[],
): MappingRule[] {
  const rules = existing ?? loadCustomMappingRules();
  const keyword = input.reportKeyword.trim();
  if (!keyword || !input.dispatchName.trim()) return rules;

  const now = new Date().toISOString();
  const idx = rules.findIndex(
    (r) =>
      r.reportKeyword === keyword &&
      r.dispatchName === input.dispatchName.trim(),
  );

  if (idx >= 0) {
    const updated = [...rules];
    updated[idx] = {
      ...updated[idx]!,
      shipperName: input.shipperName.trim() || updated[idx]!.shipperName,
      vehicleNumber: input.vehicleNumber?.trim() || updated[idx]!.vehicleNumber,
      updatedAt: now,
      hitCount: updated[idx]!.hitCount + 1,
    };
    saveCustomMappingRules(updated);
    return updated;
  }

  const next: MappingRule = {
    id: crypto.randomUUID(),
    reportKeyword: keyword,
    shipperName: input.shipperName.trim(),
    dispatchName: input.dispatchName.trim(),
    vehicleNumber: input.vehicleNumber?.trim(),
    createdAt: now,
    updatedAt: now,
    hitCount: 1,
  };

  const merged = [next, ...rules];
  saveCustomMappingRules(merged);
  return merged;
}

export function allMappingRulesForFusion(masters: MasterData): MappingRule[] {
  const custom = loadCustomMappingRules();
  const builtin = masters.mappingRules ?? [];
  const seen = new Set<string>();
  const out: MappingRule[] = [];

  for (const r of [...custom, ...builtin]) {
    const key = `${r.reportKeyword}|${r.dispatchName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }

  return out;
}
