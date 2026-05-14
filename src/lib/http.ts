import authApi from "@/services/auth.service";
import type { RootState, Store } from "@/store";
import { loginSuccess, logoutSuccess } from "@/store/slices/authSlice";
import axios, { InternalAxiosRequestConfig } from "axios";
import { jwtDecode } from "jwt-decode";
import { handleHttpError } from "./http-error";

let storeInstance: Store | null = null;

export const injectStore = (store: Store) => {
    storeInstance = store;
};

export const getStore = () => storeInstance;

const serializeParams = (params: Record<string, unknown>): string => {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return;

        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (item !== undefined && item !== null) {
                    searchParams.append(key, String(item));
                }
            });
            return;
        }

        searchParams.append(key, String(value));
    });

    return searchParams.toString();
};

const http = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    headers: { "Content-Type": "application/json" },
    withCredentials: true,
    paramsSerializer: (params) => serializeParams(params as Record<string, unknown>),
});

const AUTH_ENDPOINTS = {
    LOGIN: "/auth/login",
    REFRESH: "/auth/refresh",
};

const isTokenExpired = (token: string): boolean => {
    try {
        const decoded: any = jwtDecode(token);
        const currentTime = Math.floor(Date.now() / 1000);
        return decoded.exp < currentTime;
    } catch {
        return true;
    }
};

let refreshTokenPromise: Promise<string> | null = null;

const handleRefreshToken = async (): Promise<string> => {
    if (refreshTokenPromise) return refreshTokenPromise;

    refreshTokenPromise = authApi.refreshToken()
        .then((res) => {
            const newToken = res.data.accessToken;
            storeInstance?.dispatch(
                loginSuccess({
                    user_id: res.data.user_id,
                    role: res.data.role,
                    role_id: res.data.role_id,
                    accessToken: newToken,
                    user_full_name: res.data.user_full_name,
                    permissions: res.data.permissions,
                })
            );
            return newToken;
        })
        .catch((err) => {
            storeInstance?.dispatch(logoutSuccess());
            throw err;
        })
        .finally(() => {
            refreshTokenPromise = null;
        });

    return refreshTokenPromise;
};

http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const isAuthRequest = config.url?.includes(AUTH_ENDPOINTS.LOGIN) || config.url?.includes(AUTH_ENDPOINTS.REFRESH);

    const state: RootState | undefined = storeInstance?.getState();
    let token = state?.auth?.token;

    if (!isAuthRequest && token) {
        if (isTokenExpired(token)) {
            try {
                token = await handleRefreshToken();
            } catch (err) {
                return Promise.reject(err);
            }
        }

        if (config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }

    return config;
});

http.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;

        // If 401 or 403 error and hasn't retried yet
        if ((status === 401 || status === 403) && !originalRequest._retry) {
            const isAuthRequest = originalRequest.url?.includes(AUTH_ENDPOINTS.LOGIN) || originalRequest.url?.includes(AUTH_ENDPOINTS.REFRESH);
            
            if (isAuthRequest) {
                return handleHttpError(error);
            }

            originalRequest._retry = true;

            try {
                const newToken = await handleRefreshToken();
                if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                }
                return http(originalRequest);
            } catch (retryError: any) {
                return handleHttpError(retryError);
            }
        }

        return handleHttpError(error);
    }
);

export default http;
