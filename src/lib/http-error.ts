import { AxiosError } from "axios";
import { logoutSuccess } from "@/store/slices/authSlice";
import { getStore } from "./http";

export function handleHttpError(error: AxiosError) {
    const store = getStore();
    const status = error.response?.status;
    const url = error.config?.url;

    if (!error.response) {
        return Promise.reject(error);
    }

    if (status === 401 || status === 403) {
        if (url?.includes("/refresh") || url?.includes("/auth/refresh")) {
            console.warn("⚠️ Refresh token invalid, forcing logout");
            store?.dispatch(logoutSuccess());
            return Promise.reject(error);
        }
    }

    return Promise.reject(error);
}
