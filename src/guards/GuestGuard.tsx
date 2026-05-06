"use client";

import { useAppSelector } from "@/hooks/use-app-selector";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const roleRedirectMap: Record<string, string> = {
    admin: "/admin/dashboard",
    manager: "/manager/dashboard",
    dispatcher: "/dispatcher/dashboard",
    driver: "/driver/dashboard",
    user: "/user/dashboard",
};

export default function GuestGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { isAuthenticated, user } = useAppSelector((state) => state.auth);
    useEffect(() => {
        if (isAuthenticated) {
            const role = user?.role;
            const redirectTo =
                role && role in roleRedirectMap
                    ? roleRedirectMap[role as keyof typeof roleRedirectMap]
                    : "/login";
            router.push(redirectTo);
        }
    }, [isAuthenticated, user, router]);

    return <>{children}</>;
}
