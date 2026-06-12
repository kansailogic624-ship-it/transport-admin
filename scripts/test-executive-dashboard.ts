/**
 * 経営ダッシュボード analytics 層のスモークテスト
 */
import { buildExecutiveDashboard } from "../src/lib/analytics/dashboard-summary";
import type { DailyRecord, MasterData } from "../src/lib/types";

const masters: MasterData = {
  drivers: ["山田太郎"],
  partners: [],
  vehicles: ["品川100あ1234"],
  shippers: ["Amazon", "ニトリ"],
  shipperJobs: {
    Amazon: ["1マン"],
    ニトリ: ["配送"],
  },
  employeeSalaries: { 山田太郎: 300000 },
  defaultPartTimeDaily: 10000,
  defaultDispatchDaily: 15000,
  mappingRules: [],
  allocationExpenses: [],
};

const records: DailyRecord[] = [
  {
    id: "r1",
    date: "2026-05-10",
    driverName: "山田太郎",
    clockIn: "06:00",
    clockOut: "18:00",
    trips: [
      {
        id: "t1",
        runType: "own",
        shipperName: "Amazon",
        jobName: "1マン",
        vehicleNumber: "品川100あ1234",
        revenue: "50000",
        tollFee: "2000",
        partnerFee: "",
        partnerName: "",
        startMeter: "1000",
        endMeter: "1120",
        crew: [
          {
            id: "c1",
            memberType: "employee",
            name: "山田太郎",
            dailyCost: "",
          },
        ],
      },
    ],
  },
  {
    id: "r2",
    date: "2026-05-11",
    driverName: "山田太郎",
    clockIn: "07:00",
    clockOut: "19:00",
    trips: [
      {
        id: "t2",
        runType: "own",
        shipperName: "ニトリ",
        jobName: "配送",
        vehicleNumber: "品川100あ1234",
        revenue: "30000",
        tollFee: "1000",
        partnerFee: "",
        partnerName: "",
        startMeter: "2000",
        endMeter: "2080",
        crew: [
          {
            id: "c2",
            memberType: "employee",
            name: "山田太郎",
            dailyCost: "",
          },
        ],
      },
    ],
  },
];

const dashboard = buildExecutiveDashboard({
  records,
  yearMonth: "2026-05",
  masters,
  vehicleExpenses: [],
});

console.assert(dashboard.kpis.monthlyRevenue === 80000, "revenue");
console.assert(dashboard.kpis.activeDriverCount === 1, "drivers");
console.assert(dashboard.kpis.activeVehicleCount === 1, "vehicles");
console.assert(dashboard.shipperRankings.length === 2, "shippers");
console.assert(dashboard.driverRankings.length === 1, "driver rankings");
console.assert(
  dashboard.driverRankings[0]!.revenuePerRestraintHour > 0,
  "revenue per hour",
);

console.log("OK executive dashboard analytics");
console.log(JSON.stringify(dashboard.kpis, null, 2));
