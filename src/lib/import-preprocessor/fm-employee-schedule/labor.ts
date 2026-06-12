import type { FmEmployeeScheduleStagingRecord } from "./types";

function parseMinutes(time: string): number | null {
  const m = (time ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

/** 出勤〜退勤の拘束分（夜勤跨ぎは +24h） */
export function computeBindingMinutes(
  clockInTime: string,
  clockOutTime: string,
): number | null {
  const start = parseMinutes(clockInTime);
  const end = parseMinutes(clockOutTime);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function laborPickScore(record: FmEmployeeScheduleStagingRecord): number {
  let score = 0;
  if (record.isRevenueRow) score += 1000;
  score += (record.revenueAmount ?? 0) / 100;
  const start = parseMinutes(record.clockInTime);
  const end = parseMinutes(record.clockOutTime);
  if (start != null) score += (24 * 60 - start) / 10;
  if (end != null) score += end / 10;
  score -= record.sourceRowNumber / 100_000;
  if (record.isAttendanceOnlyRow && (record.clockInTime || record.clockOutTime)) {
    score += 500;
  }
  return score;
}

/** 同一 employeeDayKey 内で countsForLaborTime を1行だけ true にする */
export function applyLaborTimeSelection(
  records: FmEmployeeScheduleStagingRecord[],
): FmEmployeeScheduleStagingRecord[] {
  const byDay = new Map<string, FmEmployeeScheduleStagingRecord[]>();
  for (const record of records) {
    if (record.isPartnerLikeRow) continue;
    const bucket = byDay.get(record.employeeDayKey) ?? [];
    bucket.push(record);
    byDay.set(record.employeeDayKey, bucket);
  }

  const pickIds = new Set<string>();

  for (const group of byDay.values()) {
    const ranked = [...group].sort(
      (a, b) => laborPickScore(b) - laborPickScore(a),
    );
    ranked.forEach((record, index) => {
      record.laborTimeGroupRank = index + 1;
      record.countsForLaborTime = index === 0;
      if (index === 0) pickIds.add(record.id);
    });
  }

  return records.map((record) => {
    if (record.isPartnerLikeRow) {
      return {
        ...record,
        countsForLaborTime: false,
        laborTimeGroupRank: 0,
        bindingMinutes: null,
      };
    }
    const bindingMinutes =
      record.countsForLaborTime
        ? computeBindingMinutes(record.clockInTime, record.clockOutTime)
        : null;
    return {
      ...record,
      countsForLaborTime: pickIds.has(record.id),
      bindingMinutes,
    };
  });
}
