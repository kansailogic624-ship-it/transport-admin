import {
  displayVehicleNumber,
  extractVehicleDigits,
  normalizeVehicleNumber,
} from "./import-match-keys";

/** 検索比較用：空白除去・全角英数字を半角化・小文字化 */
export function normalizeSearchText(raw: string): string {
  return (raw ?? "")
    .replace(/[\s\u3000]/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .toLowerCase();
}

export function matchesTextSearch(query: string, text: string): boolean {
  const q = normalizeSearchText(query.trim());
  if (!q) return true;
  return normalizeSearchText(text).includes(q);
}

/** 車両番号：括弧・空白を無視した部分一致（84-73 → 京都100い84-73 等） */
export function matchesVehicleSearch(query: string, vehicle: string): boolean {
  const q = query.trim();
  if (!q) return true;

  const qDisplay = normalizeSearchText(displayVehicleNumber(q));
  const vDisplay = normalizeSearchText(displayVehicleNumber(vehicle));
  if (qDisplay && vDisplay.includes(qDisplay)) return true;

  const qNorm = normalizeVehicleNumber(q);
  const vNorm = normalizeVehicleNumber(vehicle);
  if (qNorm && vNorm.includes(qNorm)) return true;

  const qDigits = extractVehicleDigits(qNorm);
  const vDigits = extractVehicleDigits(vNorm);
  if (qDigits.length >= 2 && vDigits.includes(qDigits)) return true;

  return false;
}

export type ShipperJobGroup = { shipper: string; jobs: string[] };

/** 業務名マスタ：荷主名または業務名の部分一致で絞り込み */
export function filterShipperJobGroups(
  shippers: string[],
  shipperJobs: Record<string, string[]>,
  query: string,
): ShipperJobGroup[] {
  const q = query.trim();
  if (!q) {
    return shippers
      .filter((s) => (shipperJobs[s] ?? []).length > 0)
      .map((shipper) => ({
        shipper,
        jobs: shipperJobs[shipper] ?? [],
      }));
  }

  const groups: ShipperJobGroup[] = [];
  for (const shipper of shippers) {
    const jobs = shipperJobs[shipper] ?? [];
    if (jobs.length === 0) continue;

    const shipperHit = matchesTextSearch(q, shipper);
    const matchedJobs = shipperHit
      ? jobs
      : jobs.filter((job) => matchesTextSearch(q, job));

    if (matchedJobs.length > 0) {
      groups.push({ shipper, jobs: matchedJobs });
    }
  }
  return groups;
}
