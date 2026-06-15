"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SHIGA_FM_COURSE_MAPPING } from "@/lib/import-preprocessor/shiga-fm-reconciliation/course-mapping";
import {
  buildPartnerJobOptions,
  courseIdsForJobNames,
  orphanSelectedJobNames,
} from "@/lib/partner-company-job-options";
import {
  buildPartnerProfileForSave,
  jobNamesForCourses,
  jobNamesToAssignedJobs,
  upsertPartnerProfile,
} from "@/lib/partner-company-utils";
import type { PartnerCompanyProfile } from "@/lib/partner-company-types";
import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";
import type { JobDetail, MasterData } from "@/lib/types";
import { loadJobDetails } from "@/services/firestore-storage";
import { cn } from "@/lib/utils";
import { PartnerJobMultiSelect } from "./partner-job-multi-select";

type PartnerCompanyEditDialogProps = {
  open: boolean;
  profile: PartnerCompanyProfile | null;
  masters: MasterData;
  onClose: () => void;
  onSave: (masters: MasterData) => void;
  onNavigateToJobLedger?: () => void;
  onFeedback?: (message: string, detail?: string) => void;
};

const COURSE_OPTIONS = SHIGA_FM_COURSE_MAPPING.map((m) => ({
  id: m.courseId,
  label: `${m.courseName}（${m.courseId}）`,
}));

export function PartnerCompanyEditDialog({
  open,
  profile,
  masters,
  onClose,
  onSave,
  onNavigateToJobLedger,
  onFeedback,
}: PartnerCompanyEditDialogProps) {
  const [name, setName] = useState("");
  const [courseIds, setCourseIds] = useState<ShigaDeliveryCourseId[]>([]);
  const [jobNames, setJobNames] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [ledgerJobs, setLedgerJobs] = useState<JobDetail[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [courseActionMessage, setCourseActionMessage] = useState<string | null>(
    null,
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
      const rows = await loadJobDetails();
      setLedgerJobs(rows);
    } catch {
      setLedgerJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadJobs();
    if (profile) {
      setName(profile.name);
      setCourseIds(profile.courseIds);
      setJobNames(profile.assignedJobNames);
      setNote(profile.note ?? "");
    } else {
      setName("");
      setCourseIds([]);
      setJobNames([]);
      setNote("");
    }
    setCourseActionMessage(null);
  }, [open, profile, loadJobs]);

  const suggestedJobs = useMemo(
    () => jobNamesForCourses(courseIds),
    [courseIds],
  );

  const mergeCourseIds = useCallback(
    (nextJobNames: string[]) => {
      const fromJobs = courseIdsForJobNames(nextJobNames);
      if (fromJobs.length === 0) return;
      setCourseIds((prev) => {
        const merged = [...new Set([...prev, ...fromJobs])];
        if (merged.length === prev.length) return prev;
        const added = fromJobs.filter((id) => !prev.includes(id));
        if (added.length > 0) {
          const labels = added
            .map(
              (id) =>
                COURSE_OPTIONS.find((c) => c.id === id)?.label ?? id,
            )
            .join("、");
          setCourseActionMessage(`対象コースを自動追加しました: ${labels}`);
        }
        return merged;
      });
    },
    [],
  );

  const handleAddJob = useCallback(
    (jobName: string) => {
      setJobNames((prev) => {
        if (prev.includes(jobName)) return prev;
        const next = [...prev, jobName];
        mergeCourseIds(next);
        return next;
      });
    },
    [mergeCourseIds],
  );

  const handleRemoveJob = useCallback((jobName: string) => {
    setJobNames((prev) => prev.filter((j) => j !== jobName));
  }, []);

  const toggleCourse = (courseId: ShigaDeliveryCourseId) => {
    setCourseIds((prev) => {
      const removing = prev.includes(courseId);
      const next = removing
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId];
      if (!removing) {
        const autoJobs = jobNamesForCourses([courseId]);
        setJobNames((jobs) => {
          const merged = new Set([...jobs, ...autoJobs]);
          return [...merged];
        });
        const label =
          COURSE_OPTIONS.find((c) => c.id === courseId)?.label ?? courseId;
        setCourseActionMessage(`対象コースを追加しました: ${label}`);
      } else {
        const label =
          COURSE_OPTIONS.find((c) => c.id === courseId)?.label ?? courseId;
        setCourseActionMessage(`対象コースを解除しました: ${label}`);
      }
      return next;
    });
  };

  const handleNavigateToJobLedger = () => {
    onClose();
    onNavigateToJobLedger?.();
    onFeedback?.(
      "業務台帳タブへ移動しました",
      "マスタ登録 > 業務台帳で業務を登録できます",
    );
  };

  if (!open) return null;

  const handleSave = () => {
    if (!name.trim()) {
      window.alert("協力会社名を入力してください");
      return;
    }
    const nextProfile = buildPartnerProfileForSave({
      profile,
      name,
      assignedJobs: jobNamesToAssignedJobs(jobNames, ledgerJobs),
      courseIds,
      note,
      activeFlag: profile?.activeFlag ?? true,
    });
    onSave(upsertPartnerProfile(masters, nextProfile));
    onFeedback?.("協力会社を保存しました", nextProfile.name);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b bg-indigo-50/80 px-5 py-4">
          <h2 className="text-xl font-semibold text-indigo-950">
            {profile ? "協力会社を編集" : "協力会社を追加"}
          </h2>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            <Label>協力会社名</Label>
            <Input
              value={name}
              placeholder="例: 潤生輸送"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>依頼業務</Label>
            <p className="text-xs text-muted-foreground">
              業務台帳の業務から選択します（Joshin①〜⑥ は滋賀突合互換候補）
            </p>
            <PartnerJobMultiSelect
              options={jobOptions}
              selected={jobNames.filter((j) => !orphanJobNames.includes(j))}
              orphanNames={orphanJobNames}
              loading={jobsLoading}
              onAdd={handleAddJob}
              onRemove={handleRemoveJob}
              onNavigateToJobLedger={handleNavigateToJobLedger}
            />
          </div>

          <div className="space-y-2">
            <Label>対象コース（滋賀店配突合）</Label>
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
                    "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
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
          </div>

          <div className="space-y-2">
            <Label>備考</Label>
            <Input
              value={note}
              placeholder="任意"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleSave}>
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
