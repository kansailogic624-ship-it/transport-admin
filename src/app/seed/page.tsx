"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SeedMay2026Client } from "@/components/seed-may2026-client";

function SeedMay2026PageInner() {
  const searchParams = useSearchParams();
  const autoApply = searchParams.get("apply") === "1";

  return <SeedMay2026Client autoApply={autoApply} />;
}

export default function SeedPage() {
  return (
    <Suspense
      fallback={
        <p className="p-8 text-sm text-muted-foreground">読み込み中...</p>
      }
    >
      <SeedMay2026PageInner />
    </Suspense>
  );
}
