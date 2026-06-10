/**
 * npm run test:check-missing
 * 管理チェック画面の FM スケジュール照合ロジックの回帰テスト
 */
import { buildDriverDayChecks } from "../src/lib/check-missing-records";
import { normalizeDriverName } from "../src/lib/driving-report-parser";
import {
  datesMatch,
  driverNamesMatch,
  employeeIdsMatch,
} from "../src/lib/import-match-keys";
import { normalizeRecord } from "../src/lib/trip-normalize";
import type { DailyRecord } from "../src/lib/types";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("OK:", msg);
}

// --- 正規化ヘルパー ---
assert(driverNamesMatch("山本 剛志", "山本剛志"), "名前: 半角スペース除去");
assert(driverNamesMatch("山本　剛志", "山本剛志"), "名前: 全角スペース除去");
assert(datesMatch("2026/05/01", "2026-05-01"), "日付: スラッシュとハイフン");
assert(datesMatch("20260501", "2026-05-01"), "日付: コンパクト形式");
assert(employeeIdsMatch("001", 1), "社員ID: ゼロパディングと数値");
assert(employeeIdsMatch("42", "42"), "社員ID: 文字列一致");
assert(normalizeDriverName("山本 剛志") === "山本剛志", "normalizeDriverName");

// --- 山本剛志ケース: 別レコードに分割されていても FM 検出 ---
function makeRecord(partial: Partial<DailyRecord> & Pick<DailyRecord, "id">): DailyRecord {
  return normalizeRecord({
    date: "2026-05-01",
    operationType: "own",
    driverName: "山本剛志",
    trips: [],
    createdAt: new Date().toISOString(),
    ...partial,
  });
}

const rollCallRecord = makeRecord({
  id: "rc-1",
  driverName: "山本 剛志",
  employeeId: "001",
  clockIn: "06:00",
  rollCallPreRecorded: true,
});

const reportRecord = makeRecord({
  id: "rp-1",
  driverName: "山本剛志",
  employeeId: "1",
  reportStatus: "submitted",
  trips: [
    {
      id: "t1",
      runType: "own",
      vehicleNumber: "京都100あ1234",
      shipperName: "テスト荷主",
      jobName: "テスト業務",
      revenue: "",
      tollFee: "",
      startMeter: "",
      endMeter: "",
      crew: [],
      partnerName: "",
      partnerFee: "",
    },
  ],
});

const fmRecord = makeRecord({
  id: "fm-1",
  date: "2026/05/01",
  driverName: "山本剛志",
  timecardIn: "05:50",
  timecardOut: "18:00",
  fusionDispatchOptions: [{ dispatchName: "配車A", revenue: "50000" }],
  trips: [
    {
      id: "t2",
      runType: "own",
      vehicleNumber: "京都100あ1234",
      shipperName: "テスト荷主",
      jobName: "配車A",
      linkedDispatchName: "配車A",
      revenue: "50000",
      tollFee: "",
      startMeter: "",
      endMeter: "",
      crew: [],
      partnerName: "",
      partnerFee: "",
    },
  ],
});

const checks = buildDriverDayChecks(
  [rollCallRecord, reportRecord, fmRecord],
  "2026-05-01",
);

assert(checks.length === 1, "1ドライバーに集約");
const yamamoto = checks[0]!;
assert(yamamoto.driverName.includes("山本"), "山本のチェック結果");
assert(yamamoto.hasRollCall, "点呼あり");
assert(yamamoto.hasReport, "日報あり");
assert(yamamoto.hasFmSchedule, "FMスケジュールあり（未登録にならない）");
assert(!yamamoto.issues.includes("fm_missing"), "fm_missing なし");
assert(yamamoto.primaryStatus === "ok", "ステータス正常");

// --- FM のみタイムカードなし・配車データのみでも検出 ---
const fmDispatchOnly = makeRecord({
  id: "fm-2",
  driverName: "田中 太郎",
  timecardIn: undefined,
  timecardOut: undefined,
  trips: [
    {
      id: "t3",
      runType: "own",
      vehicleNumber: "",
      shipperName: "",
      jobName: "午前便",
      linkedDispatchName: "午前便",
      revenue: "30000",
      tollFee: "",
      startMeter: "",
      endMeter: "",
      crew: [],
      partnerName: "",
      partnerFee: "",
    },
  ],
});

const tanakaRollCall = makeRecord({
  id: "rc-2",
  driverName: "田中太郎",
  clockIn: "07:00",
  rollCallPreRecorded: true,
});

const tanakaChecks = buildDriverDayChecks(
  [tanakaRollCall, fmDispatchOnly],
  "2026-05-01",
);
assert(tanakaChecks[0]?.hasFmSchedule, "配車のみでも FM あり");

console.log("\n全テスト合格");
