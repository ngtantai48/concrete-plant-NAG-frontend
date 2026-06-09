import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import vehicleMaintenanceApi, {
  BulkDeleteVehicleMaintenancesResult,
  ListVehicleMaintenances,
} from "@/services/vehicle-maintenance.service";
import type { VehicleMaintenance } from "@/types/vehicle";
import type {
  VehicleMaintenanceHistory,
  VehicleMaintenanceWorkflowAction,
} from "@/types/vehicle";

export interface FetchVehicleMaintenancesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  payment_status?: string;
  vehicle_id?: number;
  mine?: boolean;
  force?: boolean;
}

export interface VehicleMaintenanceState {
  items: VehicleMaintenance[];
  entities: Record<number, VehicleMaintenance>;
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  detailLoading: boolean;
  saving: boolean;
  deleting: boolean;
  bulkDeleting: boolean;
  error: string | null;
  selectedIds: number[];
  historiesById: Record<number, VehicleMaintenanceHistory[]>;
  historyLoading: boolean;
  workflowLoading: boolean;
}

const initialState: VehicleMaintenanceState = {
  items: [],
  entities: {},
  total: 0,
  page: 1,
  limit: 10,
  loading: false,
  detailLoading: false,
  saving: false,
  deleting: false,
  bulkDeleting: false,
  error: null,
  selectedIds: [],
  historiesById: {},
  historyLoading: false,
  workflowLoading: false,
};

function upsertMany(state: VehicleMaintenanceState, rows: VehicleMaintenance[]) {
  for (const item of rows) {
    state.entities[item.vehicle_maintenance_id] = item;
  }
}

function removeIds(state: VehicleMaintenanceState, ids: number[]) {
  const deletedSet = new Set(ids);
  state.items = state.items.filter((item) => !deletedSet.has(item.vehicle_maintenance_id));
  for (const id of ids) {
    delete state.entities[id];
    delete state.historiesById[id];
  }
  state.selectedIds = state.selectedIds.filter((id) => !deletedSet.has(id));
  state.total = Math.max(0, state.total - ids.length);
}

export const fetchVehicleMaintenances = createAsyncThunk<
  ListVehicleMaintenances,
  FetchVehicleMaintenancesParams | undefined
>("vehicleMaintenances/fetchList", async (params) => {
  const res = await vehicleMaintenanceApi.getListName(params as Record<string, unknown> | undefined);
  return res.data;
});

export const fetchVehicleMaintenanceById = createAsyncThunk<VehicleMaintenance, number>(
  "vehicleMaintenances/fetchById",
  async (id) => {
    const res = await vehicleMaintenanceApi.getById(id);
    return res.data;
  }
);

export const updateVehicleMaintenanceThunk = createAsyncThunk<
  VehicleMaintenance,
  { id: number; data: Partial<VehicleMaintenance> }
>("vehicleMaintenances/update", async ({ id, data }) => {
  const res = await vehicleMaintenanceApi.update(id, data);
  return res.data;
});

export const runVehicleMaintenanceWorkflowThunk = createAsyncThunk<
  VehicleMaintenance,
  {
    id: number;
    action: VehicleMaintenanceWorkflowAction;
    note?: string | null;
    reason?: string | null;
  }
>("vehicleMaintenances/runWorkflow", async ({ id, action, note, reason }) => {
  const res = await vehicleMaintenanceApi.runWorkflowAction(id, action, { note, reason });
  return res.data;
});

export const fetchVehicleMaintenanceHistoryThunk = createAsyncThunk<
  { id: number; histories: VehicleMaintenanceHistory[] },
  number
>("vehicleMaintenances/fetchHistory", async (id) => {
  const res = await vehicleMaintenanceApi.getHistory(id);
  return { id, histories: res.data };
});

export const deleteVehicleMaintenanceThunk = createAsyncThunk<number, number>(
  "vehicleMaintenances/delete",
  async (id) => {
    await vehicleMaintenanceApi.delete(id);
    return id;
  }
);

export const bulkDeleteVehicleMaintenancesThunk = createAsyncThunk<
  BulkDeleteVehicleMaintenancesResult,
  number[]
>("vehicleMaintenances/bulkDelete", async (ids) => {
  const res = await vehicleMaintenanceApi.bulkDelete(ids);
  return res.data;
});

const vehicleMaintenanceSlice = createSlice({
  name: "vehicleMaintenances",
  initialState,
  reducers: {
    setVehicleMaintenancePagination: (
      state,
      action: PayloadAction<{ page: number; limit: number }>
    ) => {
      state.page = action.payload.page;
      state.limit = action.payload.limit;
    },
    setSelectedVehicleMaintenanceIds: (state, action: PayloadAction<number[]>) => {
      state.selectedIds = action.payload;
    },
    clearSelectedVehicleMaintenanceIds: (state) => {
      state.selectedIds = [];
    },
    upsertVehicleMaintenanceCache: (state, action: PayloadAction<VehicleMaintenance>) => {
      state.entities[action.payload.vehicle_maintenance_id] = action.payload;
      const index = state.items.findIndex(
        (item) => item.vehicle_maintenance_id === action.payload.vehicle_maintenance_id
      );
      if (index >= 0) state.items[index] = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchVehicleMaintenances.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchVehicleMaintenances.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.limit = action.payload.limit;
        upsertMany(state, action.payload.data);
      })
      .addCase(fetchVehicleMaintenances.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch vehicle maintenances";
      })
      .addCase(fetchVehicleMaintenanceById.pending, (state) => {
        state.detailLoading = true;
        state.error = null;
      })
      .addCase(fetchVehicleMaintenanceById.fulfilled, (state, action) => {
        state.detailLoading = false;
        state.entities[action.payload.vehicle_maintenance_id] = action.payload;
      })
      .addCase(fetchVehicleMaintenanceById.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = action.error.message || "Failed to fetch vehicle maintenance";
      })
      .addCase(updateVehicleMaintenanceThunk.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(updateVehicleMaintenanceThunk.fulfilled, (state, action) => {
        state.saving = false;
        state.entities[action.payload.vehicle_maintenance_id] = action.payload;
        const index = state.items.findIndex(
          (item) => item.vehicle_maintenance_id === action.payload.vehicle_maintenance_id
        );
        if (index >= 0) state.items[index] = action.payload;
      })
      .addCase(updateVehicleMaintenanceThunk.rejected, (state, action) => {
        state.saving = false;
        state.error = action.error.message || "Failed to update vehicle maintenance";
      })
      .addCase(runVehicleMaintenanceWorkflowThunk.pending, (state) => {
        state.workflowLoading = true;
        state.error = null;
      })
      .addCase(runVehicleMaintenanceWorkflowThunk.fulfilled, (state, action) => {
        state.workflowLoading = false;
        state.entities[action.payload.vehicle_maintenance_id] = action.payload;
        const index = state.items.findIndex(
          (item) => item.vehicle_maintenance_id === action.payload.vehicle_maintenance_id
        );
        if (index >= 0) state.items[index] = action.payload;
      })
      .addCase(runVehicleMaintenanceWorkflowThunk.rejected, (state, action) => {
        state.workflowLoading = false;
        state.error = action.error.message || "Failed to update vehicle maintenance workflow";
      })
      .addCase(fetchVehicleMaintenanceHistoryThunk.pending, (state) => {
        state.historyLoading = true;
        state.error = null;
      })
      .addCase(fetchVehicleMaintenanceHistoryThunk.fulfilled, (state, action) => {
        state.historyLoading = false;
        state.historiesById[action.payload.id] = action.payload.histories;
      })
      .addCase(fetchVehicleMaintenanceHistoryThunk.rejected, (state, action) => {
        state.historyLoading = false;
        state.error = action.error.message || "Failed to fetch vehicle maintenance history";
      })
      .addCase(deleteVehicleMaintenanceThunk.pending, (state) => {
        state.deleting = true;
        state.error = null;
      })
      .addCase(deleteVehicleMaintenanceThunk.fulfilled, (state, action) => {
        state.deleting = false;
        removeIds(state, [action.payload]);
      })
      .addCase(deleteVehicleMaintenanceThunk.rejected, (state, action) => {
        state.deleting = false;
        state.error = action.error.message || "Failed to delete vehicle maintenance";
      })
      .addCase(bulkDeleteVehicleMaintenancesThunk.pending, (state) => {
        state.bulkDeleting = true;
        state.error = null;
      })
      .addCase(bulkDeleteVehicleMaintenancesThunk.fulfilled, (state, action) => {
        state.bulkDeleting = false;
        removeIds(state, action.payload.deleted_ids);
      })
      .addCase(bulkDeleteVehicleMaintenancesThunk.rejected, (state, action) => {
        state.bulkDeleting = false;
        state.error = action.error.message || "Failed to bulk delete vehicle maintenances";
      });
  },
});

export const {
  clearSelectedVehicleMaintenanceIds,
  setSelectedVehicleMaintenanceIds,
  setVehicleMaintenancePagination,
  upsertVehicleMaintenanceCache,
} = vehicleMaintenanceSlice.actions;

export default vehicleMaintenanceSlice.reducer;
