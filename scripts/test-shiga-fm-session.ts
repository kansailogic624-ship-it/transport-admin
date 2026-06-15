/**
 * 滋賀FMセッション ユーティリティテスト
 * npx tsx scripts/test-shiga-fm-session.ts
 */
import { buildShigaFmSessionDocument } from "../src/lib/shiga-fm/session-utils";
import { SHIGA_FM_SESSION_SCHEMA_VERSION } from "../src/lib/shiga-fm/session-types";
import type { ShigaFmReconciliationRow } from "../src/lib/import-preprocessor/shiga-fm-reconciliation/types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function testBuildSessionDocument() {
  const now = "2026-06-10T12:00:00.000Z";
  const doc = buildShigaFmSessionDocument(
    {
      monthPeriod: "2026-04",
      preprocessCache: {
        shiga: {
          sourceType: "shiga_store_delivery",
          sourceFileName: "shiga.xlsx",
          totalRows: 10,
          successRows: 10,
          warningRows: 0,
          errorRows: 0,
          duplicateRows: 0,
          records: [],
          warnings: [],
          errors: [],
          createdAt: now,
          shigaDeliveryRecords: [
            {
              id: "1",
              monthPeriod: "2026-04",
            } as never,
          ],
        },
        fm: {
          sourceType: "filemaker_employee_schedule",
          sourceFileName: "fm.xlsx",
          totalRows: 5,
          successRows: 5,
          warningRows: 0,
          errorRows: 0,
          duplicateRows: 0,
          records: [],
          warnings: [],
          errors: [],
          createdAt: now,
          fmScheduleRecords: [{ id: "f1" } as never, { id: "f2" } as never],
        },
        employeeNames: ["古屋雅仁", "松本 裕樹"],
      },
      reconcileResult: {
        monthPeriod: "2026-04",
        rows: [{ id: "r1" }, { id: "r2" }] as never[],
        totals: {
          fmShortageCount: 3,
          unregisteredCount: 0,
        } as never,
        diagnostics: {
          employeeCount: 72,
          partnerCount: 0,
          unregisteredCount: 0,
          fmShortageCount: 3,
          excludedTotalRowCount: 4,
        },
      } as never,
      preserveSavedAt: "2026-06-01T00:00:00.000Z",
      preserveReconciledAt: "2026-06-05T00:00:00.000Z",
    },
    now,
  );

  assert(doc.schemaVersion === SHIGA_FM_SESSION_SCHEMA_VERSION, "schema");
  assert(doc.monthPeriod === "2026-04", "monthPeriod");
  assert(doc.shigaFileName === "shiga.xlsx", "shiga file");
  assert(doc.fmFileName === "fm.xlsx", "fm file");
  assert(doc.savedAt === "2026-06-01T00:00:00.000Z", "preserve savedAt");
  assert(doc.reconciledAt === "2026-06-05T00:00:00.000Z", "preserve reconciledAt");
  assert(doc.shigaRecordCount === 1, "shiga count");
  assert(doc.fmRecordCount === 2, "fm count");
  assert(doc.reconcileRowCount === 2, "reconcile rows");
  assert(doc.employeeCount === 72, "employee diag");
  assert(doc.fmShortageCount === 3, "fm shortage");
  assert(doc.employeeNames.length === 2, "employee names");

  console.log("OK buildShigaFmSessionDocument");
}

function testStripReconcileIssuesOnSave() {
  const now = "2026-06-10T12:00:00.000Z";
  const rowWithIssues = {
    id: "r1",
    status: "mapping_failed",
    mismatchReasons: ["潤生輸送 の支払契約が未登録です"],
    reconcileIssues: [
      {
        code: "contract_not_registered",
        severity: "warning",
        message: "潤生輸送 の支払契約が未登録です",
        masterKind: "payment_contract",
      },
    ],
  } as ShigaFmReconciliationRow;

  const doc = buildShigaFmSessionDocument(
    {
      monthPeriod: "2026-04",
      preprocessCache: {
        shiga: null,
        fm: null,
        employeeNames: [],
      },
      reconcileResult: {
        monthPeriod: "2026-04",
        rows: [rowWithIssues],
        totals: { fmShortageCount: 0, unregisteredCount: 0 } as never,
      } as never,
    },
    now,
  );

  assert(
    doc.reconcileResult?.rows[0]?.reconcileIssues === undefined,
    "reconcileIssues not saved",
  );
  assert(
    doc.reconcileResult?.rows[0]?.mismatchReasons.length === 1,
    "mismatchReasons preserved",
  );

  console.log("OK strip reconcileIssues on save");
}

testBuildSessionDocument();
testStripReconcileIssuesOnSave();
console.log("All shiga-fm session tests passed.");
