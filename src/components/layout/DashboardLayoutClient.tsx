"use client";

import authApi from "@/services/auth.service";
import { logoutSuccess } from "@/store/slices/authSlice";
import { useAppDispatch } from "@/hooks/use-app-selector";
import { Layout } from "antd";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import AppHeader from "./Header";
import Sidebar from "./Sidebar";

const ChatbotPanel = dynamic(() => import("@/components/features/chatbot/ChatbotPanel"), { ssr: false });

const { Content } = Layout;

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const dispatch = useAppDispatch();
    const t = useTranslations("Header");

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
            {/* Floating AI Chatbot — visible on all admin pages */}
            <ChatbotPanel />
        </Layout>
    );
}
