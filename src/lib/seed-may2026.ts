import { newCrewMember } from "./crew-utils";
import type {
  DailyRecord,
  MasterData,
  SystemBackup,
  TripCrewMember,
  TripEntry,
} from "./types";

export const MAY2026_YEAR_MONTH = "2026-05";

export function createMay2026Masters(): MasterData {
  return {
    drivers: ["大西", "山田", "佐藤", "田中"],
    partners: ["旭町運輸", "関西ロジサービス"],
    vehicles: [
      "京都100あ1111",
      "京都100あ2222",
      "京都100あ3333",
      "京都100あ4444",
    ],
    shippers: ["ニトリ", "アマゾン", "エフピコ"],
    shipperJobs: {
      ニトリ: ["家具配送", "センター間輸送"],
      アマゾン: ["宅配", "夜間拠点輸送"],
      エフピコ: ["食品トレー配送"],
    },
    employeeSalaries: {
      大西: 450000,
      山田: 350000,
      佐藤: 300000,
      田中: 280000,
    },
    defaultPartTimeDaily: 15000,
    defaultDispatchDaily: 15000,
    mappingRules: [],
    allocationExpenses: [],
  };
}

function crewEmployee(name: string): TripCrewMember {
  const m = newCrewMember("employee");
  m.name = name;
  return m;
}

function crewPartTime(name: string, dailyCost = "15000"): TripCrewMember {
  const m = newCrewMember("part_time");
  m.name = name;
  m.dailyCost = dailyCost;
  return m;
}

function ownTrip(p: {
  vehicle: string;
  shipper: string;
  job: string;
  revenue: number;
  toll?: number;
  startMeter: number;
  endMeter: number;
  crew: TripCrewMember[];
}): TripEntry {
  return {
    id: crypto.randomUUID(),
    runType: "own",
    vehicleNumber: p.vehicle,
    shipperName: p.shipper,
    jobName: p.job,
    revenue: String(p.revenue),
    tollFee: p.toll ? String(p.toll) : "",
    startMeter: String(p.startMeter),
    endMeter: String(p.endMeter),
    crew: p.crew,
    partnerName: "",
    partnerFee: "",
  };
}

function partnerTrip(p: {
  partner: string;
  shipper: string;
  job: string;
  revenue: number;
  feeRatio?: number;
}): TripEntry {
  const ratio = p.feeRatio ?? 0.87;
  const fee = Math.round(p.revenue * ratio);
  return {
    id: crypto.randomUUID(),
    runType: "partner",
    vehicleNumber: "",
    shipperName: p.shipper,
    jobName: p.job,
    revenue: String(p.revenue),
    tollFee: "",
    startMeter: "",
    endMeter: "",
    crew: [],
    partnerName: p.partner,
    partnerFee: String(fee),
  };
}

function ownRecord(p: {
  date: string;
  driver: string;
  clockIn: string;
  clockOut: string;
  rollCall: string;
  dailyReport: boolean;
  trips: TripEntry[];
  createdAt?: string;
}): DailyRecord {
  return {
    id: crypto.randomUUID(),
    date: p.date,
    operationType: "own",
    driverName: p.driver,
    clockIn: p.clockIn,
    clockOut: p.clockOut,
    rollCallTime: p.rollCall,
    reportStatus: p.dailyReport ? "submitted" : "not_submitted",
    trips: p.trips,
    createdAt: p.createdAt ?? `${p.date}T09:00:00.000Z`,
  };
}

function partnerRecord(p: {
  date: string;
  trips: TripEntry[];
  createdAt?: string;
}): DailyRecord {
  return {
    id: crypto.randomUUID(),
    date: p.date,
    operationType: "partner",
    driverName: "（傭車）",
    clockIn: "",
    clockOut: "",
    rollCallTime: "",
    reportStatus: "not_required",
    trips: p.trips,
    createdAt: p.createdAt ?? `${p.date}T10:00:00.000Z`,
  };
}

/** 2026年5月 実務サンプル（約30業務・5パターン混在） */
export function generateMay2026Records(): DailyRecord[] {
  const records: DailyRecord[] = [
    // 1. 自社・1日1業務（エフピコ）
    ownRecord({
      date: "2026-05-01",
      driver: "大西",
      clockIn: "06:30",
      clockOut: "16:00",
      rollCall: "06:35",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ1111",
          shipper: "エフピコ",
          job: "食品トレー配送",
          revenue: 85000,
          toll: 3200,
          startMeter: 12400,
          endMeter: 12580,
          crew: [crewEmployee("大西")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-02",
      driver: "佐藤",
      clockIn: "07:00",
      clockOut: "17:30",
      rollCall: "07:05",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ2222",
          shipper: "ニトリ",
          job: "家具配送",
          revenue: 120000,
          toll: 4500,
          startMeter: 8900,
          endMeter: 9120,
          crew: [crewEmployee("佐藤")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-03",
      driver: "田中",
      clockIn: "08:00",
      clockOut: "18:00",
      rollCall: "08:05",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ3333",
          shipper: "アマゾン",
          job: "宅配",
          revenue: 95000,
          toll: 2800,
          startMeter: 20100,
          endMeter: 20340,
          crew: [crewEmployee("田中")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-04",
      driver: "山田",
      clockIn: "06:00",
      clockOut: "19:00",
      rollCall: "06:10",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ1111",
          shipper: "エフピコ",
          job: "食品トレー配送",
          revenue: 78000,
          toll: 2100,
          startMeter: 12580,
          endMeter: 12750,
          crew: [crewEmployee("山田")],
        }),
        ownTrip({
          vehicle: "京都100あ1111",
          shipper: "ニトリ",
          job: "センター間輸送",
          revenue: 65000,
          toll: 1800,
          startMeter: 12750,
          endMeter: 12920,
          crew: [crewEmployee("山田")],
        }),
      ],
    }),
    // 2. 乗り換え・複数業務
    ownRecord({
      date: "2026-05-05",
      driver: "大西",
      clockIn: "05:45",
      clockOut: "20:00",
      rollCall: "05:50",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ1111",
          shipper: "ニトリ",
          job: "家具配送",
          revenue: 110000,
          toll: 5200,
          startMeter: 12920,
          endMeter: 13280,
          crew: [crewEmployee("大西")],
        }),
        ownTrip({
          vehicle: "京都100あ2222",
          shipper: "アマゾン",
          job: "夜間拠点輸送",
          revenue: 98000,
          toll: 4100,
          startMeter: 5600,
          endMeter: 5890,
          crew: [crewEmployee("大西")],
        }),
      ],
    }),
    // 3. ツーマン（山田 + アルバイト）
    ownRecord({
      date: "2026-05-06",
      driver: "山田",
      clockIn: "07:00",
      clockOut: "17:00",
      rollCall: "07:05",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ4444",
          shipper: "ニトリ",
          job: "家具配送",
          revenue: 135000,
          toll: 3800,
          startMeter: 7800,
          endMeter: 8060,
          crew: [crewEmployee("山田"), crewPartTime("アルバイトA")],
        }),
      ],
    }),
    // 4. 傭車
    partnerRecord({
      date: "2026-05-07",
      trips: [
        partnerTrip({
          partner: "旭町運輸",
          shipper: "アマゾン",
          job: "宅配",
          revenue: 88000,
          feeRatio: 0.88,
        }),
      ],
    }),
    // 5. アラート：走行450km
    ownRecord({
      date: "2026-05-08",
      driver: "佐藤",
      clockIn: "04:30",
      clockOut: "22:00",
      rollCall: "04:35",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ3333",
          shipper: "アマゾン",
          job: "夜間拠点輸送",
          revenue: 150000,
          toll: 12000,
          startMeter: 20340,
          endMeter: 20790,
          crew: [crewEmployee("佐藤")],
        }),
      ],
    }),
    // アラート：点呼30分ズレ
    ownRecord({
      date: "2026-05-09",
      driver: "田中",
      clockIn: "07:00",
      clockOut: "16:30",
      rollCall: "07:30",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ2222",
          shipper: "エフピコ",
          job: "食品トレー配送",
          revenue: 72000,
          toll: 1500,
          startMeter: 9120,
          endMeter: 9280,
          crew: [crewEmployee("田中")],
        }),
      ],
    }),
    // アラート：日報未提出
    ownRecord({
      date: "2026-05-10",
      driver: "大西",
      clockIn: "06:00",
      clockOut: "15:30",
      rollCall: "06:05",
      dailyReport: false,
      trips: [
        ownTrip({
          vehicle: "京都100あ1111",
          shipper: "ニトリ",
          job: "センター間輸送",
          revenue: 92000,
          toll: 3400,
          startMeter: 13280,
          endMeter: 13510,
          crew: [crewEmployee("大西")],
        }),
      ],
    }),
    partnerRecord({
      date: "2026-05-11",
      trips: [
        partnerTrip({
          partner: "関西ロジサービス",
          shipper: "ニトリ",
          job: "家具配送",
          revenue: 125000,
          feeRatio: 0.9,
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-12",
      driver: "山田",
      clockIn: "07:30",
      clockOut: "18:00",
      rollCall: "07:35",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ4444",
          shipper: "エフピコ",
          job: "食品トレー配送",
          revenue: 68000,
          toll: 2200,
          startMeter: 8060,
          endMeter: 8210,
          crew: [crewEmployee("山田")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-13",
      driver: "佐藤",
      clockIn: "06:15",
      clockOut: "19:30",
      rollCall: "06:20",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ1111",
          shipper: "アマゾン",
          job: "宅配",
          revenue: 88000,
          toll: 3100,
          startMeter: 13510,
          endMeter: 13760,
          crew: [crewEmployee("佐藤")],
        }),
        ownTrip({
          vehicle: "京都100あ1111",
          shipper: "ニトリ",
          job: "家具配送",
          revenue: 105000,
          toll: 2900,
          startMeter: 13760,
          endMeter: 14020,
          crew: [crewEmployee("佐藤")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-14",
      driver: "田中",
      clockIn: "08:00",
      clockOut: "17:00",
      rollCall: "08:05",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ3333",
          shipper: "アマゾン",
          job: "宅配",
          revenue: 76000,
          toll: 1800,
          startMeter: 20790,
          endMeter: 20980,
          crew: [crewEmployee("田中")],
        }),
      ],
    }),
    partnerRecord({
      date: "2026-05-15",
      trips: [
        partnerTrip({
          partner: "旭町運輸",
          shipper: "エフピコ",
          job: "食品トレー配送",
          revenue: 70000,
          feeRatio: 0.85,
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-16",
      driver: "大西",
      clockIn: "05:30",
      clockOut: "16:00",
      rollCall: "05:35",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ2222",
          shipper: "ニトリ",
          job: "家具配送",
          revenue: 118000,
          toll: 4200,
          startMeter: 9280,
          endMeter: 9550,
          crew: [crewEmployee("大西")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-17",
      driver: "佐藤",
      clockIn: "06:45",
      clockOut: "18:45",
      rollCall: "06:50",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ3333",
          shipper: "エフピコ",
          job: "食品トレー配送",
          revenue: 82000,
          toll: 2600,
          startMeter: 20980,
          endMeter: 21170,
          crew: [crewEmployee("佐藤")],
        }),
        ownTrip({
          vehicle: "京都100あ4444",
          shipper: "アマゾン",
          job: "夜間拠点輸送",
          revenue: 102000,
          toll: 4800,
          startMeter: 8210,
          endMeter: 8480,
          crew: [crewEmployee("佐藤")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-19",
      driver: "田中",
      clockIn: "07:15",
      clockOut: "16:45",
      rollCall: "07:20",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ1111",
          shipper: "ニトリ",
          job: "センター間輸送",
          revenue: 89000,
          toll: 3300,
          startMeter: 14020,
          endMeter: 14240,
          crew: [crewEmployee("田中")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-20",
      driver: "山田",
      clockIn: "06:30",
      clockOut: "17:30",
      rollCall: "06:35",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ4444",
          shipper: "ニトリ",
          job: "家具配送",
          revenue: 128000,
          toll: 3600,
          startMeter: 8480,
          endMeter: 8750,
          crew: [crewEmployee("山田"), crewPartTime("アルバイトB", "15000")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-21",
      driver: "佐藤",
      clockIn: "07:00",
      clockOut: "18:00",
      rollCall: "07:05",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ2222",
          shipper: "アマゾン",
          job: "宅配",
          revenue: 91000,
          toll: 2700,
          startMeter: 9550,
          endMeter: 9780,
          crew: [crewEmployee("佐藤")],
        }),
      ],
    }),
    partnerRecord({
      date: "2026-05-22",
      trips: [
        partnerTrip({
          partner: "関西ロジサービス",
          shipper: "アマゾン",
          job: "夜間拠点輸送",
          revenue: 96000,
          feeRatio: 0.89,
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-23",
      driver: "大西",
      clockIn: "05:00",
      clockOut: "20:30",
      rollCall: "05:05",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ1111",
          shipper: "エフピコ",
          job: "食品トレー配送",
          revenue: 74000,
          toll: 1900,
          startMeter: 14240,
          endMeter: 14400,
          crew: [crewEmployee("大西")],
        }),
        ownTrip({
          vehicle: "京都100あ3333",
          shipper: "アマゾン",
          job: "宅配",
          revenue: 87000,
          toll: 3500,
          startMeter: 21170,
          endMeter: 21420,
          crew: [crewEmployee("大西")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-24",
      driver: "田中",
      clockIn: "08:30",
      clockOut: "17:30",
      rollCall: "08:35",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ2222",
          shipper: "エフピコ",
          job: "食品トレー配送",
          revenue: 69000,
          toll: 1600,
          startMeter: 9780,
          endMeter: 9930,
          crew: [crewEmployee("田中")],
        }),
      ],
    }),
    ownRecord({
      date: "2026-05-25",
      driver: "山田",
      clockIn: "06:00",
      clockOut: "16:30",
      rollCall: "06:05",
      dailyReport: true,
      trips: [
        ownTrip({
          vehicle: "京都100あ4444",
          shipper: "ニトリ",
          job: "センター間輸送",
          revenue: 98000,
          toll: 3000,
          startMeter: 8750,
          endMeter: 8980,
          crew: [crewEmployee("山田")],
        }),
      ],
    }),
    partnerRecord({
      date: "2026-05-26",
      trips: [
        partnerTrip({
          partner: "旭町運輸",
          shipper: "ニトリ",
          job: "センター間輸送",
          revenue: 82000,
          feeRatio: 0.86,
        }),
      ],
    }),
  ];

  return records.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function generateMay2026Sample(): SystemBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    records: generateMay2026Records(),
    masters: createMay2026Masters(),
  };
}

export function getMay2026SampleStats(records: DailyRecord[]) {
  return {
    yearMonth: MAY2026_YEAR_MONTH,
    recordCount: records.length,
    tripCount: countTrips(records),
  };
}

export function countTrips(records: DailyRecord[]): number {
  return records.reduce((s, r) => s + r.trips.length, 0);
}
