/**
 * Amazon実績 CSV 便名（route_type）の標準化と判別
 */

export type AmazonRouteType = "1マン" | "2マン" | "other";

/** 便名文字列を判定用に標準化（全角→半角・trim・英字大文字化） */
export function normalizeAmazonRouteLabel(
  raw: string | null | undefined,
): string {
  return String(raw ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, "")
    .replace(/×/g, "X")
    .toUpperCase();
}

/**
 * 便名を 1マン / 2マン / other に分類。
 * if ~ else if で 2マン（HB）を最優先し、1件が両方にカウントされないようにする。
 */
export function classifyAmazonRouteType(
  raw: string | null | undefined,
): AmazonRouteType {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "other";

  const 便名 = normalizeAmazonRouteLabel(trimmed);

  // ①【最優先】2マン（HB）
  if (
    便名.includes("2マン") ||
    便名.includes("HB") ||
    trimmed.includes("２マン") ||
    trimmed.includes("ＨＢ")
  ) {
    return "2マン";
  }
  // ② 1マン（1×2 含む）— 2マンでない場合のみ
  else if (
    便名.includes("1マン") ||
    便名.includes("1X2") ||
    trimmed.includes("１マン") ||
    trimmed.includes("1×2")
  ) {
    return "1マン";
  }

  return "other";
}

/** 2マン（HB）か — classifyAmazonRouteType と同じ順序 */
export function isAmazonTwoManRoute(raw: string | null | undefined): boolean {
  return classifyAmazonRouteType(raw) === "2マン";
}

/** 1マン（1マン・1×2）か — 2マン判定後のみ true */
export function isAmazonOneManRoute(raw: string | null | undefined): boolean {
  return classifyAmazonRouteType(raw) === "1マン";
}

/** 便名ラベル列の 1マン / 2マン / other 件数（重複カウントなし） */
export function countAmazonRouteTypes(
  routeLabels: Iterable<string | null | undefined>,
): Record<AmazonRouteType, number> {
  const counts: Record<AmazonRouteType, number> = {
    "1マン": 0,
    "2マン": 0,
    other: 0,
  };
  for (const label of routeLabels) {
    counts[classifyAmazonRouteType(label)] += 1;
  }
  return counts;
}

/** 融合・保存用の jobName（Amazon LP / Amazon HB） */
export function amazonJobFromRouteLabel(
  routeLabel: string | null | undefined,
): string {
  const kind = classifyAmazonRouteType(routeLabel);
  if (kind === "2マン") return "Amazon HB";
  if (kind === "1マン") return "Amazon LP";
  const display = String(routeLabel ?? "").trim();
  if (display) return `Amazon ${display}`;
  return "Amazon";
}
