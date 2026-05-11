"use client";

import { useAppSelector } from "@/hooks/use-app-selector";
import { usePermissions } from "@/hooks/use-permissions";
import { forbidden, usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * PermissionGuard handles Authorization.
 * It checks if the user has permission to access the current pathname.
 * It can also check for specific roles if provided.
 */
export default function PermissionGuard({
    children,
    roles,
}: {
    children: React.ReactNode;
    roles?: string[];
}) {
    const pathname = usePathname();
    const { isAuthenticated, user, loading } = useAppSelector((state: any) => state.auth);
    const { hasPageAccess } = usePermissions();

    useEffect(() => {
        // Only check permissions if we are fully authenticated and have user data
        if (loading || !isAuthenticated || !user) return;

        // 1. Check by Roles (Legacy/Quick check)
        if (roles && !roles.includes(user.role)) {
            forbidden();
        }

        // 2. Check by Permissions (Granular check)
        // We check every page access to ensure the user is allowed to be here
        if (!hasPageAccess(pathname)) {
            forbidden();
        }
    }, [loading, isAuthenticated, user, pathname, hasPageAccess, roles]);

    if (loading) {
        return null;
    }

    // If not authenticated, we don't render anything (AuthGuard should handle redirect)
    if (!isAuthenticated) {
        return null;
    }

    return <>{children}</>;
}
