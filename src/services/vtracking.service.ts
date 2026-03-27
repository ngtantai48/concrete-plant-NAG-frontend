import axios from "axios";

import type { VtrackingVehicle, VtrackingResponse } from "@/types/vtracking";

const vtrackingApi = {
  fetchVehicles: () =>
    axios.get<VtrackingResponse>("/api/vtracking/gps"),
};

export default vtrackingApi;
