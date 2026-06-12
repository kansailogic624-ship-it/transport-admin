import { normalizeCompanyNameKey } from "@/lib/amazon-own-company";
import { normalizeDriverName } from "@/lib/driving-report-parser";
import { loadVehicleMappingRules } from "@/lib/vehicle-mapping-rules";
import type {
  EmployeeDetail,
  JobDetail,
  MasterData,
  VehicleDetail,
  VehicleMappingRule,
} from "@/lib/types";
import { normalizeAliasKey } from "./normalize-alias-key";
import type {
  AliasContext,
  AliasLedgerSources,
  AliasMasterRecord,
  AliasMasterStore,
  AliasType,
} from "./types";

/** canonical 解決の優先度（数値が大きいほど優先） */
const PRIORITY = {
  ledger: 200,
  masterData: 100,
  jobShipperSupplement: 95,
  employeeSalary: 80,
  learningRule: 60,
} as const;

function makeId(aliasType: AliasType, aliasKey: string, scope = ""): string {
  const scopePart = scope ? `:${scope}` : "";
  return `${aliasType}:${aliasKey.slice(0, 16)}${scopePart}`;
}

function pushRecord(
  records: AliasMasterRecord[],
  byTypeAndKey: Map<string, AliasMasterRecord[]>,
  record: AliasMasterRecord,
): void {
  const bucketKey = `${record.aliasType}:${record.aliasKey}`;
  const bucket = byTypeAndKey.get(bucketKey) ?? [];
  const duplicate = bucket.some(
    (existing) =>
      existing.canonicalName === record.canonicalName &&
      existing.canonicalId === record.canonicalId,
  );
  if (duplicate) return;

  records.push(record);
  bucket.push(record);
  byTypeAndKey.set(bucketKey, bucket);
}

function registerExact(
  records: AliasMasterRecord[],
  byTypeAndKey: Map<string, AliasMasterRecord[]>,
  input: {
    aliasType: AliasType;
    aliasOriginal: string;
    canonicalId: string;
    canonicalName: string;
    priority?: number;
    sourceSystems?: string[];
    confirmedByUser?: boolean;
    context?: AliasContext;
    idScope?: string;
  },
): void {
  const aliasKey = normalizeAliasKey(input.aliasType, input.aliasOriginal);
  if (!aliasKey || !input.canonicalName.trim()) return;

  pushRecord(records, byTypeAndKey, {
    id: makeId(input.aliasType, aliasKey, input.idScope ?? ""),
    aliasType: input.aliasType,
    aliasKey,
    aliasOriginal: input.aliasOriginal.trim(),
    canonicalId: input.canonicalId,
    canonicalName: input.canonicalName.trim(),
    priority: input.priority ?? PRIORITY.masterData,
    matchMode: "exact",
    sourceSystems: input.sourceSystems ?? [],
    context: input.context ?? {},
    isActive: true,
    confirmedByUser: input.confirmedByUser ?? true,
    hitCount: 0,
  });
}

function registerLedgerEmployees(
  records: AliasMasterRecord[],
  byTypeAndKey: Map<string, AliasMasterRecord[]>,
  employees: EmployeeDetail[],
): void {
  for (const employee of employees) {
    if (employee.activeFlag !== 1) continue;
    const name = employee.name.trim();
    if (!name) continue;
    registerExact(records, byTypeAndKey, {
      aliasType: "employee",
      aliasOriginal: name,
      canonicalId: employee.employeeId,
      canonicalName: name,
      priority: PRIORITY.ledger,
      idScope: employee.employeeId,
    });
  }
}

function registerLedgerVehicles(
  records: AliasMasterRecord[],
  byTypeAndKey: Map<string, AliasMasterRecord[]>,
  vehicles: VehicleDetail[],
): void {
  for (const vehicle of vehicles) {
    const canonicalName =
      vehicle.plateNumber.trim() || vehicle.vehicleCode.trim();
    if (!canonicalName) continue;

    const aliasForms = new Set<string>();
    for (const raw of [vehicle.vehicleCode, vehicle.plateNumber, vehicle.vehicleId]) {
      const trimmed = raw.trim();
      if (trimmed) aliasForms.add(trimmed);
    }

    for (const aliasOriginal of aliasForms) {
      registerExact(records, byTypeAndKey, {
        aliasType: "vehicle",
        aliasOriginal,
        canonicalId: vehicle.vehicleId,
        canonicalName,
        priority: PRIORITY.ledger,
        idScope: vehicle.vehicleId,
      });
    }
  }
}

function registerLedgerJobs(
  records: AliasMasterRecord[],
  byTypeAndKey: Map<string, AliasMasterRecord[]>,
  jobs: JobDetail[],
): void {
  const supplementalShippers = new Set<string>();

  for (const job of jobs) {
    const jobName = job.jobName.trim();
    const shipperName = job.shipperName.trim();
    if (!jobName) continue;

    if (shipperName) {
      supplementalShippers.add(shipperName);
    }

    registerExact(records, byTypeAndKey, {
      aliasType: "course",
      aliasOriginal: jobName,
      canonicalId: job.jobId,
      canonicalName: jobName,
      priority: PRIORITY.ledger,
      context: shipperName ? { shipperCanonicalName: shipperName } : {},
      idScope: job.jobId,
    });
  }

  for (const shipperName of supplementalShippers) {
    registerExact(records, byTypeAndKey, {
      aliasType: "shipper",
      aliasOriginal: shipperName,
      canonicalId: normalizeCompanyNameKey(shipperName),
      canonicalName: shipperName,
      priority: PRIORITY.jobShipperSupplement,
      idScope: shipperName,
    });
  }
}

function registerMasterData(
  records: AliasMasterRecord[],
  byTypeAndKey: Map<string, AliasMasterRecord[]>,
  masters: MasterData,
): void {
  for (const name of masters.drivers) {
    registerExact(records, byTypeAndKey, {
      aliasType: "employee",
      aliasOriginal: name,
      canonicalId: normalizeDriverName(name),
      canonicalName: name,
      priority: PRIORITY.masterData,
    });
  }

  for (const plate of masters.vehicles) {
    registerExact(records, byTypeAndKey, {
      aliasType: "vehicle",
      aliasOriginal: plate,
      canonicalId: plate,
      canonicalName: plate,
      priority: PRIORITY.masterData,
    });
  }

  for (const shipper of masters.shippers) {
    const id = normalizeCompanyNameKey(shipper);
    registerExact(records, byTypeAndKey, {
      aliasType: "shipper",
      aliasOriginal: shipper,
      canonicalId: id,
      canonicalName: shipper,
      priority: PRIORITY.masterData,
    });

    for (const job of masters.shipperJobs[shipper] ?? []) {
      registerExact(records, byTypeAndKey, {
        aliasType: "course",
        aliasOriginal: job,
        canonicalId: job,
        canonicalName: job,
        priority: PRIORITY.masterData,
        context: { shipperCanonicalName: shipper },
        sourceSystems: ["filemaker_employee_schedule", "filemaker_dispatch"],
      });
    }
  }
}

function registerEmployeeSalaries(
  records: AliasMasterRecord[],
  byTypeAndKey: Map<string, AliasMasterRecord[]>,
  masters: MasterData,
): void {
  for (const name of Object.keys(masters.employeeSalaries ?? {})) {
    registerExact(records, byTypeAndKey, {
      aliasType: "employee",
      aliasOriginal: name,
      canonicalId: normalizeDriverName(name),
      canonicalName: name,
      priority: PRIORITY.employeeSalary,
    });
  }
}

function registerVehicleRules(
  records: AliasMasterRecord[],
  byTypeAndKey: Map<string, AliasMasterRecord[]>,
  rules: VehicleMappingRule[],
): void {
  for (const rule of rules) {
    registerExact(records, byTypeAndKey, {
      aliasType: "vehicle",
      aliasOriginal: rule.rawVehicle,
      canonicalId: rule.canonicalVehicle,
      canonicalName: rule.canonicalVehicle,
      priority: PRIORITY.learningRule,
      sourceSystems: [],
      confirmedByUser: true,
    });
  }
}

/**
 * 台帳 + MasterData + 学習ルールから in-memory Alias Store を構築。
 * 優先度: 台帳 > MasterData > employeeSalaries > 学習ルール
 */
export function buildAliasMasterStore(
  masters?: MasterData | null,
  ledger?: AliasLedgerSources | null,
): AliasMasterStore {
  const records: AliasMasterRecord[] = [];
  const byTypeAndKey = new Map<string, AliasMasterRecord[]>();

  if (ledger?.employees?.length) {
    registerLedgerEmployees(records, byTypeAndKey, ledger.employees);
  }
  if (ledger?.vehicles?.length) {
    registerLedgerVehicles(records, byTypeAndKey, ledger.vehicles);
  }
  if (ledger?.jobs?.length) {
    registerLedgerJobs(records, byTypeAndKey, ledger.jobs);
  }

  if (masters) {
    registerMasterData(records, byTypeAndKey, masters);
    registerEmployeeSalaries(records, byTypeAndKey, masters);
  }

  registerVehicleRules(records, byTypeAndKey, loadVehicleMappingRules());

  return { records, byTypeAndKey };
}
