"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Upload } from "lucide-react";
import { ImportDropZone } from "@/components/import-drop-zone";
import { VehicleFormModal } from "@/components/vehicle-form-modal";
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
import { formatVehicleDate, parseVehicleMasterSheet } from "@/lib/vehicle-master-parser";
import {
  formatLoadKg,
  isInspectionAlert,
  isVehicleActive,
  sortVehicles,
  suggestNextVehicleId,
} from "@/lib/vehicle-ledger-utils";
import { sheetRowsFromFile } from "@/lib/spreadsheet-read";
import type { VehicleDetail } from "@/lib/types";
import {
  loadVehicleDetails,
  saveVehicleDetails,
  upsertVehicleDetail,
} from "@/services/firestore-storage";
import { cn } from "@/lib/utils";

const linkButtonClass =
  "cursor-pointer font-medium text-blue-600 underline-offset-2 transition-colors hover:text-blue-800 hover:underline";

type VehicleLedgerViewProps = {
  className?: string;
  showImport?: boolean;
};

export function VehicleLedgerView({
  className,
  showImport = true,
}: VehicleLedgerViewProps) {
  const [vehicles, setVehicles] = useState<VehicleDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<VehicleDetail | null>(
    null,
  );
  const [savingVehicle, setSavingVehicle] = useState(false);

  const suggestedVehicleId = useMemo(
    () => suggestNextVehicleId(vehicles),
    [vehicles],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadVehicleDetails();
      setVehicles(rows);
    } catch (err) {
      console.error(err);
      setFeedback("車両台帳の読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  const visibleVehicles = useMemo(() => {
    const filtered = showActiveOnly
      ? vehicles.filter(isVehicleActive)
      : vehicles;
    return sortVehicles(filtered);
  }, [vehicles, showActiveOnly]);

  const activeCount = useMemo(
    () => vehicles.filter(isVehicleActive).length,
    [vehicles],
  );
  const scrappedCount = vehicles.length - activeCount;

  const alertCount = useMemo(
    () =>
      visibleVehicles.filter((v) => isInspectionAlert(v.inspectionExpiry)).length,
    [visibleVehicles],
  );

  const openCreateModal = useCallback(() => {
    setEditingVehicle(null);
    setModalMode("create");
  }, []);

  const openEditModal = useCallback((vehicle: VehicleDetail) => {
    setEditingVehicle(vehicle);
    setModalMode("edit");
  }, []);

  const closeModal = useCallback(() => {
    if (savingVehicle) return;
    setModalMode(null);
    setEditingVehicle(null);
  }, [savingVehicle]);

  const handleSaveVehicle = useCallback(
    async (vehicle: VehicleDetail) => {
      setSavingVehicle(true);
      setFeedback(null);
      try {
        await upsertVehicleDetail(vehicle);
        setVehicles((prev) => {
          const withoutOld =
            modalMode === "edit" && editingVehicle
              ? prev.filter((v) => v.id !== editingVehicle.id)
              : prev.filter((v) => v.id !== vehicle.id);
          return sortVehicles([...withoutOld, vehicle]);
        });
        setModalMode(null);
        setEditingVehicle(null);
        setFeedback(
          modalMode === "create"
            ? `${vehicle.plateNumber || vehicle.vehicleCode} を登録しました。`
            : `${vehicle.plateNumber || vehicle.vehicleCode} の情報を更新しました。`,
        );
      } finally {
        setSavingVehicle(false);
      }
    },
    [modalMode, editingVehicle],
  );

  const handleImport = useCallback(async () => {
    if (importFiles.length === 0) return;
    setImporting(true);
    setFeedback(null);
    try {
      const allVehicles: VehicleDetail[] = [];
      const warnings: string[] = [];

      for (const file of importFiles) {
        const rows = await sheetRowsFromFile(file);
        const parsed = parseVehicleMasterSheet(rows);
        allVehicles.push(...parsed.vehicles);
        for (const w of parsed.warnings) {
          warnings.push(`${file.name}: ${w}`);
        }
      }

      if (allVehicles.length === 0) {
        setFeedback("取り込める車両データがありませんでした。");
        return;
      }

      const byId = new Map<string, VehicleDetail>();
      for (const vehicle of allVehicles) {
        byId.set(vehicle.id, vehicle);
      }
      const merged = sortVehicles([...byId.values()]);

      await saveVehicleDetails(merged);
      setVehicles(merged);
      setImportFiles([]);
      const warnText =
        warnings.length > 0 ? `（警告 ${warnings.length} 件）` : "";
      setFeedback(`${merged.length} 台の車両データを取り込みました。${warnText}`);
    } catch (err) {
      console.error(err);
      setFeedback("インポートに失敗しました。");
    } finally {
      setImporting(false);
    }
  }, [importFiles]);

  return (
    <div className={cn("space-y-6", className)}>
      <Card>
        <CardHeader>
          <CardTitle>車両台帳</CardTitle>
          <CardDescription>
            車両マスタの情報を一覧管理します。稼働中（廃車年月日が空欄）のみを初期表示し、車検期限が30日以内の車両は警告表示します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>
                登録{" "}
                <span className="font-medium text-foreground">
                  {vehicles.length}
                </span>{" "}
                台
              </span>
              <span>
                稼働中{" "}
                <span className="font-medium text-emerald-700">{activeCount}</span>{" "}
                台
              </span>
              <span>
                廃車済{" "}
                <span className="font-medium text-foreground">{scrappedCount}</span>{" "}
                台
              </span>
              {alertCount > 0 && (
                <span className="flex items-center gap-1 font-medium text-red-700">
                  <AlertTriangle className="size-3.5" />
                  車検アラート {alertCount} 台
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={showActiveOnly}
                  onCheckedChange={(checked) =>
                    setShowActiveOnly(checked === true)
                  }
                />
                稼働中のみ表示
              </label>
              <Button
                type="button"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                onClick={openCreateModal}
              >
                <Plus className="size-4" />
                新規車両登録
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
          ) : visibleVehicles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {vehicles.length === 0
                ? "車両データがありません。下のエリアから「車両マスタ.xlsx」を取り込むか、新規登録してください。"
                : "表示条件に一致する車両がありません。"}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">車両ID</TableHead>
                    <TableHead className="whitespace-nowrap">車両番号</TableHead>
                    <TableHead className="whitespace-nowrap">車輛番号</TableHead>
                    <TableHead className="whitespace-nowrap">トン数</TableHead>
                    <TableHead className="whitespace-nowrap">車名</TableHead>
                    <TableHead className="whitespace-nowrap">形式</TableHead>
                    <TableHead className="whitespace-nowrap">車検有効期限</TableHead>
                    <TableHead className="whitespace-nowrap">初年度</TableHead>
                    <TableHead className="whitespace-nowrap">積載量</TableHead>
                    <TableHead className="whitespace-nowrap">総重量</TableHead>
                    <TableHead className="whitespace-nowrap">登録年月日</TableHead>
                    <TableHead className="whitespace-nowrap">廃車年月日</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleVehicles.map((vehicle) => {
                    const inspectionWarning = isInspectionAlert(
                      vehicle.inspectionExpiry,
                    );
                    return (
                      <TableRow
                        key={vehicle.id}
                        className={cn(
                          inspectionWarning && "bg-red-50/80 hover:bg-red-50",
                        )}
                      >
                        <TableCell className="font-mono text-xs">
                          {vehicle.vehicleId}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditModal(vehicle)}
                            className={linkButtonClass}
                          >
                            {vehicle.vehicleCode || "—"}
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditModal(vehicle)}
                            className={linkButtonClass}
                          >
                            {vehicle.plateNumber || "—"}
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {vehicle.tonnageDisplay || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {vehicle.vehicleName || "—"}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate text-xs">
                          {vehicle.modelType || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              inspectionWarning && "font-medium text-red-700",
                            )}
                          >
                            {inspectionWarning && (
                              <AlertTriangle
                                className="size-3.5 shrink-0"
                                aria-label="車検期限間近"
                              />
                            )}
                            {formatVehicleDate(vehicle.inspectionExpiry)}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {vehicle.firstYear || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm">
                          {formatLoadKg(vehicle.loadCapacity)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm">
                          {formatLoadKg(vehicle.grossWeight)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatVehicleDate(vehicle.registeredDate)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatVehicleDate(vehicle.scrappedDate)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showImport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="size-4" />
              車両マスタの取り込み
            </CardTitle>
            <CardDescription>
              「車両マスタ.xlsx」をドロップすると Firestore の vehicles
              コレクションへ反映します（既存データは上書き）。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ImportDropZone
              hint="車両マスタ.xlsx をドロップ（またはクリック）"
              files={importFiles}
              onAdd={(list) =>
                setImportFiles([...importFiles, ...Array.from(list)])
              }
              onClear={() => setImportFiles([])}
              accept=".xlsx,.xls"
              minHeightClass="h-36"
              accent="sky"
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
      )}

      {modalMode && (
        <VehicleFormModal
          mode={modalMode}
          vehicle={editingVehicle}
          suggestedVehicleId={suggestedVehicleId}
          vehicles={vehicles}
          saving={savingVehicle}
          onSave={handleSaveVehicle}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
