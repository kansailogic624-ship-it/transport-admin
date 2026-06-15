"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SHIGA_FM_COURSE_MAPPING } from "@/lib/import-preprocessor/shiga-fm-reconciliation/course-mapping";
import {
  buildPartnerJobOptions,
  courseIdsForJobNames,
  orphanSelectedJobNames,
} from "@/lib/partner-company-job-options";
import {
  assignedJobsToNames,
  buildShipperProfileForSave,
  enrichShipperProfileJobs,
  jobNamesForCourses,
  jobNamesToAssignedJobs,
} from "@/lib/shipper-company-utils";
import type {
  ShipperAssignedJob,
  ShipperCompanyProfile,
} from "@/lib/shipper-company-types";
import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";
import type { JobDetail } from "@/lib/types";
import { loadJobDetails } from "@/services/firestore-storage";
import { cn } from "@/lib/utils";
import { PartnerJobMultiSelect } from "./partner-job-multi-select";

const COURSE_OPTIONS = SHIGA_FM_COURSE_MAPPING.map((m) => ({
  id: m.courseId,
  label: `${m.courseName}（${m.courseId}）`,
}));

export type ShipperProfileFormState = {
  name: string;
  note: string;
  activeFlag: boolean;
  courseIds: ShigaDeliveryCourseId[];
  assignedJobs: ShipperAssignedJob[];
};

type ShipperCompanyProfileSectionProps = {
  profile: ShipperCompanyProfile | null;
  onChange: (state: ShipperProfileFormState, dirty: boolean) => void;
  onNavigateToJobLedger?: () => void;
  savedProfile: ShipperCompanyProfile | null;
};

export function ShipperCompanyProfileSection({
  profile,
  onChange,
  onNavigateToJobLedger,
  savedProfile,
}: ShipperCompanyProfileSectionProps) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [activeFlag, setActiveFlag] = useState(true);
  const [courseIds, setCourseIds] = useState<ShigaDeliveryCourseId[]>([]);
  const [assignedJobs, setAssignedJobs] = useState<ShipperAssignedJob[]>([]);
  const [ledgerJobs, setLedgerJobs] = useState<JobDetail[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [courseActionMessage, setCourseActionMessage] = useState<string | null>(
    null,
  );

  const jobNames = useMemo(
    () => assignedJobsToNames(assignedJobs),
    [assignedJobs],
  );

  const jobOptions = useMemo(
    () => buildPartnerJobOptions(ledgerJobs),
    [ledgerJobs],
  );

  const orphanJobNames = useMemo(
    () => orphanSelectedJobNames(jobNames, jobOptions),
    [jobNames, jobOptions],
  );

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      setLedgerJobs(await loadJobDetails());
    } catch {
      setLedgerJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    const base = profile
      ? enrichShipperProfileJobs(profile, ledgerJobs)
      : null;
    setName(base?.name ?? "");
    setNote(base?.note ?? "");
    setActiveFlag(base?.activeFlag ?? true);
    setCourseIds(base?.courseIds ?? []);
    setAssignedJobs(base?.assignedJobs ?? []);
    setCourseActionMessage(null);
  }, [profile, ledgerJobs]);

  const suggestedJobs = useMemo(
    () => jobNamesForCourses(courseIds),
    [courseIds],
  );

  const emitChange = useCallback(
    (
      next: Partial<{
        name: string;
        note: string;
        activeFlag: boolean;
        courseIds: ShigaDeliveryCourseId[];
        assignedJobs: ShipperAssignedJob[];
      }>,
    ) => {
      const state: ShipperProfileFormState = {
        name: next.name ?? name,
        note: next.note ?? note,
        activeFlag: next.activeFlag ?? activeFlag,
        courseIds: next.courseIds ?? courseIds,
        assignedJobs: next.assignedJobs ?? assignedJobs,
      };
      const saved = savedProfile
        ? enrichShipperProfileJobs(savedProfile, ledgerJobs)
        : null;
      const dirty =
        state.name !== (saved?.name ?? "") ||
        state.note !== (saved?.note ?? "") ||
        state.activeFlag !== (saved?.activeFlag ?? true) ||
        JSON.stringify(state.courseIds) !==
          JSON.stringify(saved?.courseIds ?? []) ||
        JSON.stringify(state.assignedJobs) !==
          JSON.stringify(saved?.assignedJobs ?? []);
      onChange(state, dirty);
    },
    [
      name,
      note,
      activeFlag,
      courseIds,
      assignedJobs,
      savedProfile,
      ledgerJobs,
      onChange,
    ],
  );

  const mergeCourseIds = (nextJobNames: string[]) => {
    const fromJobs = courseIdsForJobNames(nextJobNames);
    if (fromJobs.length === 0) return;
    setCourseIds((prev) => {
      const merged = [...new Set([...prev, ...fromJobs])];
      if (merged.length === prev.length) return prev;
      const added = fromJobs.filter((id) => !prev.includes(id));
      if (added.length > 0) {
        const labels = added
          .map((id) => COURSE_OPTIONS.find((c) => c.id === id)?.label ?? id)
          .join("、");
        setCourseActionMessage(`対象コースを自動追加しました: ${labels}`);
      }
      const next = merged;
      emitChange({ courseIds: next });
      return next;
    });
  };

  const handleAddJob = (jobName: string) => {
    const nextJob: ShipperAssignedJob = {
      jobName,
      jobId: resolveJobId(jobName, ledgerJobs),
    };
    setAssignedJobs((prev) => {
      if (prev.some((j) => j.jobName === jobName)) return prev;
      const next = [...prev, nextJob];
      mergeCourseIds(assignedJobsToNames(next));
      emitChange({ assignedJobs: next });
      return next;
    });
  };

  const handleRemoveJob = (jobName: string) => {
    setAssignedJobs((prev) => {
      const next = prev.filter((j) => j.jobName !== jobName);
      emitChange({ assignedJobs: next });
      return next;
    });
  };

  const toggleCourse = (courseId: ShigaDeliveryCourseId) => {
    setCourseIds((prev) => {
      const removing = prev.includes(courseId);
      const next = removing
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId];
      if (!removing) {
        const autoJobs = jobNamesForCourses([courseId]);
        setAssignedJobs((jobs) => {
          const merged = [...jobs];
          for (const jn of autoJobs) {
            if (!merged.some((j) => j.jobName === jn)) {
              merged.push({
                jobName: jn,
                jobId: resolveJobId(jn, ledgerJobs),
              });
            }
          }
          emitChange({ assignedJobs: merged, courseIds: next });
          return merged;
        });
        const label =
          COURSE_OPTIONS.find((c) => c.id === courseId)?.label ?? courseId;
        setCourseActionMessage(`対象コースを追加しました: ${label}`);
      } else {
        const label =
          COURSE_OPTIONS.find((c) => c.id === courseId)?.label ?? courseId;
        setCourseActionMessage(`対象コースを解除しました: ${label}`);
        emitChange({ courseIds: next });
      }
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <section id="shipper-section-basic" className="space-y-4 rounded-lg border p-4">
        <h3 className="text-base font-semibold">1. 基本情報</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>会社名</Label>
            <Input
              value={name}
              placeholder="例: 株式会社ABC物流"
              onChange={(e) => {
                setName(e.target.value);
                emitChange({ name: e.target.value });
              }}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>備考</Label>
            <Input
              value={note}
              placeholder="任意"
              onChange={(e) => {
                setNote(e.target.value);
                emitChange({ note: e.target.value });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>有効 / 無効</Label>
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  "cursor-pointer rounded-full border px-4 py-1.5 text-sm",
                  activeFlag
                    ? "border-emerald-500 bg-emerald-100 text-emerald-950"
                    : "border-border hover:bg-muted",
                )}
                onClick={() => {
                  setActiveFlag(true);
                  emitChange({ activeFlag: true });
                }}
              >
                有効
              </button>
              <button
                type="button"
                className={cn(
                  "cursor-pointer rounded-full border px-4 py-1.5 text-sm",
                  !activeFlag
                    ? "border-slate-500 bg-slate-200 text-slate-900"
                    : "border-border hover:bg-muted",
                )}
                onClick={() => {
                  setActiveFlag(false);
                  emitChange({ activeFlag: false });
                }}
              >
                無効
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="shipper-section-jobs" className="space-y-4 rounded-lg border p-4">
        <h3 className="text-base font-semibold">2. 対象業務</h3>
        <PartnerJobMultiSelect
          options={jobOptions}
          selected={jobNames.filter((j) => !orphanJobNames.includes(j))}
          orphanNames={orphanJobNames}
          loading={jobsLoading}
          onAdd={handleAddJob}
          onRemove={handleRemoveJob}
          onNavigateToJobLedger={onNavigateToJobLedger}
        />
      </section>

      <section id="shipper-section-courses" className="space-y-4 rounded-lg border p-4">
        <h3 className="text-base font-semibold">対象コース（滋賀店配突合）</h3>
        <p className="text-xs text-muted-foreground">
          Joshin系業務選択時に自動追加されます。手動で解除もできます。
        </p>
        {suggestedJobs.length > 0 && (
          <p className="text-xs text-emerald-800">
            コース候補: {suggestedJobs.join("、")}
          </p>
        )}
        {courseActionMessage && (
          <p className="text-xs text-indigo-800">{courseActionMessage}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {COURSE_OPTIONS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium",
                courseIds.includes(c.id)
                  ? "border-indigo-500 bg-indigo-100 text-indigo-950"
                  : "border-border hover:bg-muted",
              )}
              onClick={() => toggleCourse(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function resolveJobId(jobName: string, ledger: JobDetail[]): string | null {
  const found = ledger.find((j) => j.jobName.trim() === jobName.trim());
  return found?.jobId ?? null;
}

export function shipperProfileFormToProfile(
  form: ShipperProfileFormState,
  existing: ShipperCompanyProfile | null,
): ShipperCompanyProfile {
  return buildShipperProfileForSave({
    profile: existing,
    name: form.name,
    assignedJobs: form.assignedJobs,
    courseIds: form.courseIds,
    note: form.note,
    activeFlag: form.activeFlag,
  });
}
