import AdminDashboard from "@/components/features/dashboard/AdminDashboard";
import DashboardQuickVoice from "@/components/features/dashboard/DashboardQuickVoice";

export default function AdminDashboardPage() {
  return (
    <>
      <AdminDashboard />
      {/* Nút hỏi nhanh bằng giọng nói — vị trí động theo dock bảo trì:
          có phiếu chờ → đẩy lên trên dock, hết phiếu → tụt về góc dưới phải. */}
      <DashboardQuickVoice />
    </>
  );
}
