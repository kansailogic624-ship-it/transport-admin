"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ShieldAlert, Upload } from "lucide-react";
import { EmployeeFormModal } from "@/components/employee-form-modal";
import { ImportDropZone } from "@/components/import-drop-zone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canAccessEmployeeLedger } from "@/lib/auth-access";
import {
  sortEmployees,
  suggestNextEmployeeId,
} from "@/lib/employee-ledger-utils";
import {
  formatEmployeeDate,
  parseEmployeeMasterSheet,
} from "@/lib/employee-master-parser";
import { sheetRowsFromFile } from "@/lib/spreadsheet-read";
import type { EmployeeDetail } from "@/lib/types";
import {
  loadEmployeeDetails,
  saveEmployeeDetails,
  upsertEmployeeDetail,
} from "@/services/firestore-storage";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

function maskLicense(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return value || "—";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

type EmployeeLedgerViewProps = {
  className?: string;
};

export function EmployeeLedgerView({ className }: EmployeeLedgerViewProps) {
  const { user } = useAuth();
  const allowed = canAccessEmployeeLedger(user?.email);

  const [employees, setEmployees] = useState<EmployeeDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRetired, setShowRetired] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeDetail | null>(
    null,
  );
  const [savingEmployee, setSavingEmployee] = useState(false);

  const suggestedEmployeeId = useMemo(
    () => suggestNextEmployeeId(employees),
    [employees],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadEmployeeDetails();
      setEmployees(rows);
    } catch (err) {
      console.error(err);
      setFeedback("社員台帳の読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    refresh().catch(console.error);
  }, [allowed, refresh]);

  const visibleEmployees = useMemo(() => {
    if (showRetired) return employees;
    return employees.filter((e) => e.activeFlag === 1);
  }, [employees, showRetired]);

  const activeCount = useMemo(
    () => employees.filter((e) => e.activeFlag === 1).length,
    [employees],
  );
  const retiredCount = employees.length - activeCount;

  const handleImport = useCallback(async () => {
    if (importFiles.length === 0) return;
    setImporting(true);
    setFeedback(null);
    try {
      const allEmployees: EmployeeDetail[] = [];
      const warnings: string[] = [];

      for (const file of importFiles) {
        const rows = await sheetRowsFromFile(file);
        const parsed = parseEmployeeMasterSheet(rows);
        allEmployees.push(...parsed.employees);
        for (const w of parsed.warnings) {
          warnings.push(`${file.name}: ${w}`);
        }
      }

      if (allEmployees.length === 0) {
        setFeedback("取り込める社員データがありませんでした。");
        return;
      }

      const byId = new Map<string, EmployeeDetail>();
      for (const emp of allEmployees) {
        byId.set(emp.id, emp);
      }
      const merged = [...byId.values()].sort((a, b) =>
        a.employeeId.localeCompare(b.employeeId, "ja"),
      );

      await saveEmployeeDetails(merged);
      setEmployees(merged);
      setImportFiles([]);
      const warnText =
        warnings.length > 0 ? `（警告 ${warnings.length} 件）` : "";
      setFeedback(`${merged.length} 名の社員データを取り込みました。${warnText}`);
    } catch (err) {
      console.error(err);
      setFeedback("インポートに失敗しました。");
    } finally {
      setImporting(false);
    }
  }, [importFiles]);

  const openCreateModal = useCallback(() => {
    setEditingEmployee(null);
    setModalMode("create");
  }, []);

  const openEditModal = useCallback((employee: EmployeeDetail) => {
    setEditingEmployee(employee);
    setModalMode("edit");
  }, []);

  const closeModal = useCallback(() => {
    if (savingEmployee) return;
    setModalMode(null);
    setEditingEmployee(null);
  }, [savingEmployee]);

  const handleSaveEmployee = useCallback(
    async (employee: EmployeeDetail) => {
      setSavingEmployee(true);
      setFeedback(null);
      try {
        await upsertEmployeeDetail(employee);
        setEmployees((prev) => {
          const withoutOld =
            modalMode === "edit" && editingEmployee
              ? prev.filter((e) => e.id !== editingEmployee.id)
              : prev.filter((e) => e.id !== employee.id);
          return sortEmployees([...withoutOld, employee]);
        });
        setModalMode(null);
        setEditingEmployee(null);
        setFeedback(
          modalMode === "create"
            ? `${employee.name} を登録しました。`
            : `${employee.name} の情報を更新しました。`,
        );
      } finally {
        setSavingEmployee(false);
      }
    },
    [modalMode, editingEmployee],
  );

  if (!allowed) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="size-5 text-amber-600" />
            アクセス権限がありません
          </CardTitle>
          <CardDescription>
            社員台帳は社長アカウントでのみ閲覧できます。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <Card>
        <CardHeader>
          <CardTitle>社員台帳</CardTitle>
          <CardDescription>
            社員マスタの個人情報を一覧表示します。在籍中（在籍フラグ=1）のみを初期表示し、退職者は切り替えで表示できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>
                登録 <span className="font-medium text-foreground">{employees.length}</span> 名
              </span>
              <span>
                在籍中 <span className="font-medium text-emerald-700">{activeCount}</span> 名
              </span>
              <span>
                退職・非在籍 <span className="font-medium text-foreground">{retiredCount}</span> 名
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={showRetired}
                  onCheckedChange={(checked) => setShowRetired(checked === true)}
                />
                退職者も表示
              </label>
              <Button
                type="button"
                className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                onClick={openCreateModal}
              >
                <Plus className="size-4" />
                新規社員登録
              </Button>
            </div>
          </div>

          {feedback && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              {feedback}
            </p>
          )}

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              読み込み中…
            </p>
          ) : visibleEmployees.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {employees.length === 0
                ? "社員データがありません。下のエリアから「社員マスタ.xlsx」を取り込んでください。"
                : "表示条件に一致する社員がいません。"}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">社員ID</TableHead>
                    <TableHead className="whitespace-nowrap">社員名</TableHead>
                    <TableHead className="whitespace-nowrap">ふりがな</TableHead>
                    <TableHead className="min-w-[10rem] whitespace-nowrap">住所</TableHead>
                    <TableHead className="whitespace-nowrap">生年月日</TableHead>
                    <TableHead className="whitespace-nowrap">雇入年月日</TableHead>
                    <TableHead className="whitespace-nowrap">選任年月日</TableHead>
                    <TableHead className="whitespace-nowrap">運転免許証</TableHead>
                    <TableHead className="whitespace-nowrap">在籍</TableHead>
                    <TableHead className="min-w-[8rem] whitespace-nowrap">退職理由</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEmployees.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-mono text-xs">
                        {emp.employeeId}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditModal(emp)}
                          className="cursor-pointer font-medium text-blue-600 underline-offset-2 transition-colors hover:text-blue-800 hover:underline"
                        >
                          {emp.name}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {emp.nameKana || "—"}
                      </TableCell>
                      <TableCell>{emp.address || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatEmployeeDate(emp.birthDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatEmployeeDate(emp.hireDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatEmployeeDate(emp.appointmentDate)}
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {maskLicense(emp.licenseNumber)}
                      </TableCell>
                      <TableCell>
                        {emp.activeFlag === 1 ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                            在籍
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            退職
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {emp.retirementReason || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="size-4" />
            社員マスタの取り込み
          </CardTitle>
          <CardDescription>
            「社員マスタ.xlsx」をドロップすると Firestore の employee_details
            コレクションへ反映します（既存データは上書き）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ImportDropZone
            hint="社員マスタ.xlsx をドロップ（またはクリック）"
            files={importFiles}
            onAdd={(list) => setImportFiles([...importFiles, ...Array.from(list)])}
            onClear={() => setImportFiles([])}
            accept=".xlsx,.xls"
            minHeightClass="h-36"
            accent="indigo"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={importFiles.length === 0 || importing}
              onClick={() => handleImport().catch(console.error)}
            >
              {importing ? "取り込み中…" : "Firestore へ取り込む"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {modalMode && (
        <EmployeeFormModal
          mode={modalMode}
          employee={editingEmployee}
          suggestedEmployeeId={suggestedEmployeeId}
          employees={employees}
          saving={savingEmployee}
          onSave={handleSaveEmployee}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
