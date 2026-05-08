"use client";

import AuthGuard from "@/guards/AuthGuard";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-selector";
import authApi from "@/services/auth.service";
import { logoutSuccess } from "@/store/slices/authSlice";
import { Layout } from "antd";
<<<<<<< Updated upstream
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
=======
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
>>>>>>> Stashed changes
import AppHeader from "./Header";
import Sidebar from "./Sidebar";

const { Content } = Layout;

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const dispatch = useAppDispatch();
<<<<<<< Updated upstream
    const t = useTranslations('Header');
=======
    const isAiAssistantPage = pathname?.startsWith("/admin/ai-assistant");
>>>>>>> Stashed changes

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

    if (isAiAssistantPage) {
        return <>{children}</>;
    }

    return (
        <Layout className="h-screen overflow-hidden">
            <Sidebar />
            <Layout id="main-content-layout">
                <AppHeader onLogout={handleLogout} />
                <Content className="flex-1 overflow-auto">
                    {children}
                </Content>
            </Layout>
        </Layout>
    );
}
