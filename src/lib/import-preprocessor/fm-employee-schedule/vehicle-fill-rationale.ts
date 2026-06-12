import type { VehicleFillCandidate } from "./manual-vehicle-fill";
import type { FmVehicleFillRationale } from "./types";

export function normalizeMatchScorePercent(
  score: number,
  maxScore: number,
): number {
  if (maxScore <= 0) return score > 0 ? 100 : 0;
  return Math.min(100, Math.round((score / maxScore) * 100));
}

export function buildVehicleFillRationale(input: {
  candidate: VehicleFillCandidate | null;
  allCandidates: VehicleFillCandidate[];
  manualEntry?: boolean;
}): FmVehicleFillRationale {
  const { candidate, allCandidates, manualEntry } = input;
  const maxScore = Math.max(...allCandidates.map((c) => c.score), 1);
  const percent = candidate
    ? normalizeMatchScorePercent(candidate.score, maxScore)
    : 0;

  const basisLines: string[] = ["同日", "同社員"];
  if (manualEntry || !candidate) {
    basisLines.push("手入力");
  } else {
    basisLines.push(`候補一致率 ${percent}%`);
    if (candidate.sourceRowNumber) {
      basisLines.push(`元行: ${candidate.sourceRowNumber}`);
    }
  }

  return {
    kind: "vehicle_fill",
    sameDay: true,
    sameEmployee: true,
    sourceRowNumber: candidate?.sourceRowNumber ?? 0,
    matchScorePercent: percent,
    matchScoreLabel: manualEntry || !candidate ? "手入力" : `候補一致率 ${percent}%`,
    basisLines,
  };
}
