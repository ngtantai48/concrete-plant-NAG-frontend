"use client";

import { ROLE_DASHBOARD_MAP } from "@/constants/role";
import { useAppSelector } from "@/hooks/use-app-selector";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RoleRedirect() {
    const router = useRouter();
    const { isAuthenticated, user, loading } = useAppSelector((state) => state.auth);

    useEffect(() => {
        if (loading) return;

        if (!isAuthenticated) {
            router.replace("/login");
            return;
        }

        const role = user?.role;
        if (role && ROLE_DASHBOARD_MAP[role]) {
            router.replace(ROLE_DASHBOARD_MAP[role]);
        } else {
            router.replace("/login");
        }
    }, [isAuthenticated, user, loading, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin h-8 w-8 border-4 border-gray-300 border-t-blue-600 rounded-full"></div>
            </div>
        );
    }

    return null;
}
