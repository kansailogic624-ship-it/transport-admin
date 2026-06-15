import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";

export type PartnerAssignedJob = {
  /** 業務台帳の jobId（照合できない場合は null） */
  jobId: string | null;
  /** 突合・表示用（必須） */
  jobName: string;
};

export type PartnerCompanyProfile = {
  id: string;
  name: string;
  /** 依頼業務（正本） */
  assignedJobs: PartnerAssignedJob[];
  /** 互換・突合用（assignedJobs と同期） */
  assignedJobNames: string[];
  courseIds: ShigaDeliveryCourseId[];
  note: string | null;
  activeFlag: boolean;
  createdAt: string;
  updatedAt: string;
};

export function createPartnerCompanyId(): string {
  return crypto.randomUUID();
}
