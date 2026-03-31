"use client";

import AuthGuard from "@/guards/AuthGuard";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-selector";
import authApi from "@/services/auth.service";
import { logoutSuccess } from "@/store/slices/authSlice";
import { Layout } from "antd";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import AppHeader from "./Header";
import Sidebar from "./Sidebar";

const { Content } = Layout;

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const dispatch = useAppDispatch();
    const t = useTranslations('Header');

    const handleLogout = async () => {
        try {
            await authApi.logout();
        } catch (err) {
            console.warn("Logout API failed, continuing with local logout.");
        } finally {
            dispatch(logoutSuccess());
            router.replace("/login");
        }
    };

    return (
        <AuthGuard>
            <Layout className="min-h-screen">
                <Sidebar />
                <Layout id="main-content-layout" style={{ marginLeft: 270, transition: "margin-left 0.5s ease" }}>
                    <AppHeader onLogout={handleLogout} />
                    <Content className="bg-gray-50 min-h-[calc(100vh-64px)]">
                        {children}
                    </Content>
                </Layout>
            </Layout>
        </AuthGuard>
    );
}
