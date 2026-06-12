export type AliasType = "course" | "shipper" | "vehicle" | "employee";

export type AliasResolveStatus = "resolved" | "ambiguous" | "unresolved";

export type AliasContext = {
  shipperCanonicalId?: string;
  shipperCanonicalName?: string;
  regionCode?: string;
  primeContractorCode?: string;
  vehicleType?: string;
  courseBlockIndex?: number;
};

export type AliasResolveContext = {
  sourceSystem: string;
  businessDate?: string;
  shipperCanonicalName?: string;
  regionCode?: string;
  primeContractorCode?: string;
  vehicleType?: string;
  courseBlockIndex?: number;
  employeeCanonicalName?: string;
};

export type AliasMasterRecord = {
  id: string;
  aliasType: AliasType;
  aliasKey: string;
  aliasOriginal: string;
  canonicalId: string;
  canonicalName: string;
  priority: number;
  matchMode: "exact";
  sourceSystems: string[];
  context: AliasContext;
  isActive: boolean;
  confirmedByUser: boolean;
  hitCount: number;
};

export type AliasCandidate = {
  aliasId: string;
  canonicalName: string;
  score: number;
  reason: string;
};

export type AliasResolveResult = {
  status: AliasResolveStatus;
  canonicalId: string | null;
  canonicalName: string | null;
  matchedAliasId: string | null;
  candidates: AliasCandidate[];
  aliasKey: string;
};

export type AliasMasterStore = {
  records: AliasMasterRecord[];
  byTypeAndKey: Map<string, AliasMasterRecord[]>;
};

/** マスタ登録タブの台帳データ（Alias Engine の canonical 優先源） */
export type AliasLedgerSources = {
  employees?: import("@/lib/types").EmployeeDetail[];
  vehicles?: import("@/lib/types").VehicleDetail[];
  jobs?: import("@/lib/types").JobDetail[];
};
