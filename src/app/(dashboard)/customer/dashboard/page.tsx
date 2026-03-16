import AuthGuard from "@/guards/AuthGuard";

export default function CustomerDashboardPage() {
    return (
        <AuthGuard roles={["customer"]}>
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Customer Dashboard</h1>
                <p className="text-gray-600">Trang này đang phát triển.</p>
            </div>
        </AuthGuard>
    );
}
