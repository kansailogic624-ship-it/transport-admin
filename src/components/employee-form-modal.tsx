"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isEmployeeIdTaken } from "@/lib/employee-ledger-utils";
import type { EmployeeDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

export type EmployeeFormDraft = {
  employeeId: string;
  name: string;
  nameKana: string;
  address: string;
  birthDate: string;
  hireDate: string;
  appointmentDate: string;
  licenseNumber: string;
  activeFlag: "0" | "1";
  retirementReason: string;
};

type EmployeeFormModalProps = {
  mode: "create" | "edit";
  employee: EmployeeDetail | null;
  suggestedEmployeeId: string;
  employees: EmployeeDetail[];
  saving?: boolean;
  onSave: (employee: EmployeeDetail) => Promise<void>;
  onClose: () => void;
};

function toDraft(
  employee: EmployeeDetail | null,
  suggestedEmployeeId: string,
): EmployeeFormDraft {
  if (!employee) {
    return {
      employeeId: suggestedEmployeeId,
      name: "",
      nameKana: "",
      address: "",
      birthDate: "",
      hireDate: "",
      appointmentDate: "",
      licenseNumber: "",
      activeFlag: "1",
      retirementReason: "",
    };
  }
  return {
    employeeId: employee.employeeId,
    name: employee.name,
    nameKana: employee.nameKana,
    address: employee.address,
    birthDate: employee.birthDate,
    hireDate: employee.hireDate,
    appointmentDate: employee.appointmentDate,
    licenseNumber: employee.licenseNumber,
    activeFlag: employee.activeFlag === 1 ? "1" : "0",
    retirementReason: employee.retirementReason,
  };
}

function draftToEmployee(
  draft: EmployeeFormDraft,
  existing: EmployeeDetail | null,
): EmployeeDetail {
  const employeeId = draft.employeeId.trim();
  return {
    id: existing?.id ?? employeeId,
    employeeId,
    name: draft.name.trim(),
    nameKana: draft.nameKana.trim(),
    address: draft.address.trim(),
    birthDate: draft.birthDate,
    hireDate: draft.hireDate,
    appointmentDate: draft.appointmentDate,
    licenseNumber: draft.licenseNumber.trim(),
    activeFlag: draft.activeFlag === "1" ? 1 : 0,
    retirementReason: draft.retirementReason.trim(),
    updatedAt: new Date().toISOString(),
  };
}

const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function EmployeeFormModal({
  mode,
  employee,
  suggestedEmployeeId,
  employees,
  saving = false,
  onSave,
  onClose,
}: EmployeeFormModalProps) {
  const [draft, setDraft] = useState<EmployeeFormDraft>(() =>
    toDraft(employee, suggestedEmployeeId),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toDraft(employee, suggestedEmployeeId));
    setError(null);
  }, [employee, suggestedEmployeeId, mode]);

  const title = useMemo(
    () => (mode === "create" ? "新規社員登録" : `${employee?.name ?? ""} の編集`),
    [mode, employee?.name],
  );

  const handleBackdropClick = () => {
    if (!saving) onClose();
  };

  const handleSubmit = async () => {
    const employeeId = draft.employeeId.trim();
    if (!employeeId) {
      setError("社員IDを入力してください。");
      return;
    }
    if (!draft.name.trim()) {
      setError("社員名を入力してください。");
      return;
    }
    if (
      isEmployeeIdTaken(
        employees,
        employeeId,
        mode === "edit" ? employee?.id : undefined,
      )
    ) {
      setError(`社員ID「${employeeId}」は既に使用されています。`);
      return;
    }

    setError(null);
    try {
      await onSave(draftToEmployee(draft, employee));
    } catch (err) {
      console.error(err);
      setError("保存に失敗しました。");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "modalIn 0.18s ease-out both" }}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === "create"
                ? "社員IDは自動採番されています。必要に応じて変更できます。"
                : "変更内容は Firestore に保存されます。"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="閉じる"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="employee-id">社員ID</Label>
              <Input
                id="employee-id"
                value={draft.employeeId}
                disabled={mode === "edit" || saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, employeeId: e.target.value }))
                }
                placeholder="例: 74"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="employee-name">社員名</Label>
              <Input
                id="employee-name"
                value={draft.name}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
                placeholder="例: 山田 太郎"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="employee-kana">ふりがな</Label>
              <Input
                id="employee-kana"
                value={draft.nameKana}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, nameKana: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="employee-address">住所</Label>
              <Input
                id="employee-address"
                value={draft.address}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, address: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="employee-birth">生年月日</Label>
              <Input
                id="employee-birth"
                type="date"
                value={draft.birthDate}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, birthDate: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="employee-hire">雇入年月日</Label>
              <Input
                id="employee-hire"
                type="date"
                value={draft.hireDate}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, hireDate: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="employee-appointment">選任年月日</Label>
              <Input
                id="employee-appointment"
                type="date"
                value={draft.appointmentDate}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, appointmentDate: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="employee-license">運転免許証の番号</Label>
              <Input
                id="employee-license"
                value={draft.licenseNumber}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, licenseNumber: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="employee-active">在籍フラグ</Label>
              <select
                id="employee-active"
                className={fieldClass}
                value={draft.activeFlag}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    activeFlag: e.target.value === "1" ? "1" : "0",
                  }))
                }
              >
                <option value="1">1 — 在籍中</option>
                <option value="0">0 — 退職・非在籍</option>
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="employee-retirement">退職理由</Label>
              <Input
                id="employee-retirement"
                value={draft.retirementReason}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, retirementReason: e.target.value }))
                }
                placeholder="在籍中の場合は空欄で構いません"
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            閉じる
          </Button>
          <Button
            type="button"
            disabled={saving}
            className={cn(mode === "create" && "bg-blue-600 hover:bg-blue-700")}
            onClick={() => handleSubmit().catch(console.error)}
          >
            {saving
              ? "保存中…"
              : mode === "create"
                ? "登録"
                : "保存"}
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
}
