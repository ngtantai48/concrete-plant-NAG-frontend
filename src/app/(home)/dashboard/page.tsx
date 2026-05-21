import AdminDashboard from "@/components/features/dashboard/AdminDashboard";
// Tạm ẩn nút ghi âm hỏi nhanh chờ backend production hoàn thiện endpoint voice
// (đang test ở local — giữ component file, chỉ unmount khỏi production)
// import QuickAskMicButton from "@/components/features/dashboard/QuickAskMicButton";

export default function AdminDashboardPage() {
  return (
    <>
      <AdminDashboard />
      {/* <QuickAskMicButton /> */}
    </>
  );
}
