/**
 * Amazon実績CSV × FileMakerスケジュール 合体ロジック
 */

import {
  buildEmployeeNameIndex,
  resolveCanonicalEmployeeName,
  type EmployeeNameIndex,
} from "./employee-name-resolve";
import {
  datesMatch,
  driverNamesMatch,
  normalizeIsoDate,
} from "./import-match-keys";
import { buildPartnerAmazonMemoFallback } from "./amazon-performance-record-payload";
import { newCrewMember } from "./crew-utils";
import {
  getRecordUnifiedCompanyName,
  isOwnCompanyName,
  normalizeOwnCompanyName,
  OWN_COMPANY_CANONICAL_NAME,
  ownCompaniesUnifiedMatch,
} from "./amazon-own-company";
import {
  amazonJobFromRouteLabel,
  classifyAmazonRouteType,
} from "./amazon-route-type";
import {
  normalizeAmazonPerformanceDate,
  type ParsedAmazonPerformanceRow,
} from "./amazon-performance-parser";
import type { DailyRecord, MasterData, TripEntry } from "./types";

export {
  getRecordUnifiedCompanyName,
  isOwnCompanyName,
  normalizeOwnCompanyName,
  OWN_COMPANY_CANONICAL_NAME,
  ownCompaniesUnifiedMatch,
} from "./amazon-own-company";

export type AmazonMergeKind = "own_update" | "own_new" | "partner_new";

export type AmazonMergeReviewRow = {
  id: string;
  kind: AmazonMergeKind;
  date: string;
  driverName: string;
  companyName: string;
  routeLabel: string;
  revenue: number;
  payment: number;
  diff: number;
  laborCost: number;
  memo: string;
  existingRecordId?: string;
};

export type AmazonMergeSummary = {
  total: number;
  ownUpdate: number;
  ownNew: number;
  partnerNew: number;
  /** 便名集計（2マン優先の if-else if 判定） */
  routeOneMan: number;
  routeTwoMan: number;
  routeOther: number;
};

function safeStr(value: string | null | undefined): string {
  return value == null ? "" : String(value);
}

export function isAmazonShipper(shipperName: string | null | undefined): boolean {
  const s = safeStr(shipperName).replace(/\s/g, "").trim().toLowerCase();
  if (!s) return false;
  return s === "amazon" || s.includes("amazon") || s.includes("アマゾン");
}

/** プレビュー・画面表示用の会社名 */
export function displayAmazonMergeCompanyName(
  companyName: string,
  kind: AmazonMergeKind,
): string {
  if (kind === "partner_new") return companyName.trim() || "—";
  return normalizeOwnCompanyName(companyName) || OWN_COMPANY_CANONICAL_NAME;
}

function tripIsAmazonBusiness(trip: TripEntry): boolean {
  if (isAmazonShipper(trip.shipperName)) return true;
  const job = safeStr(trip.jobName).replace(/\s/g, "");
  return /amazon|アマゾン/i.test(job);
}

function recordHasAmazonTrip(record: DailyRecord): boolean {
  if (record.trips.some(tripIsAmazonBusiness)) return true;
  return (record.fusionDispatchOptions ?? []).some(
    (o) =>
      isAmazonShipper(o.shipperName) ||
      /amazon|アマゾン/i.test(safeStr(o.dispatchName)),
  );
}

function recordMatchesDriverName(
  record: DailyRecord,
  driverName: string,
): boolean {
  if (driverNamesMatch(record.driverName ?? "", driverName)) return true;
  return record.trips.some((t) =>
    t.crew.some((c) => driverNamesMatch(c.name, driverName)),
  );
}

function isOwnFmRecord(record: DailyRecord): boolean {
  return record.operationType !== "partner";
}

/** 自社Excel行用: 日付×名前×統一自社名で既存FM／同バッチ自社行を検索 */
export function findAmazonFmRecord(
  records: DailyRecord[],
  date: string,
  driverName: string,
  extraDriverNames: string[] = [],
  csvCompanyName = "",
): DailyRecord | undefined {
  const safeDate = normalizeIsoDate(safeStr(date));
  if (!safeDate) return undefined;

  const driverCandidates = [
    safeStr(driverName),
    ...extraDriverNames.map((n) => safeStr(n)),
  ].filter(Boolean);
  if (driverCandidates.length === 0) return undefined;

  const unifiedCsvCompany = normalizeOwnCompanyName(csvCompanyName);
  const ownRecords = records.filter(isOwnFmRecord);
  const candidates = ownRecords.filter((r) => {
    if (!datesMatch(r.date ?? "", safeDate)) return false;
    if (!driverCandidates.some((name) => recordMatchesDriverName(r, name))) {
      return false;
    }
    if (unifiedCsvCompany) {
      return (
        getRecordUnifiedCompanyName(r) === unifiedCsvCompany ||
        ownCompaniesUnifiedMatch(csvCompanyName, getRecordUnifiedCompanyName(r))
      );
    }
    return true;
  });
  if (candidates.length === 0) return undefined;

  return (
    candidates.find((r) => recordHasAmazonTrip(r)) ?? candidates[0]
  );
}

function formatYenString(n: number): string {
  return n > 0 ? String(n) : "";
}

function buildAmazonTrip(
  csv: ParsedAmazonPerformanceRow,
  runType: "own" | "partner",
): TripEntry {
  const crew = newCrewMember(runType === "own" ? "employee" : "dispatch");
  crew.name = csv.driverName;
  const isPartner = runType === "partner";
  const partnerMemo = isPartner
    ? buildPartnerAmazonMemoFallback({
        companyName: csv.companyName,
        payment: csv.payment,
        diff: csv.diff,
        revenue: csv.revenue,
        routeLabel: csv.routeLabel,
        memo: csv.memo,
      })
    : csv.memo;

  return {
    id: crypto.randomUUID(),
    runType,
    vehicleNumber: "",
    shipperName: "Amazon",
    jobName: amazonJobFromRouteLabel(csv.routeLabel),
    revenue: formatYenString(csv.revenue),
    tollFee: "",
    startMeter: "",
    endMeter: "",
    crew: isPartner ? [] : [crew],
    partnerName: "",
    partnerFee: "",
    amazonDiff: csv.diff !== 0 ? String(csv.diff) : "",
    amazonMemo: partnerMemo,
    amazonLaborCost: csv.laborCost > 0 ? String(csv.laborCost) : "",
  };
}

function updateAmazonTripsFromCsv(
  record: DailyRecord,
  csv: ParsedAmazonPerformanceRow,
): DailyRecord {
  let updated = false;
  const trips = record.trips.map((t) => {
    if (!tripIsAmazonBusiness(t)) return t;
    updated = true;
    return {
      ...t,
      revenue: formatYenString(csv.revenue) || t.revenue,
      partnerFee:
        csv.payment > 0 ? formatYenString(csv.payment) : t.partnerFee,
      amazonDiff: csv.diff !== 0 ? String(csv.diff) : t.amazonDiff,
      amazonMemo: csv.memo || t.amazonMemo,
      amazonLaborCost:
        csv.laborCost > 0
          ? String(csv.laborCost)
          : t.amazonLaborCost,
      jobName: t.jobName || amazonJobFromRouteLabel(csv.routeLabel),
    };
  });

  if (!updated) {
    trips.push(buildAmazonTrip(csv, "own"));
  }

  return {
    ...record,
    trips,
    isFusionDraft: false,
  };
}

function buildNewOwnRecord(
  csv: ParsedAmazonPerformanceRow,
  driverName: string,
): DailyRecord {
  return {
    id: crypto.randomUUID(),
    date: csv.date,
    operationType: "own",
    driverName,
    clockIn: "",
    clockOut: "",
    rollCallTime: "",
    reportStatus: "not_required",
    trips: [buildAmazonTrip(csv, "own")],
    createdAt: new Date().toISOString(),
    isFusionDraft: false,
  };
}

function buildPartnerRecord(
  csv: ParsedAmazonPerformanceRow,
  driverName: string,
): DailyRecord {
  return {
    id: crypto.randomUUID(),
    date: csv.date,
    operationType: "partner",
    driverName,
    clockIn: "",
    clockOut: "",
    rollCallTime: "",
    reportStatus: "not_required",
    trips: [buildAmazonTrip(csv, "partner")],
    createdAt: new Date().toISOString(),
    isFusionDraft: false,
  };
}

function classifyRow(
  csv: ParsedAmazonPerformanceRow,
  existing: DailyRecord | undefined,
): AmazonMergeKind {
  if (!isOwnCompanyName(csv.companyName)) return "partner_new";
  if (existing) return "own_update";
  return "own_new";
}

export function mergeAmazonPerformance(
  csvRows: ParsedAmazonPerformanceRow[],
  records: DailyRecord[],
  masters: MasterData,
): {
  reviewRows: AmazonMergeReviewRow[];
  nextRecords: DailyRecord[];
  summary: AmazonMergeSummary;
  affectedRecordIds: string[];
} {
  const employeeIndex: EmployeeNameIndex = buildEmployeeNameIndex(
    [],
    masters,
  );
  const recordMap = new Map<string, DailyRecord>();
  for (const r of records) {
    recordMap.set(r.id, r);
  }

  const reviewRows: AmazonMergeReviewRow[] = [];
  const affectedIds = new Set<string>();
  const summary: AmazonMergeSummary = {
    total: 0,
    ownUpdate: 0,
    ownNew: 0,
    partnerNew: 0,
    routeOneMan: 0,
    routeTwoMan: 0,
    routeOther: 0,
  };

  for (const raw of csvRows) {
    const driverName = resolveCanonicalEmployeeName(
      raw.driverName,
      employeeIndex,
    );
    const normalizedDate = normalizeAmazonPerformanceDate(raw.date);
    const unifiedCompany = normalizeOwnCompanyName(raw.companyName);
    const csv = {
      ...raw,
      date: normalizedDate,
      driverName: driverName || raw.driverName,
      companyName: unifiedCompany || raw.companyName.trim(),
    };
    const isOwnRow = isOwnCompanyName(csv.companyName);
    const existing = isOwnRow
      ? findAmazonFmRecord(
          [...recordMap.values()],
          csv.date,
          csv.driverName,
          [raw.driverName],
          csv.companyName,
        )
      : undefined;
    const kind = classifyRow(csv, existing);

    if (kind === "own_update" && existing) {
      const updated = updateAmazonTripsFromCsv(existing, csv);
      recordMap.set(updated.id, updated);
      affectedIds.add(updated.id);
      summary.ownUpdate++;
    } else if (kind === "own_new") {
      const created = buildNewOwnRecord(csv, csv.driverName);
      recordMap.set(created.id, created);
      affectedIds.add(created.id);
      summary.ownNew++;
    } else {
      const created = buildPartnerRecord(csv, csv.driverName);
      recordMap.set(created.id, created);
      affectedIds.add(created.id);
      summary.partnerNew++;
    }

    summary.total++;
    const routeType = classifyAmazonRouteType(csv.routeLabel);
    if (routeType === "1マン") summary.routeOneMan++;
    else if (routeType === "2マン") summary.routeTwoMan++;
    else summary.routeOther++;

    reviewRows.push({
      id: crypto.randomUUID(),
      kind,
      date: csv.date,
      driverName: csv.driverName,
      companyName: isOwnRow
        ? normalizeOwnCompanyName(csv.companyName)
        : csv.companyName,
      routeLabel: csv.routeLabel,
      revenue: csv.revenue,
      payment: csv.payment,
      diff: csv.diff,
      laborCost: csv.laborCost,
      memo: csv.memo,
      existingRecordId: existing?.id,
    });
  }

  return {
    reviewRows,
    nextRecords: [...recordMap.values()],
    summary,
    affectedRecordIds: [...affectedIds],
  };
}

export function amazonMergeKindLabel(kind: AmazonMergeKind): string {
  switch (kind) {
    case "own_update":
      return "自社（FM上書き）";
    case "own_new":
      return "自社（新規追加）";
    case "partner_new":
      return "傭車（新規追加）";
  }
}

export function amazonMergeKindRowClass(kind: AmazonMergeKind): string {
  switch (kind) {
    case "own_update":
    case "own_new":
      return "bg-sky-50/80 hover:bg-sky-50";
    case "partner_new":
      return "bg-muted/50 hover:bg-muted/60";
  }
}
