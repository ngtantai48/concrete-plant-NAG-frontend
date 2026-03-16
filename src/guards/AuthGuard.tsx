"use client";

import { useAppSelector } from "@/hooks/use-app-selector";
import { forbidden, usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export default function AuthGuard({ children, roles }: {
    children: React.ReactNode;
    roles?: string[];
}) {
    const router = useRouter();
    const pathname = usePathname();
    const { isAuthenticated, user, loading } = useAppSelector((state: any) => state.auth);
    const attemptedRef = useRef(false);
    const hasToken = useAppSelector((state: any) => state.auth.token);

    useEffect(() => {
        if (loading) return;
        if (!isAuthenticated) {
            if (!hasToken && !attemptedRef.current) {
                attemptedRef.current = true;
                router.replace("/login");
            }
            return;
        }

        if (roles && !roles.includes(user?.role)) {
            forbidden();
        }
    }, [loading, isAuthenticated, roles, user, router, pathname]);

    if (loading) {
        return null
    }

    return <>{children}</>;
}
