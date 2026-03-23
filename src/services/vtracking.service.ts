import axios from "axios";

export interface VtrackingVehicle {
  device_id: string;
  vehicle_name: string;
  license_plate: string;
  latitude: number;
  longitude: number;
  speed: number;
  status: string;
  geocoding: string;
  direction: number;
  timestamp: number;
}

export interface VtrackingResponse {
  total: number;
  vehicles: VtrackingVehicle[];
}

const vtrackingApi = {
  fetchVehicles: () =>
    axios.get<VtrackingResponse>("/api/vtracking/gps"),
};

export default vtrackingApi;
