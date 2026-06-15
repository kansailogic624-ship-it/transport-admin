/**
 * 滋賀店配データ パーサーテスト
 * npx tsx scripts/test-shiga-delivery-parser.ts
 */
import * as fs from "node:fs";
import * as XLSX from "xlsx";
import { parseExcelDate } from "../src/lib/excel-date";
import {
  buildShigaDeliveryPreprocessResult,
  processShigaDeliverySheets,
} from "../src/lib/import-preprocessor/shiga-delivery/build-result";
import { SHIGA_DELIVERY_COURSES } from "../src/lib/import-preprocessor/shiga-delivery/course-definitions";

const DEFAULT_PATH =
  "C:/Users/大西本社/カンロジ Dropbox/カンロジ チーム フォルダ/3.飼鳥BOX/ｼﾞｮｰｼﾝ/滋賀店配データ入力sheet/2026年/滋賀店配データー入力sheet【2026年05月度】.xlsx";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function loadSheets(path: string) {
  if (!fs.existsSync(path)) {
    throw new Error(`ファイルが見つかりません: ${path}`);
  }
  const wb = XLSX.readFile(path, { cellDates: false });
  const sheetName =
    wb.SheetNames.find((n) => n.includes("滋賀")) ?? wb.SheetNames[0]!;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]!, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
  return [{ sheetName, rows }];
}

function testMetadataAndDate(path: string) {
  const sheets = loadSheets(path);
  const processed = processShigaDeliverySheets(sheets, "test.xlsx");
  const result = buildShigaDeliveryPreprocessResult({
    fileName: "test.xlsx",
    ...processed,
    createdAt: new Date().toISOString(),
  });

  assert(result.sourceType === "shiga_store_delivery", "sourceType");
  assert((result.shigaDeliveryRecords?.length ?? 0) > 0, "records > 0");

  const first = result.shigaDeliveryRecords![0]!;
  assert(first.vendorCode === "411089", `vendorCode ${first.vendorCode}`);
  assert(first.vendorName === "エフエートラック", "vendorName");
  assert(first.vehicleType.includes("4"), "vehicleType normalized");
  assert(first.monthPeriod === "2026-05", "monthPeriod");
  assert(first.closingMonth === "2026-05", "closingMonth");

  const row7Date = parseExcelDate(sheets[0]!.rows[6]![0]);
  assert(row7Date === "2026-05-01", `date ${row7Date}`);

  const mayFirst = result.shigaDeliveryRecords!.filter(
    (r) => r.businessDate === "2026-05-01",
  );
  assert(mayFirst.length === 4, `may1 courses ${mayFirst.length}`);

  for (const course of SHIGA_DELIVERY_COURSES) {
    const rec = mayFirst.find((r) => r.courseId === course.courseId);
    assert(Boolean(rec), `course ${course.courseId}`);
    assert(rec!.courseName === course.courseName, "courseName");
    assert(rec!.routeName === course.routeName, "routeName");
    assert(
      rec!.joinKey ===
        `${rec!.vendorCode}|${rec!.vendorName}|${rec!.courseId}|${rec!.businessDate}`,
      "joinKey",
    );
  }

  const totals = result.shigaDeliveryTotals!;
  assert(totals.importedDayCount >= 28, `days ${totals.importedDayCount}`);
  assert(totals.importedActiveDayCount >= 20, `activeDays ${totals.importedActiveDayCount}`);
  assert(totals.importedDetailCount >= 80, `details ${totals.importedDetailCount}`);
  assert(totals.courseCounts.length === 4, "courseCounts length");
  for (const course of SHIGA_DELIVERY_COURSES) {
    const count = totals.courseCounts.find((c) => c.courseId === course.courseId);
    assert((count?.count ?? 0) > 0, `${course.courseId} count`);
  }

  const mayFirstDay = result.shigaDeliveryDaySummaries!.find(
    (d) => d.businessDate === "2026-05-01",
  );
  assert(mayFirstDay?.isBalanced === true, "may1 daily balanced");

  assert(
    !result.shigaDeliveryRecords!.some((r) => r.businessDate === "合計"),
    "no 合計 businessDate in records",
  );

  console.log("OK metadata/date/courses", {
    records: result.totalRows,
    days: totals.importedDayCount,
    payTotal: totals.payTotal,
    excludedNonIso: totals.excludedNonIsoDateRowCount,
    monthlyMatch: totals.reconciliation.matches.allMatch,
  });
}

const path = process.argv[2] ?? DEFAULT_PATH;
testMetadataAndDate(path);
console.log("All shiga delivery parser tests passed.");
