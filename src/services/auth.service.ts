import http from "@/lib/http";

const authApi = {
    login: (data: { username: string; password: string }) => {
        return http.post("/auth/login", data);
    },
    logout: () => http.post("/auth/logout"),
    refreshToken: () => http.get("/auth/refresh"),
    resetPassword: (data: { current_password: string; new_password: string }) =>
        http.post("/auth/reset-password", data),
};

export default authApi;
