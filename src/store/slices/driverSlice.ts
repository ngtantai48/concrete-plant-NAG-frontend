import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { Driver } from "@/types/driver";
import driverApi from "@/services/driver.service";

export interface ListDrivers {
  data: Driver[];
  total: number;
  page: number;
  limit: number;
}

export interface DriverState {
  pages: Record<number, Driver[]>;
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
}

const initialState: DriverState = {
  pages: {},
  total: 0,
  page: 1,
  limit: 10,
  loading: false,
  error: null,
};

export const fetchDrivers = createAsyncThunk(
  "drivers/fetch",
  async (params: { page: number; limit: number; user_full_name?: string; username?: string; user_phone_number?: string; user_email?: string; role?: string; force?: boolean }, { rejectWithValue }) => {
    try {
      const res = await driverApi.getAll({ ...params, role: params.role || "driver" });
      const payloadData = (res as any).data || res;
      
      if (Array.isArray(payloadData)) {
        return {
           data: payloadData,
           total: payloadData.length,
           page: params.page,
           limit: params.limit,
        } as ListDrivers;
      }
      return {
        data: payloadData.data || payloadData.users || payloadData.items || payloadData.results || [],
        total: payloadData.total || payloadData.meta?.total || payloadData.pagination?.total || (Array.isArray(payloadData.data) ? payloadData.data.length : 0),
        page: payloadData.page || params.page,
        limit: payloadData.limit || params.limit,
      } as ListDrivers;
    } catch (error: any) {
      if (error.response) {
        return rejectWithValue({
          status: error.response.status,
          message: error.response.data.message || "Failed to fetch drivers",
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
      if ((params as any).force) return true;
      const state = getState() as { drivers: DriverState };
      if (state.drivers?.pages[params.page] && state.drivers.pages[params.page].length > 0) {
        return false;
      }
      return true;
    }
  }
);

const driverSlice = createSlice({
  name: "drivers",
  initialState,
  reducers: {
    setPage: (state, action: PayloadAction<number>) => {
      state.page = action.payload;
    },
    setPagination: (
      state,
      action: PayloadAction<{ page: number; limit: number }>
    ) => {
      if (state.limit !== action.payload.limit) {
        state.pages = {};
        state.limit = action.payload.limit;
        state.page = 1; 
      } else {
        state.page = action.payload.page;
      }
    },
    clearDrivers: (state) => {
      state.pages = {};
      state.total = 0;
      state.page = 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDrivers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDrivers.fulfilled, (state, action) => {
        state.loading = false;
        state.pages[action.payload.page] = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.limit = action.payload.limit;
      })
      .addCase(fetchDrivers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch drivers";
      });
  },
});

export const { setPage, setPagination, clearDrivers } = driverSlice.actions;
export default driverSlice.reducer;
