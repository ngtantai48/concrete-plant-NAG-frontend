import DashboardLayoutClient from "@/components/layout/DashboardLayoutClient";
import AuthGuard from "@/guards/AuthGuard";
import PermissionGuard from "@/guards/PermissionGuard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthGuard>
            <PermissionGuard>
                <DashboardLayoutClient>
                    {children}
                </DashboardLayoutClient>
            </PermissionGuard>
        </AuthGuard>
    );
}
