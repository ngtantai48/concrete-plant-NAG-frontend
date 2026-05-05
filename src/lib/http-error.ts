import { AxiosError } from "axios";
import { logoutSuccess } from "@/store/slices/authSlice";
import { getStore } from "./http";

export function isIgnorableHttpError(error: unknown) {
    const axiosError = error as AxiosError;
    const status = axiosError?.response?.status;
    const code = (axiosError as any)?.code;
    const message = axiosError?.message;

    if (code === "ERR_CANCELED") return true;
    if (status === 304) return true;
    if (!axiosError?.response && (code === "ERR_NETWORK" || message === "Network Error")) return true;

    return false;
}

export function logHttpError(context: string, error: unknown) {
    if (isIgnorableHttpError(error)) return;
    console.error(context, error);
}

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
