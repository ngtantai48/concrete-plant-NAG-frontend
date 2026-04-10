"use client";

import EndOfDayVehicleManager from "@/components/features/admin/end-of-day/EndOfDayVehicleManager";
import AuthGuard from "@/guards/AuthGuard";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function EndOfDayContent() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode");
  const mode = modeParam === "previous" ? ("previous" as const) : ("today" as const);
  return <EndOfDayVehicleManager mode={mode} />;
}

export default function EndOfDayVehiclesPage() {
  return (
    <AuthGuard roles={["admin"]}>
      <Suspense fallback={null}>
        <EndOfDayContent />
      </Suspense>
    </AuthGuard>
  );
}
