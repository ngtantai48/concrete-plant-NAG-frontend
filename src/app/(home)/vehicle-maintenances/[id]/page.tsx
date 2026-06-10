"use client";

import VehicleMaintenanceDetail from "@/components/features/vehicle-maintenance-manage/VehicleMaintenanceDetail";
import { useParams } from "next/navigation";

export default function VehicleMaintenanceDetailPage() {
  const params = useParams<{ id: string }>();
  const maintenanceId = Number(params.id);

  return <VehicleMaintenanceDetail maintenanceId={maintenanceId} />;
}
