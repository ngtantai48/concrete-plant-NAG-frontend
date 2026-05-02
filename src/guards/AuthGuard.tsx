"use client";

import { useAppSelector } from "@/hooks/use-app-selector";
import { usePermissions } from "@/hooks/use-permissions";
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

    const { hasPageAccess } = usePermissions();

    useEffect(() => {
        if (loading) return;
        if (!isAuthenticated) {
            if (!hasToken && !attemptedRef.current) {
                attemptedRef.current = true;
                router.replace("/login");
            }
            return;
        }

        // If specific roles are passed (legacy), check them
        if (roles && !roles.includes(user?.role)) {
            forbidden();
            return;
        }

        // Check page permission based on pathname
        // We only check if the pathname starts with /admin and it's not the root /admin
        if (pathname.startsWith("/admin") && pathname !== "/admin") {
            if (!hasPageAccess(pathname)) {
                forbidden();
            }
        }

    }, [loading, isAuthenticated, roles, user, router, pathname, hasPageAccess]);

    if (loading) {
        return null
    }

    return <>{children}</>;
}
