"use client";

import { useAppSelector } from "@/hooks/use-app-selector";
<<<<<<< HEAD
import { useRouter } from "next/navigation";
=======
import { usePermissions } from "@/hooks/use-permissions";
import { forbidden, usePathname, useRouter } from "next/navigation";
>>>>>>> 4d2e0c0 (feat: scaffold admin dashboard and management modules with authentication and i18n support)
import { useEffect, useRef } from "react";

/**
 * AuthGuard handles Authentication.
 * It only ensures the user is logged in.
 */
export default function AuthGuard({ children }: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const { isAuthenticated, loading } = useAppSelector((state: any) => state.auth);
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
<<<<<<< HEAD
    }, [loading, isAuthenticated, hasToken, router]);
=======

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
>>>>>>> 4d2e0c0 (feat: scaffold admin dashboard and management modules with authentication and i18n support)

    if (loading) {
        return null;
    }

    if (!isAuthenticated) {
        return null;
    }

    return <>{children}</>;
}
