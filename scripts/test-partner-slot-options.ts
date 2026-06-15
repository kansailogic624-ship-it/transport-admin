/**
 * 傭車入力の協力会社分類テスト
 * npx tsx scripts/test-partner-slot-options.ts
 */
import {
  classifyPartnerOptionsForSlot,
  isRecommendedPartnerForSlot,
  needsCourseMismatchConfirm,
  partnerJobMismatchNote,
} from "../src/lib/partner-slot-partner-options";
import type { PartnerCompanyProfile } from "../src/lib/partner-company-types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function profile(
  partial: Partial<PartnerCompanyProfile> & Pick<PartnerCompanyProfile, "id" | "name">,
): PartnerCompanyProfile {
  const now = new Date().toISOString();
  return {
    assignedJobs: [],
    assignedJobNames: [],
    courseIds: [],
    note: null,
    activeFlag: true,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function main() {
  const junsei = profile({
    id: "junsei",
    name: "潤生輸送",
    courseIds: ["SHIGA_02"],
    assignedJobNames: ["Joshin②"],
  });

  const smt = profile({
    id: "smt",
    name: "SMT",
    courseIds: ["SHIGA_04"],
    assignedJobNames: ["Joshin④"],
  });

  const g02 = classifyPartnerOptionsForSlot(
    [junsei, smt],
    "SHIGA_02",
    "Joshin②",
  );
  assert(g02.recommended.length === 1 && g02.recommended[0]!.id === "junsei", "g02 recommended");
  assert(g02.other.length === 1 && g02.other[0]!.id === "smt", "g02 other");

  const g04 = classifyPartnerOptionsForSlot(
    [junsei, smt],
    "SHIGA_04",
    "Joshin④",
  );
  assert(g04.recommended.length === 1 && g04.recommended[0]!.id === "smt", "g04 recommended");
  assert(g04.other.length === 1 && g04.other[0]!.id === "junsei", "g04 other junsei");

  assert(
    isRecommendedPartnerForSlot(junsei, "SHIGA_02", "Joshin②"),
    "junsei recommended 02",
  );
  assert(
    !isRecommendedPartnerForSlot(junsei, "SHIGA_04", "Joshin④"),
    "junsei not recommended 04",
  );
  assert(needsCourseMismatchConfirm(junsei, "SHIGA_04"), "junsei course mismatch 04");
  assert(!needsCourseMismatchConfirm(junsei, "SHIGA_02"), "junsei no mismatch 02");

  const courseOnly = profile({
    id: "co",
    name: "コースのみ一致",
    courseIds: ["SHIGA_02"],
    assignedJobNames: ["Joshin①"],
  });
  const note = partnerJobMismatchNote(courseOnly, "SHIGA_02", "Joshin②");
  assert(note?.includes("業務は未登録"), `job mismatch note ${note}`);

  const inactive = profile({
    id: "off",
    name: "無効社",
    activeFlag: false,
  });
  const emptyInactive = classifyPartnerOptionsForSlot([inactive], "SHIGA_02", "Joshin②");
  assert(emptyInactive.emptyReason === "all_inactive", "all inactive");

  const junsei03 = profile({
    id: "junsei03",
    name: "潤生輸送",
    courseIds: ["SHIGA_03"],
    assignedJobNames: ["Joshin③"],
  });

  const g03 = classifyPartnerOptionsForSlot(
    [junsei03],
    "SHIGA_03",
    "Joshin③",
  );
  assert(
    g03.recommended.length === 1 && g03.recommended[0]!.name === "潤生輸送",
    "g03 junsei recommended",
  );

  console.log("OK partner slot options", {
    g02: { rec: g02.recommended.map((p) => p.name), other: g02.other.map((p) => p.name) },
    g04: { rec: g04.recommended.map((p) => p.name), other: g04.other.map((p) => p.name) },
    g03: { rec: g03.recommended.map((p) => p.name) },
  });
}

main();
