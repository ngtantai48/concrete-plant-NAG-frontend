import axios from "axios";

import type { VtrackingVehicle, VtrackingResponse } from "@/types/vtracking";

const vtrackingApi = {
  fetchVehicles: () => axios.get<VtrackingResponse>("/api/vtracking/gps"),

  fetchHistory: (vehicleId: string, fromDate: string, toDate: string) =>
    axios.post<{ logs: Record<string, unknown>[] }>("/api/vtracking/history", {
      vehicleId,
      fromDate,
      toDate,
    }),
};

export default vtrackingApi;
