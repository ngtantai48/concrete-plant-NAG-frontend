import AdminDashboard from "@/components/features/admin/dashboard/AdminDashboard";
import AuthGuard from "@/guards/AuthGuard";

export default function AdminDashboardPage() {
  return (
    <AuthGuard roles={["admin"]}>
      <AdminDashboard />
    </AuthGuard>
  );
}
