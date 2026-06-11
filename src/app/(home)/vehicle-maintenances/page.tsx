import { Suspense } from "react";
import TableVehicleMaintenances from "@/components/features/vehicle-maintenance-manage/TableVehicleMaintenances";

export default function VehicleMaintenancesPage() {
  return (
    <Suspense>
      <TableVehicleMaintenances />
    </Suspense>
  );
}
