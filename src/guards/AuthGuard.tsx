"use client";

import { useAppSelector } from "@/hooks/use-app-selector";
import { useRouter } from "next/navigation";
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

    useEffect(() => {
        if (loading) return;

        if (!isAuthenticated) {
            if (!hasToken && !attemptedRef.current) {
                attemptedRef.current = true;
                router.replace("/login");
            }
            return;
        }
    }, [loading, isAuthenticated, hasToken, router]);

    if (loading) {
        return null;
    }

    if (!isAuthenticated) {
        return null;
    }

    return <>{children}</>;
}
