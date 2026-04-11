"use client";

import EndOfDayVehicleManager from "@/components/features/admin/end-of-day/EndOfDayVehicleManager";
import AuthGuard from "@/guards/AuthGuard";

export default function EndOfDayVehiclesPage() {
  return (
    <AuthGuard roles={["admin"]}>
      <EndOfDayVehicleManager />
    </AuthGuard>
  );
}
