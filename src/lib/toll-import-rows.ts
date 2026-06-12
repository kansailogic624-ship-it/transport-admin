/**
 * 高速代CSVインポート — 車両未登録グループと内訳の状態管理
 */

export const TOLL_UNREGISTERED_LABEL = "車両未登録";

export type TollBreakdownItem = {
  id: string;
  /** CSV上の元の車番表記 */
  csvPlate: string;
  totalAmount: number;
  vehicleNumber: string;
  ocrHint: string;
};

export type TollImportRow = {
  id: string;
  kind: "matched" | "unregistered_group";
  vehicleNumber: string;
  ocrHint?: string;
  totalAmount: number;
  workDescription: string;
  /** 車両未登録グループのみ: 合算元の内訳 */
  breakdown?: TollBreakdownItem[];
};

export type TollImportEntryInput = {
  rawPlate: string;
  totalAmount: number;
  vehicleNumber: string;
  ocrHint: string;
};

function sumBreakdown(items: TollBreakdownItem[]): number {
  return items.reduce((s, i) => s + i.totalAmount, 0);
}

/** 案①: マスタ照合済みは独立行、未登録は1グループ行に合算 */
export function buildTollImportRows(
  entries: TollImportEntryInput[],
  workDescription: string,
): TollImportRow[] {
  const matchedMap = new Map<string, TollImportRow>();
  const unregisteredItems: TollBreakdownItem[] = [];

  for (const e of entries) {
    if (e.vehicleNumber) {
      const prev = matchedMap.get(e.vehicleNumber);
      if (prev) {
        prev.totalAmount += e.totalAmount;
      } else {
        matchedMap.set(e.vehicleNumber, {
          id: crypto.randomUUID(),
          kind: "matched",
          vehicleNumber: e.vehicleNumber,
          ocrHint: "",
          totalAmount: e.totalAmount,
          workDescription,
        });
      }
      continue;
    }

    unregisteredItems.push({
      id: crypto.randomUUID(),
      csvPlate: e.rawPlate,
      totalAmount: e.totalAmount,
      vehicleNumber: "",
      ocrHint: e.ocrHint || e.rawPlate,
    });
  }

  const rows = [...matchedMap.values()].sort(
    (a, b) => b.totalAmount - a.totalAmount,
  );

  if (unregisteredItems.length > 0) {
    rows.push({
      id: crypto.randomUUID(),
      kind: "unregistered_group",
      vehicleNumber: "",
      ocrHint: TOLL_UNREGISTERED_LABEL,
      totalAmount: sumBreakdown(unregisteredItems),
      workDescription,
      breakdown: unregisteredItems,
    });
  }

  return rows;
}

/** 内訳に車両を割り当て → 未登録合算から差し引き、正しい車両行へ移動 */
export function assignBreakdownVehicle(
  rows: TollImportRow[],
  groupRowId: string,
  breakdownItemId: string,
  vehicleNumber: string,
): TollImportRow[] {
  const plate = vehicleNumber.trim();
  if (!plate) {
    return rows.map((r) => {
      if (r.id !== groupRowId || r.kind !== "unregistered_group") return r;
      return {
        ...r,
        breakdown: r.breakdown?.map((b) =>
          b.id === breakdownItemId ? { ...b, vehicleNumber: "", ocrHint: b.csvPlate } : b,
        ),
      };
    });
  }

  let movedItem: TollBreakdownItem | undefined;
  let workDescription = "高速代";

  const withoutItem = rows.flatMap((r) => {
    if (r.id !== groupRowId || r.kind !== "unregistered_group") return [r];
    workDescription = r.workDescription;
    const item = r.breakdown?.find((b) => b.id === breakdownItemId);
    if (!item) return [r];
    movedItem = { ...item, vehicleNumber: plate, ocrHint: "" };
    const remaining = r.breakdown!.filter((b) => b.id !== breakdownItemId);
    if (remaining.length === 0) return [];
    return [
      {
        ...r,
        breakdown: remaining,
        totalAmount: sumBreakdown(remaining),
      },
    ];
  });

  if (!movedItem) return rows;
  const moved = movedItem;

  const existingIdx = withoutItem.findIndex(
    (r) => r.kind === "matched" && r.vehicleNumber === plate,
  );

  if (existingIdx >= 0) {
    return withoutItem.map((r, i) =>
      i === existingIdx
        ? { ...r, totalAmount: r.totalAmount + moved!.totalAmount }
        : r,
    );
  }

  const newRow: TollImportRow = {
    id: crypto.randomUUID(),
    kind: "matched",
    vehicleNumber: plate,
    ocrHint: "",
    totalAmount: moved.totalAmount,
    workDescription,
  };

  return [...withoutItem, newRow].sort((a, b) => {
    if (a.kind === "unregistered_group" && b.kind !== "unregistered_group")
      return 1;
    if (b.kind === "unregistered_group" && a.kind !== "unregistered_group")
      return -1;
    return b.totalAmount - a.totalAmount;
  });
}

export function updateTollMatchedRow(
  rows: TollImportRow[],
  id: string,
  patch: Partial<Pick<TollImportRow, "vehicleNumber" | "totalAmount" | "ocrHint">>,
): TollImportRow[] {
  return rows.map((r) =>
    r.id === id && r.kind === "matched" ? { ...r, ...patch } : r,
  );
}

export function removeTollImportRow(
  rows: TollImportRow[],
  id: string,
): TollImportRow[] {
  return rows.filter((r) => r.id !== id);
}

export function countUnregisteredBreakdown(rows: TollImportRow[]): number {
  return rows
    .filter((r) => r.kind === "unregistered_group")
    .reduce((s, r) => s + (r.breakdown?.length ?? 0), 0);
}

/** 保存用: 確定済み車両行 + 残りの未登録合算 */
export function flattenTollImportRowsForSave(rows: TollImportRow[]): Array<{
  vehicleNumber: string;
  totalAmount: number;
  workDescription: string;
  ocrHint?: string;
}> {
  const matched = new Map<
    string,
    {
      vehicleNumber: string;
      totalAmount: number;
      workDescription: string;
      ocrHint?: string;
    }
  >();

  for (const r of rows) {
    if (r.kind === "matched" && r.totalAmount > 0) {
      const key = r.vehicleNumber;
      const prev = matched.get(key);
      if (prev) {
        prev.totalAmount += r.totalAmount;
      } else {
        matched.set(key, {
          vehicleNumber: r.vehicleNumber,
          totalAmount: r.totalAmount,
          workDescription: r.workDescription,
        });
      }
    }
  }

  const out = [...matched.values()];

  for (const r of rows) {
    if (r.kind !== "unregistered_group" || r.totalAmount <= 0) continue;
    const plates = r.breakdown?.map((b) => b.csvPlate).join("、") ?? "";
    out.push({
      vehicleNumber: "",
      totalAmount: r.totalAmount,
      workDescription: r.workDescription,
      ocrHint: plates
        ? `${TOLL_UNREGISTERED_LABEL}（${plates}）`
        : TOLL_UNREGISTERED_LABEL,
    });
  }

  return out;
}

export function tollImportRowCount(rows: TollImportRow[]): number {
  const matched = rows.filter((r) => r.kind === "matched").length;
  const hasGroup = rows.some((r) => r.kind === "unregistered_group");
  return matched + (hasGroup ? 1 : 0);
}
