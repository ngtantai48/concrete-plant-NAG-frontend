import { userApi, type ListUsersParams } from "@/services/user.service";
import type { User } from "@/types/user";
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface UserState {
  pages: Record<number, User[]>;
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
}

const initialState: UserState = {
  pages: {},
  total: 0,
  page: 1,
  limit: 10,
  loading: false,
  error: null,
};

export const fetchUsers = createAsyncThunk(
  "users/fetch",
  async (params: ListUsersParams & { force?: boolean }, { rejectWithValue }) => {
    try {
      const res = await userApi.list(params);
      return res;
    } catch (error: any) {
      if (error.response) {
        return rejectWithValue({
          status: error.response.status,
          message: error.response.data?.message || "Failed to fetch users",
        });
      }

      return rejectWithValue({
        status: 500,
        message: error.message || "Unexpected error",
      });
    }
  },
  {
    condition: (params, { getState }) => {
      if (params.force) return true;

      const state = getState() as { users: UserState };
      const cachedPage = state.users?.pages[params.page || 1];

      return !cachedPage || cachedPage.length === 0;
    },
  }
);

const userSlice = createSlice({
  name: "users",
  initialState,
  reducers: {
    setPagination: (state, action: PayloadAction<{ page: number; limit: number }>) => {
      if (state.limit !== action.payload.limit) {
        state.pages = {};
        state.limit = action.payload.limit;
        state.page = 1;
        return;
      }

      state.page = action.payload.page;
    },
    clearUsers: (state) => {
      state.pages = {};
      state.total = 0;
      state.page = 1;
    },
    addUser: (state, action: PayloadAction<User>) => {
      state.total += 1;
      state.page = 1;

      if (state.pages[1]) {
        state.pages[1] = [action.payload, ...state.pages[1]].slice(0, state.limit);
      } else {
        state.pages[1] = [action.payload];
      }

      const maxPage = Math.ceil(state.total / state.limit) || 1;
      for (let page = 2; page <= maxPage; page += 1) {
        delete state.pages[page];
      }
    },
    updateUser: (state, action: PayloadAction<User>) => {
      for (const pageKey in state.pages) {
        const pageNum = Number(pageKey);
        const index = state.pages[pageNum].findIndex((user) => user.user_id === action.payload.user_id);

        if (index !== -1) {
          state.pages[pageNum][index] = {
            ...state.pages[pageNum][index],
            ...action.payload,
          };
          break;
        }
      }
    },
    deleteUser: (state, action: PayloadAction<number>) => {
      for (const pageKey in state.pages) {
        const pageNum = Number(pageKey);
        state.pages[pageNum] = state.pages[pageNum].filter(
          (user) => user.user_id !== action.payload
        );
      }

      state.total = Math.max(0, state.total - 1);
      const maxPage = Math.ceil(state.total / state.limit) || 1;

      for (let page = state.page; page <= maxPage + 1; page += 1) {
        delete state.pages[page];
      }

      if (state.page > maxPage) {
        state.page = maxPage;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.pages[action.payload.page] = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.limit = action.payload.limit;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch users";
      });
  },
});

export const { addUser, clearUsers, deleteUser, setPagination, updateUser } = userSlice.actions;
export default userSlice.reducer;
