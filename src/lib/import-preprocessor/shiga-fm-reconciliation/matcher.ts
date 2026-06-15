import type { FmEmployeeScheduleStagingRecord } from "../fm-employee-schedule/types";
import type { ShigaDeliveryStagingRecord } from "../shiga-delivery/types";
import {
  getAggregateJobsForCourse,
  mapFmJobToCourse,
  resolveFmJobCourseMapping,
  SHIGA_FM_COURSE_MAPPING,
} from "./course-mapping";
import { filterFmRowsForReconciliation } from "./fm-row-filter";
import {
  amountsNearlyEqual,
  buildProfitFields,
  sumFmRevenue,
} from "./profit-calc";
import type {
  ShigaFmMatchedFmRow,
  ShigaFmReconciliationRow,
  ShigaFmMatchStatus,
} from "./types";
import {
  buildReconciliationMatchKey,
  normalizeFmShipperToVendor,
} from "./vendor-mapping";
import { SHIGA_FM_BILLING_PARTY } from "./cost-classifier";
import { buildSlotAssignmentKey } from "./slot-assignment-types";
import { businessMonthFromDate } from "@/lib/shiga-fm/slot-amount-calc";

function legacyRowExtras(
  shiga: ShigaDeliveryStagingRecord | null,
  fmJobNames: string[],
): Pick<
  ShigaFmReconciliationRow,
  | "slotKey"
  | "assignmentId"
  | "slotIndex"
  | "unitCount"
  | "jobName"
  | "costCategory"
  | "billingParty"
  | "paymentParty"
  | "contractTypeLabel"
  | "contractId"
  | "paymentContractId"
  | "billingContractId"
  | "paymentContractLabel"
  | "billingContractLabel"
  | "billingPartyId"
  | "paymentPartyId"
  | "businessMonth"
  | "notes"
> {
  const businessDate = shiga?.businessDate ?? "";
  return {
    slotKey: buildSlotAssignmentKey({
      businessDate: shiga?.businessDate ?? "",
      courseId: shiga?.courseId ?? "",
      slotIndex: 1,
    }),
    assignmentId: null,
    slotIndex: 1,
    unitCount: shiga?.unitCount ?? 1,
    jobName: fmJobNames[0] ?? shiga?.courseName ?? "—",
    costCategory: "unknown",
    billingParty: SHIGA_FM_BILLING_PARTY,
    paymentParty: "—",
    contractTypeLabel: null,
    contractId: null,
    paymentContractId: null,
    billingContractId: null,
    paymentContractLabel: null,
    billingContractLabel: null,
    billingPartyId: null,
    paymentPartyId: null,
    businessMonth: businessMonthFromDate(businessDate),
    notes: [],
  };
}

function toFmMatchedRow(r: FmEmployeeScheduleStagingRecord): ShigaFmMatchedFmRow {
  return {
    recordId: r.id,
    sourceRowNumber: r.sourceRowNumber,
    jobNameOriginal: r.jobNameOriginal,
    shipperNameOriginal: r.shipperNameOriginal,
    employeeNameOriginal: r.employeeNameOriginal,
    vehicleNumber:
      r.vehicleNumberOriginal.trim() ||
      r.vehicleNumberFilled?.trim() ||
      "—",
    revenueAmount: r.revenueAmount ?? 0,
  };
}

type FmBucket = {
  primary: FmEmployeeScheduleStagingRecord[];
  aggregate: FmEmployeeScheduleStagingRecord[];
};

function bucketKey(businessDate: string, courseId: string): string {
  return `${businessDate}|${courseId}`;
}

function buildFmBuckets(
  fmRecords: FmEmployeeScheduleStagingRecord[],
): Map<string, FmBucket> {
  const buckets = new Map<string, FmBucket>();
  const eligible = filterFmRowsForReconciliation(fmRecords);

  for (const record of eligible) {
    const mapping = resolveFmJobCourseMapping(record.jobNameOriginal);
    if (!mapping) continue;

    const key = bucketKey(record.businessDate, mapping.courseId);
    const bucket = buckets.get(key) ?? { primary: [], aggregate: [] };

    const aggregateJobs = getAggregateJobsForCourse(mapping.courseId);
    if (aggregateJobs.includes(record.jobNameOriginal.trim())) {
      bucket.aggregate.push(record);
    } else {
      bucket.primary.push(record);
    }
    buckets.set(key, bucket);
  }

  return buckets;
}

function resolveFmMatch(
  shiga: ShigaDeliveryStagingRecord,
  bucket: FmBucket | undefined,
  consumedFmIds: Set<string>,
): {
  fmRecords: ShigaFmMatchedFmRow[];
  fmJobNames: string[];
  status: ShigaFmMatchStatus;
  matchNotes: string[];
  mismatchReasons: string[];
} {
  if (!bucket) {
    return {
      fmRecords: [],
      fmJobNames: [],
      status: "shiga_only",
      matchNotes: [],
      mismatchReasons: ["FM側に該当行がありません"],
    };
  }

  const payment = shiga.coursePayTotal;
  const primary = bucket.primary.filter((r) => !consumedFmIds.has(r.id));
  const aggregate = bucket.aggregate.filter((r) => !consumedFmIds.has(r.id));

  const primarySum = primary.reduce((s, r) => s + (r.revenueAmount ?? 0), 0);

  if (primary.length > 0 && amountsNearlyEqual(primarySum, payment)) {
    const status: ShigaFmMatchStatus =
      primary.length === 1 ? "matched" : "matched_sum";
    for (const r of primary) consumedFmIds.add(r.id);
    return {
      fmRecords: primary.map(toFmMatchedRow),
      fmJobNames: primary.map((r) => r.jobNameOriginal),
      status,
      matchNotes:
        primary.length > 1
          ? [`FM売上合算 ${primarySum.toLocaleString()}円`]
          : [],
      mismatchReasons: [],
    };
  }

  if (shiga.courseId === "SHIGA_04" && aggregate.length > 0) {
    const combined = [...primary, ...aggregate];
    const combinedSum = combined.reduce(
      (s, r) => s + (r.revenueAmount ?? 0),
      0,
    );
    if (combined.length > 0 && amountsNearlyEqual(combinedSum, payment)) {
      for (const r of combined) consumedFmIds.add(r.id);
      return {
        fmRecords: combined.map(toFmMatchedRow),
        fmJobNames: combined.map((r) => r.jobNameOriginal),
        status: "matched_sum",
        matchNotes: [
          `Joshin④+⑤合算: ${combined
            .map((r) => `${r.jobNameOriginal} ${(r.revenueAmount ?? 0).toLocaleString()}円`)
            .join(" + ")} = ${combinedSum.toLocaleString()}円`,
        ],
        mismatchReasons: [],
      };
    }
  }

  const allAvailable = [...primary, ...aggregate];
  if (allAvailable.length === 0) {
    return {
      fmRecords: [],
      fmJobNames: [],
      status: "shiga_only",
      matchNotes: [],
      mismatchReasons: ["FM側の該当行はすべて他明細で消費済み"],
    };
  }

  const sales = allAvailable.reduce((s, r) => s + (r.revenueAmount ?? 0), 0);
  for (const r of allAvailable) consumedFmIds.add(r.id);
  return {
    fmRecords: allAvailable.map(toFmMatchedRow),
    fmJobNames: allAvailable.map((r) => r.jobNameOriginal),
    status: "amount_mismatch",
    matchNotes: [],
    mismatchReasons: [
      `FM売上 ${sales.toLocaleString()}円 ≠ 滋賀支払 ${payment.toLocaleString()}円`,
    ],
  };
}

function buildRowFromShiga(
  shiga: ShigaDeliveryStagingRecord,
  match: ReturnType<typeof resolveFmMatch>,
): ShigaFmReconciliationRow {
  const sales = sumFmRevenue(match.fmRecords);
  const payment = shiga.coursePayTotal;
  const profit =
    match.status === "shiga_only"
      ? buildProfitFields(0, payment)
      : buildProfitFields(sales, payment);

  return {
    id: crypto.randomUUID(),
    matchKey: shiga.joinKey,
    businessDate: shiga.businessDate,
    courseId: shiga.courseId,
    courseName: shiga.courseName,
    vendorCode: shiga.vendorCode,
    vendorName: shiga.vendorName,
    ...legacyRowExtras(shiga, match.fmJobNames),
    status: match.status,
    salesAmount: match.status === "shiga_only" ? 0 : sales,
    paymentAmount: payment,
    grossProfitAmount: profit.grossProfitAmount,
    grossProfitRate: profit.grossProfitRate,
    shigaRecord: shiga,
    fmRecords: match.fmRecords,
    fmJobNames: match.fmJobNames,
    mismatchReasons: match.mismatchReasons,
    matchNotes: match.matchNotes,
  };
}

function buildFmOnlyRows(
  fmRecords: FmEmployeeScheduleStagingRecord[],
  consumedFmIds: Set<string>,
): ShigaFmReconciliationRow[] {
  const rows: ShigaFmReconciliationRow[] = [];

  for (const record of fmRecords) {
    if (consumedFmIds.has(record.id)) continue;
    if (!filterFmRowsForReconciliation([record]).length) continue;

    const mapping = resolveFmJobCourseMapping(record.jobNameOriginal);
    if (!mapping) continue;

    const vendor = normalizeFmShipperToVendor(record.shipperNameOriginal);
    if (!vendor) {
      rows.push({
        id: crypto.randomUUID(),
        matchKey: "",
        businessDate: record.businessDate,
        courseId: mapping.courseId,
        courseName: mapping.courseName,
        vendorCode: "",
        vendorName: record.shipperNameOriginal,
        ...legacyRowExtras(null, [record.jobNameOriginal]),
        status: "mapping_failed",
        salesAmount: record.revenueAmount ?? 0,
        paymentAmount: 0,
        ...buildProfitFields(record.revenueAmount ?? 0, 0),
        shigaRecord: null,
        fmRecords: [toFmMatchedRow(record)],
        fmJobNames: [record.jobNameOriginal],
        mismatchReasons: ["業者名の正規化に失敗しました"],
        matchNotes: [],
      });
      continue;
    }

    const matchKey = buildReconciliationMatchKey({
      vendorCode: vendor.vendorCode,
      vendorName: vendor.vendorName,
      courseId: mapping.courseId,
      businessDate: record.businessDate,
    });

    const sales = record.revenueAmount ?? 0;
    rows.push({
      id: crypto.randomUUID(),
      matchKey,
      businessDate: record.businessDate,
      courseId: mapping.courseId,
      courseName: mapping.courseName,
      vendorCode: vendor.vendorCode,
      vendorName: vendor.vendorName,
      ...legacyRowExtras(null, [record.jobNameOriginal]),
      status: "fm_only",
      salesAmount: sales,
      paymentAmount: 0,
      ...buildProfitFields(sales, 0),
      shigaRecord: null,
      fmRecords: [toFmMatchedRow(record)],
      fmJobNames: [record.jobNameOriginal],
      mismatchReasons: ["滋賀店配側に該当支払がありません"],
      matchNotes: [],
    });
  }

  return rows;
}

export function matchShigaFmRecords(input: {
  shigaRecords: ShigaDeliveryStagingRecord[];
  fmRecords: FmEmployeeScheduleStagingRecord[];
}): ShigaFmReconciliationRow[] {
  return matchShigaFmRecordsLegacy(input);
}

export function matchShigaFmRecordsLegacy(input: {
  shigaRecords: ShigaDeliveryStagingRecord[];
  fmRecords: FmEmployeeScheduleStagingRecord[];
}): ShigaFmReconciliationRow[] {
  const buckets = buildFmBuckets(input.fmRecords);
  const consumedFmIds = new Set<string>();
  const rows: ShigaFmReconciliationRow[] = [];

  const sortedShiga = [...input.shigaRecords].sort((a, b) => {
    const d = a.businessDate.localeCompare(b.businessDate);
    if (d !== 0) return d;
    return a.courseId.localeCompare(b.courseId);
  });

  for (const shiga of sortedShiga) {
    const key = bucketKey(shiga.businessDate, shiga.courseId);
    const bucket = buckets.get(key);
    const match = resolveFmMatch(shiga, bucket, consumedFmIds);
    rows.push(buildRowFromShiga(shiga, match));
  }

  const fmOnly = buildFmOnlyRows(input.fmRecords, consumedFmIds);
  rows.push(...fmOnly);

  return rows.sort((a, b) => {
    const d = a.businessDate.localeCompare(b.businessDate);
    if (d !== 0) return d;
    return (a.courseId ?? "").localeCompare(b.courseId ?? "");
  });
}

export function getCourseName(courseId: string): string {
  return (
    SHIGA_FM_COURSE_MAPPING.find((m) => m.courseId === courseId)?.courseName ??
    courseId
  );
}
