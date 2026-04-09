import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { Vehicle } from "@/types/vehicle";
import vehicleApi, { ListVehicles } from "@/services/vehicle.service";

export interface VehicleState {
  pages: Record<number, Vehicle[]>;
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
}

const initialState: VehicleState = {
  pages: {},
  total: 0,
  page: 1,
  limit: 10,
  loading: false,
  error: null,
};

// Fetch list of vehicles
export const fetchVehicles = createAsyncThunk(
  "vehicles/fetch",
  async (params: { page: number; limit: number; vehicle_license_plate?: string; vehicle_status?: string; user_id?: number; force?: boolean }, { rejectWithValue }) => {
    try {
      const res = await vehicleApi.getAll(params);
      // Ensure we extract data properly based on expected ListVehicles format or response wrap
      const payloadData = (res as any).data || res;
      // In case the API returns an array directly because of legacy support or fallback
      if (Array.isArray(payloadData)) {
        return {
           data: payloadData,
           total: payloadData.length,
           page: params.page,
           limit: params.limit,
        } as ListVehicles;
      }
      return {
        data: payloadData.data || [],
        total: payloadData.total || 0,
        page: payloadData.page || params.page,
        limit: payloadData.limit || params.limit,
      } as ListVehicles;
    } catch (error: any) {
      if (error.response) {
        return rejectWithValue({
          status: error.response.status,
          message: error.response.data.message || "Failed to fetch vehicles",
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
      // If we are forcing a fetch (e.g. refresh, search), we allow it.
      if ((params as any).force) return true;
      
      const state = getState() as { vehicles: VehicleState };
      // Prevent fetch if data for the page already exists and array is populated
      if (state.vehicles.pages[params.page] && state.vehicles.pages[params.page].length > 0) {
        return false;
      }
      return true;
    }
  }
);

// Create vehicle pseudo-thunk (optional, but good for updating state after creation)
export const createVehicleThunk = createAsyncThunk(
  "vehicles/create",
  async (data: Partial<Vehicle>, { dispatch, getState }) => {
    const res = await vehicleApi.create(data);
    dispatch(setPage(1));
    const state = getState() as { vehicles: VehicleState }; // Assumes named mapped to 'vehicles'
    const { page, limit } = state.vehicles;
    // Dispatch refetch to make sure the newly created item respects the server-side sorting logic
    dispatch(fetchVehicles({ page: 1, limit }));
    return res;
  }
);

// Delete vehicle pseudo-thunk
export const deleteVehicleThunk = createAsyncThunk(
  "vehicles/delete",
  async (id: number, { dispatch, getState }) => {
    await vehicleApi.delete(id);
    const state = getState() as { vehicles: VehicleState };
    const { page, limit } = state.vehicles;
    dispatch(fetchVehicles({ page, limit }));
  }
);

const vehicleSlice = createSlice({
  name: "vehicles",
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
        state.pages = {}; // Clear cache if limit changes
        state.limit = action.payload.limit;
        state.page = 1; 
      } else {
        state.page = action.payload.page;
      }
    },
    clearVehicles: (state) => {
      state.pages = {};
      state.total = 0;
      state.page = 1;
    },
    // Cache mutation actions if optimistic updates are preferred
    updateVehicleCache: (state, action: PayloadAction<Vehicle>) => {
      for (const pageKey in state.pages) {
        const pageNum = Number(pageKey);
        const index = state.pages[pageNum].findIndex(
          (v) => v.vehicle_id === action.payload.vehicle_id
        );
        if (index !== -1) {
          state.pages[pageNum][index] = {
            ...state.pages[pageNum][index],
            ...action.payload,
          };
          break;
        }
      }
    },
    deleteVehicleCache: (state, action: PayloadAction<number>) => {
      for (const pageKey in state.pages) {
        const pageNum = Number(pageKey);
        state.pages[pageNum] = state.pages[pageNum].filter(
          (v) => v.vehicle_id !== action.payload
        );
      }
      state.total = Math.max(0, state.total - 1);
      const maxPage = Math.ceil(state.total / state.limit) || 1;
      for (let p = state.page; p <= maxPage + 1; p++) {
        delete state.pages[p];
      }
      if (state.page > maxPage) {
        state.page = maxPage;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchVehicles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchVehicles.fulfilled, (state, action) => {
        state.loading = false;
        state.pages[action.payload.page] = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.limit = action.payload.limit;
      })
      .addCase(fetchVehicles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch vehicles";
      });
  },
});

export const { setPage, setPagination, clearVehicles, updateVehicleCache, deleteVehicleCache } = vehicleSlice.actions;
export default vehicleSlice.reducer;
