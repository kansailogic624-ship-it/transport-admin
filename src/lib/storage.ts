import { storageService } from "@/services/storageService";
import {
  DEFAULT_MASTERS,
  type DailyRecord,
  type MasterData,
} from "./types";

/** @deprecated 直接 storageService を利用してください */
export function loadRecords(): DailyRecord[] {
  return storageService.loadRecords();
}

/** @deprecated 直接 storageService を利用してください */
export function saveRecords(records: DailyRecord[]): void {
  storageService.saveRecords(records);
}

/** @deprecated 直接 storageService を利用してください */
export function loadMasters(): MasterData {
  return storageService.loadMasters();
}

/** @deprecated 直接 storageService を利用してください */
export function saveMasters(masters: MasterData): void {
  storageService.saveMasters(masters);
}

/** @deprecated loadMasters を使用 */
export function loadDrivers(): string[] {
  return storageService.loadMasters().drivers;
}

/** @deprecated saveMasters を使用 */
export function saveDrivers(drivers: string[]): void {
  saveMasters({ ...storageService.loadMasters(), drivers });
}

export { DEFAULT_MASTERS, storageService };
