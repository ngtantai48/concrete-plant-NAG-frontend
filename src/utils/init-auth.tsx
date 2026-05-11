
"use client";

import authApi from "@/services/auth.service";
import { store } from "@/store";
import { authInitialized, loginSuccess, logoutSuccess } from "@/store/slices/authSlice";
import { useEffect } from "react";

let initPromise: Promise<void> | null = null;

export default function InitAuth() {
    useEffect(() => {
        const state = store.getState();
        if (state.auth.isAuthenticated) {
            store.dispatch(authInitialized());
            return;
        }

        if (initPromise) return;

        const init = async () => {
            try {
                const res = await authApi.refreshToken();
                store.dispatch(
                    loginSuccess({
                        user_id: res.data.user_id,
                        role: res.data.role,
                        role_id: res.data.role_id,
                        accessToken: res.data.accessToken,
                        user_full_name: res.data.user_full_name,
                        permissions: res.data.permissions,
                    })
                );
            } catch {
                store.dispatch(logoutSuccess());
            } finally {
                store.dispatch(authInitialized());
                initPromise = null;
            }
        };

        initPromise = init();
    }, []);

    return null;
}


