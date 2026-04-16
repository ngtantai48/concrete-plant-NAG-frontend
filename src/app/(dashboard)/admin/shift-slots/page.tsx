import ShiftSlotsManager from "@/components/features/admin/shift-slots/ShiftSlotsManager";
import AuthGuard from "@/guards/AuthGuard";

export default function ShiftSlotsPage() {
  return (
    <AuthGuard roles={["admin"]}>
      <ShiftSlotsManager />
    </AuthGuard>
  );
}
