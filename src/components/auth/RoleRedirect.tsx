"use client";

import { useAppSelector } from "@/hooks/use-app-selector";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePermissions } from "@/hooks/use-permissions";

export default function RoleRedirect() {
    const router = useRouter();
    const { isAuthenticated, loading } = useAppSelector((state) => state.auth);
    const { getDefaultRoute } = usePermissions();

    useEffect(() => {
        if (loading) return;

        if (!isAuthenticated) {
            router.replace("/login");
            return;
        }

        const defaultRoute = getDefaultRoute();
        router.replace(defaultRoute);
    }, [isAuthenticated, loading, router, getDefaultRoute]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin h-8 w-8 border-4 border-gray-300 border-t-blue-600 rounded-full"></div>
            </div>
        );
    }

    return null;
}
