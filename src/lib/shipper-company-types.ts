import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";

export type ShipperAssignedJob = {
  jobId: string | null;
  jobName: string;
};

export type ShipperCompanyProfile = {
  id: string;
  name: string;
  assignedJobs: ShipperAssignedJob[];
  assignedJobNames: string[];
  courseIds: ShigaDeliveryCourseId[];
  note: string | null;
  activeFlag: boolean;
  createdAt: string;
  updatedAt: string;
};

export function createShipperCompanyId(): string {
  return crypto.randomUUID();
}
