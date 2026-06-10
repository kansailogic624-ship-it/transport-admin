import type { ParsedFileMakerDispatch } from "./filemaker-dispatch-parser";
import type { DailyRecord, MasterData } from "./types";

/** FileMaker 未登録時のフォールバック（Amazon 正規コース名） */
const AMAZON_LEGITIMATE_JOB_RE =
  /^Amazon(\s+(HB|LP)[①②③④⑤⑥⑦⑧⑨]?\d*)?$/iu;

/** FM 正式コース名に含まれやすいマーカー */
const FM_JOB_MARKER_RE =
  /[①②③④⑤⑥⑦⑧⑨]|\d|センター|配送|ロング|便|ルート|コース|HB|LP|宅配|C①|C②/i;

export type JobMasterCleanupOptions = {
  records?: DailyRecord[];
  fmDispatches?: ParsedFileMakerDispatch[];
};

function isAmazonShipper(shipperName: string): boolean {
  const s = shipperName.replace(/\s/g, "").trim().toLowerCase();
  return s === "amazon" || s.includes("amazon") || s.includes("アマゾン");
}

function addToMap(map: Map<string, Set<string>>, shipper: string, job: string) {
  if (!shipper || !job) return;
  if (!map.has(shipper)) map.set(shipper, new Set());
  map.get(shipper)!.add(job);
}

/** FileMaker 配車・融合レコードから正規の荷主×業務名を収集 */
export function collectKnownFileMakerJobs(
  options: JobMasterCleanupOptions = {},
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  for (const d of options.fmDispatches ?? []) {
    addToMap(map, d.shipperName.trim(), d.dispatchName.trim());
  }

  for (const record of options.records ?? []) {
    for (const trip of record.trips) {
      const linked = trip.linkedDispatchName?.trim();
      if (!linked) continue;
      addToMap(map, trip.shipperName.trim(), linked);
    }
  }

  return map;
}

/**
 * 運転日報由来の業務名テキスト（FM未紐付け trip から収集）。
 * マスタに残してはいけない実績ラベルの一覧。
 */
export function collectReportDerivedJobNames(
  records: DailyRecord[] = [],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  for (const record of records) {
    for (const trip of record.trips) {
      if (trip.linkedDispatchName?.trim()) continue;

      const shipper = trip.shipperName.trim();
      const raw = trip.jobName.trim() || trip.reportSourceLabel?.trim() || "";
      if (!shipper || !raw) continue;

      for (const part of raw.split(/\s*\/\s*/)) {
        const label = part.trim();
        if (label) addToMap(map, shipper, label);
      }
    }
  }

  return map;
}

/** 個人名・届け先名っぽいラベル（マナベインテリアハーツの「いしだ」「安村様」等） */
export function looksLikePersonalDeliveryLabel(job: string): boolean {
  const t = job.trim();
  if (!t) return true;
  if (/様$/.test(t)) return true;
  if (/^[ぁ-んー]{2,12}$/.test(t)) return true;
  if (/^[ァ-ヴー]{2,12}$/.test(t)) return true;
  if (/^[\u4e00-\u9faf]{1,4}$/.test(t) && !FM_JOB_MARKER_RE.test(t)) {
    return true;
  }
  return false;
}

function amazonFmJobs(knownFmJobs: Map<string, Set<string>>): Set<string> {
  const merged = new Set<string>();
  for (const [shipper, jobs] of knownFmJobs) {
    if (!isAmazonShipper(shipper)) continue;
    for (const job of jobs) merged.add(job);
  }
  return merged;
}

/** 業務名マスタに残してよい正規の案件名か */
export function isLegitimateRegisteredJob(
  shipperName: string,
  jobName: string,
  knownFmJobs?: Map<string, Set<string>>,
  reportDerivedJobs?: Map<string, Set<string>>,
): boolean {
  const job = jobName.trim();
  const shipper = shipperName.trim();
  if (!job || !shipper) return false;

  if (reportDerivedJobs?.get(shipper)?.has(job)) {
    return false;
  }

  const fmSet = knownFmJobs?.get(shipper);
  if (fmSet?.has(job)) return true;

  // FM に正式登録がある荷主はホワイトリストのみ許可
  if (fmSet && fmSet.size > 0) {
    return false;
  }

  if (isAmazonShipper(shipper)) {
    const amazonJobs = knownFmJobs ? amazonFmJobs(knownFmJobs) : null;
    if (amazonJobs && amazonJobs.size > 0) {
      return amazonJobs.has(job);
    }
    return AMAZON_LEGITIMATE_JOB_RE.test(job);
  }

  if (looksLikePersonalDeliveryLabel(job)) {
    return false;
  }

  return true;
}

/** 日報取込で誤登録された配送先・個人名を業務名マスタから除去 */
export function cleanupImportedJobMasterNoise(
  masters: MasterData,
  options: JobMasterCleanupOptions = {},
): {
  masters: MasterData;
  removed: Array<{ shipper: string; job: string }>;
} {
  const knownFmJobs = collectKnownFileMakerJobs(options);
  const reportDerivedJobs = collectReportDerivedJobNames(options.records);
  const removed: Array<{ shipper: string; job: string }> = [];
  const shipperJobs = { ...masters.shipperJobs };

  for (const [shipper, jobs] of Object.entries(shipperJobs)) {
    const kept: string[] = [];
    for (const job of jobs) {
      if (
        isLegitimateRegisteredJob(
          shipper,
          job,
          knownFmJobs,
          reportDerivedJobs,
        )
      ) {
        kept.push(job);
      } else {
        removed.push({ shipper, job });
      }
    }
    shipperJobs[shipper] = kept;
  }

  return {
    masters: { ...masters, shipperJobs },
    removed,
  };
}
