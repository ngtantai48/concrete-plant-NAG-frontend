"use client";

import { useAppDispatch } from "@/hooks/use-app-selector";
import authApi from "@/services/auth.service";
import { logoutSuccess } from "@/store/slices/authSlice";
import { Layout } from "antd";
import { useRouter } from "next/navigation";
import MaintenanceActionDock from "@/components/features/vehicle-maintenance-manage/dock/MaintenanceActionDock";
import AppHeader from "./Header";
import Sidebar from "./Sidebar";

const { Content } = Layout;

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const dispatch = useAppDispatch();

    const handleLogout = async () => {
        try {
            await authApi.logout();
        } catch {
            console.warn("Logout API failed, continuing with local logout.");
        } finally {
            dispatch(logoutSuccess());
            router.replace("/login");
        }
    };

    return (
        <Layout className="h-screen overflow-hidden">
            <Sidebar />
            <Layout id="main-content-layout">
                <AppHeader onLogout={handleLogout} />
                <Content className="flex-1 overflow-auto">
                    {children}
                </Content>
            </Layout>
            <MaintenanceActionDock />
        </Layout>
    );
}
