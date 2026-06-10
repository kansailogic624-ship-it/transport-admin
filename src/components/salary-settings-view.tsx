"use client";

import { EmployeeSalaryRegistry } from "@/components/employee-salary-registry";
import type { MasterData } from "@/lib/types";

type Props = {
  masters: MasterData;
  onMastersChange: (masters: MasterData) => void;
};

export function SalarySettingsView({ masters, onMastersChange }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        社員の月給およびアルバイト・派遣の標準日額を設定します。人件費の按分計算に使用されます。
      </p>
      <EmployeeSalaryRegistry
        masters={masters}
        onMastersChange={onMastersChange}
      />
    </div>
  );
}
