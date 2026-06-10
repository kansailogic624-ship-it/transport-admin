import type { CrewMemberType, TripCrewMember } from "./types";

export function newCrewMember(
  memberType: CrewMemberType = "employee",
): TripCrewMember {
  return {
    id: crypto.randomUUID(),
    memberType,
    name: "",
    dailyCost: "",
  };
}
