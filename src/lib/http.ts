import authApi from "@/services/auth.service";
import type { RootState, Store } from "@/store";
import { logoutSuccess } from "@/store/slices/authSlice";
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
        if (value === undefined || value === null) {
            return;
        }

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

const isTokenExpired = (token: string): boolean => {
    try {
        const decoded: any = jwtDecode(token);
        const currentTime = Math.floor(Date.now() / 1000);
        return decoded.exp < currentTime;
    } catch {
        return true;
    }
};

let refreshTokenPromise: Promise<any> | null = null;

http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const state: RootState | undefined = storeInstance?.getState();
    let token = state?.auth?.token;

    if (token) {
        if (isTokenExpired(token)) {
            if (!refreshTokenPromise) {
                refreshTokenPromise = authApi.refreshToken()
                    .then((res) => {
                        const newToken = res.data.accessToken;
                        storeInstance?.dispatch({
                            type: "auth/login/fulfilled",
                            payload: {
                                user_id: res.data.user_id,
                                role: res.data.role,
                                role_id: res.data.role_id,
                                accessToken: newToken,
                                user_full_name: res.data.user_full_name,
                            },
                        });
                        return newToken;
                    })
                    .catch((err) => {
                        storeInstance?.dispatch(logoutSuccess());
                        throw err;
                    })
                    .finally(() => {
                        refreshTokenPromise = null;
                    });
            }

            try {
                token = await refreshTokenPromise;
            } catch (err) {
                return config;
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
    (error) => handleHttpError(error)
);

export default http;
