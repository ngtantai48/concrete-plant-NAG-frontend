import http from "@/lib/http";

export interface TransportsRuntimeData {
  cmr_station_min_stay_minutes: number;
  station_checkout_vehicle_checkin_warning_minutes: number;
  station_checkout_vehicle_checkin_timeout_minutes: number;
}

export interface TransportsRuntimeResponse {
  statusCode: number;
  multi_id: number;
  multi_name: string;
  multi_type: string;
  multi_data: TransportsRuntimeData;
  updated_at: string;
  updated_by: number;
}

const systemApi = {
  getTransportsRuntime: () => 
    http.get<TransportsRuntimeResponse>("/multi/transports-runtime"),
  
  updateTransportsRuntime: (data: TransportsRuntimeData) => 
    http.put<TransportsRuntimeResponse>("/multi/transports-runtime", data),
};

export default systemApi;
