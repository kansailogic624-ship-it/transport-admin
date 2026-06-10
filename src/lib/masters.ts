import type { ParsedFileMakerDispatch } from "./filemaker-dispatch-parser";
import type { MasterData } from "./types";
import { upsertVehicleInMaster } from "./vehicle-import-merge";

export { vehicleExistsInList, renameVehicleInList } from "./vehicle-master-utils";

export function getJobsForShipper(
  masters: MasterData,
  shipperName: string,
): string[] {
  if (!shipperName) return [];
  return masters.shipperJobs[shipperName] ?? [];
}

export function addUniqueToList(list: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || list.includes(trimmed)) return list;
  return [...list, trimmed].sort((a, b) => a.localeCompare(b, "ja"));
}

export function removeFromList(list: string[], value: string): string[] {
  return list.filter((item) => item !== value);
}

export function addShipperWithEmptyJobs(
  masters: MasterData,
  shipperName: string,
): MasterData {
  const name = shipperName.trim();
  if (!name) return masters;
  const shippers = addUniqueToList(masters.shippers, name);
  const shipperJobs = { ...masters.shipperJobs };
  if (!shipperJobs[name]) shipperJobs[name] = [];
  return { ...masters, shippers, shipperJobs };
}

export function removeShipper(masters: MasterData, shipperName: string): MasterData {
  const { [shipperName]: _, ...shipperJobs } = masters.shipperJobs;
  return {
    ...masters,
    shippers: removeFromList(masters.shippers, shipperName),
    shipperJobs,
  };
}

export function addJobToShipper(
  masters: MasterData,
  shipperName: string,
  jobName: string,
): MasterData {
  const job = jobName.trim();
  if (!shipperName || !job) return masters;
  const current = masters.shipperJobs[shipperName] ?? [];
  return {
    ...masters,
    shipperJobs: {
      ...masters.shipperJobs,
      [shipperName]: addUniqueToList(current, job),
    },
  };
}

export function removeJobFromShipper(
  masters: MasterData,
  shipperName: string,
  jobName: string,
): MasterData {
  const current = masters.shipperJobs[shipperName] ?? [];
  return {
    ...masters,
    shipperJobs: {
      ...masters.shipperJobs,
      [shipperName]: removeFromList(current, jobName),
    },
  };
}

/**
 * FileMaker 配車データのみをマスタの正とする。
 * 荷主名・業務名（配車名）・ドライバー・車両を未登録時のみ追加する。
 *
 * 【重要】運転日報（See-Drive）からは一切マスタを更新しないこと。
 * この関数は parseFileMakerDispatchSheet の結果に対してのみ呼び出す。
 */
export function mergeMastersFromFileMakerDispatches(
  masters: MasterData,
  dispatches: ParsedFileMakerDispatch[],
): MasterData {
  if (dispatches.length === 0) return masters;

  let next = { ...masters };

  for (const d of dispatches) {
    if (d.driverName.trim()) {
      next = {
        ...next,
        drivers: addUniqueToList(next.drivers, d.driverName.trim()),
      };
    }
    if (d.vehicleNumber.trim()) {
      next = {
        ...next,
        vehicles: upsertVehicleInMaster(
          next.vehicles,
          d.vehicleNumber.trim(),
          "filemaker",
        ).vehicles,
      };
    }

    const shipper = d.shipperName.trim();
    const job = d.dispatchName.trim();
    if (!shipper) continue;

    next = {
      ...next,
      shippers: addUniqueToList(next.shippers, shipper),
    };
    if (job) {
      next = addJobToShipper(next, shipper, job);
    }
  }

  return next;
}
