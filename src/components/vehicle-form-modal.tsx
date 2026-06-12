"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isVehicleIdTaken } from "@/lib/vehicle-ledger-utils";
import type { VehicleDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

export type VehicleFormDraft = {
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  tonnageDisplay: string;
  vehicleName: string;
  modelType: string;
  inspectionExpiry: string;
  firstYear: string;
  loadCapacity: string;
  grossWeight: string;
  registeredDate: string;
  scrappedDate: string;
};

type VehicleFormModalProps = {
  mode: "create" | "edit";
  vehicle: VehicleDetail | null;
  suggestedVehicleId: string;
  vehicles: VehicleDetail[];
  saving?: boolean;
  onSave: (vehicle: VehicleDetail) => Promise<void>;
  onClose: () => void;
};

function toDraft(
  vehicle: VehicleDetail | null,
  suggestedVehicleId: string,
): VehicleFormDraft {
  if (!vehicle) {
    return {
      vehicleId: suggestedVehicleId,
      vehicleCode: "",
      plateNumber: "",
      tonnageDisplay: "",
      vehicleName: "",
      modelType: "",
      inspectionExpiry: "",
      firstYear: "",
      loadCapacity: "",
      grossWeight: "",
      registeredDate: "",
      scrappedDate: "",
    };
  }
  return {
    vehicleId: vehicle.vehicleId,
    vehicleCode: vehicle.vehicleCode,
    plateNumber: vehicle.plateNumber,
    tonnageDisplay: vehicle.tonnageDisplay,
    vehicleName: vehicle.vehicleName,
    modelType: vehicle.modelType,
    inspectionExpiry: vehicle.inspectionExpiry,
    firstYear: vehicle.firstYear,
    loadCapacity: vehicle.loadCapacity ? String(vehicle.loadCapacity) : "",
    grossWeight: vehicle.grossWeight ? String(vehicle.grossWeight) : "",
    registeredDate: vehicle.registeredDate,
    scrappedDate: vehicle.scrappedDate,
  };
}

function parseWeight(value: string): number {
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function draftToVehicle(
  draft: VehicleFormDraft,
  existing: VehicleDetail | null,
): VehicleDetail {
  const vehicleId = draft.vehicleId.trim();
  return {
    id: existing?.id ?? vehicleId,
    vehicleId,
    vehicleCode: draft.vehicleCode.trim(),
    plateNumber: draft.plateNumber.trim(),
    tonnageDisplay: draft.tonnageDisplay.trim(),
    vehicleName: draft.vehicleName.trim(),
    modelType: draft.modelType.trim(),
    inspectionExpiry: draft.inspectionExpiry,
    firstYear: draft.firstYear.trim(),
    loadCapacity: parseWeight(draft.loadCapacity),
    grossWeight: parseWeight(draft.grossWeight),
    registeredDate: draft.registeredDate,
    scrappedDate: draft.scrappedDate,
    heightMm: existing?.heightMm,
    lengthMm: existing?.lengthMm,
    widthMm: existing?.widthMm,
    updatedAt: new Date().toISOString(),
  };
}

export function VehicleFormModal({
  mode,
  vehicle,
  suggestedVehicleId,
  vehicles,
  saving = false,
  onSave,
  onClose,
}: VehicleFormModalProps) {
  const [draft, setDraft] = useState<VehicleFormDraft>(() =>
    toDraft(vehicle, suggestedVehicleId),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toDraft(vehicle, suggestedVehicleId));
    setError(null);
  }, [vehicle, suggestedVehicleId, mode]);

  const title = useMemo(
    () =>
      mode === "create"
        ? "新規車両登録"
        : `${vehicle?.plateNumber || vehicle?.vehicleCode || "車両"} の編集`,
    [mode, vehicle?.plateNumber, vehicle?.vehicleCode],
  );

  const handleSubmit = async () => {
    const vehicleId = draft.vehicleId.trim();
    if (!vehicleId) {
      setError("車両IDを入力してください。");
      return;
    }
    if (
      isVehicleIdTaken(
        vehicles,
        vehicleId,
        mode === "edit" ? vehicle?.id : undefined,
      )
    ) {
      setError(`車両ID「${vehicleId}」は既に使用されています。`);
      return;
    }

    setError(null);
    try {
      await onSave(draftToVehicle(draft, vehicle));
    } catch (err) {
      console.error(err);
      setError("保存に失敗しました。");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
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
                ? "車両IDは自動採番されています。必要に応じて変更できます。"
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
            <div className="space-y-1.5">
              <Label htmlFor="vehicle-id">車両ID</Label>
              <Input
                id="vehicle-id"
                value={draft.vehicleId}
                disabled={mode === "edit" || saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, vehicleId: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicle-code">車両番号</Label>
              <Input
                id="vehicle-code"
                value={draft.vehicleCode}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, vehicleCode: e.target.value }))
                }
                placeholder="例: 38-12"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="plate-number">車輛番号（ナンバープレート）</Label>
              <Input
                id="plate-number"
                value={draft.plateNumber}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, plateNumber: e.target.value }))
                }
                placeholder="例: 京都100い38-12"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tonnage">トン数表示</Label>
              <Input
                id="tonnage"
                value={draft.tonnageDisplay}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, tonnageDisplay: e.target.value }))
                }
                placeholder="例: 2ｔ"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicle-name">車名</Label>
              <Input
                id="vehicle-name"
                value={draft.vehicleName}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, vehicleName: e.target.value }))
                }
                placeholder="例: いすゞ"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="model-type">形式</Label>
              <Input
                id="model-type"
                value={draft.modelType}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, modelType: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspection-expiry">車検有効期限</Label>
              <Input
                id="inspection-expiry"
                type="date"
                value={draft.inspectionExpiry}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, inspectionExpiry: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="first-year">初年度</Label>
              <Input
                id="first-year"
                value={draft.firstYear}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, firstYear: e.target.value }))
                }
                placeholder="例: H23.03"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="load-capacity">積載量（kg）</Label>
              <Input
                id="load-capacity"
                type="number"
                value={draft.loadCapacity}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, loadCapacity: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gross-weight">総重量（kg）</Label>
              <Input
                id="gross-weight"
                type="number"
                value={draft.grossWeight}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, grossWeight: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="registered-date">登録年月日</Label>
              <Input
                id="registered-date"
                type="date"
                value={draft.registeredDate}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, registeredDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scrapped-date">廃車年月日</Label>
              <Input
                id="scrapped-date"
                type="date"
                value={draft.scrappedDate}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, scrappedDate: e.target.value }))
                }
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
            className={cn(
              mode === "create" && "bg-emerald-600 hover:bg-emerald-700",
            )}
            onClick={() => handleSubmit().catch(console.error)}
          >
            {saving ? "保存中…" : mode === "create" ? "登録" : "保存"}
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
