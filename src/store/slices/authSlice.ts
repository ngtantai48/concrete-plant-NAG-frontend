import authApi from "@/services/auth.service";
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

interface LoginResponse {
    statusCode: number;
    user_id: number;
    user_full_name: string;
    role: string;
    role_id: number;
    accessToken: string;
}

interface AuthState {
    user: {
        id: number;
        role: string;
        role_id: number;
        fullName?: string;
    } | null;
    token: string | null;
    loading: boolean;
    error: string | null;
    isAuthenticated: boolean;
    isLoggedOut?: boolean;
}

const initialState: AuthState = {
    user: null,
    token: null,
    loading: true,
    error: null,
    isAuthenticated: false,
    isLoggedOut: false,
};

export const login = createAsyncThunk<LoginResponse, { username: string; password: string }, { rejectValue: string }>(
    "auth/login",
    async ({ username, password }, { rejectWithValue }) => {
        try {
            const response = await authApi.login({ username, password });
            return response.data as LoginResponse;
        } catch (error: any) {
            return rejectWithValue(error.response?.data?.message || "Login failed");
        }
    }
);

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        authInitialized: (state) => { state.loading = false },
        loginSuccess: (state, action: PayloadAction<{
            user_id: number;
            role: string;
            role_id: number;
            accessToken: string;
            user_full_name?: string
        }>) => {
            state.user = {
                id: action.payload.user_id,
                role: action.payload.role,
                role_id: action.payload.role_id,
                fullName: action.payload.user_full_name,
            };
            state.token = action.payload.accessToken;
            state.isAuthenticated = true;
            state.isLoggedOut = false;
            state.error = null;
            state.loading = false;
        },
        logoutSuccess: (state) => {
            state.user = null;
            state.token = null;
            state.isAuthenticated = false;
            state.isLoggedOut = true;
            state.loading = false;
        },
        clearLogoutFlag: (state) => {
            state.isLoggedOut = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(login.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(login.fulfilled, (state, action) => {
                state.loading = false;
                state.user = {
                    id: action.payload.user_id,
                    role: action.payload.role,
                    role_id: action.payload.role_id,
                    fullName: action.payload.user_full_name,
                };
                state.token = action.payload.accessToken;
                state.isAuthenticated = true;
                state.isLoggedOut = false;
            })
            .addCase(login.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

export const { loginSuccess, logoutSuccess, clearLogoutFlag, authInitialized } = authSlice.actions;
export default authSlice.reducer;
