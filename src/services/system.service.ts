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

export interface TankerQueueSnapshotItem {
  user_id: number;
  order_id: number;
  position: number;
  station_id: number;
  vehicle_id: number;
  order_number: number;
  order_status: string;
  vehicle_name: string;
  order_init_datetime: string;
  order_start_datetime: string | null;
  vehicle_license_plate: string;
}

export interface TankerQueueSnapshotData {
  items: TankerQueueSnapshotItem[];
  snapshot_at: string;
  total_items: number;
  pending_count: number;
  running_count: number;
  snapshot_date: string;
  snapshot_note: string;
}

export interface TankerQueueSnapshotResponse {
  statusCode: number;
  multi_id: number;
  multi_name: string;
  multi_description: string;
  multi_data: TankerQueueSnapshotData;
  multi_type: string;
  created_at: string;
  updated_at: string;
  created_by: number;
  updated_by: number;
  delete_flag: boolean;
}

const systemApi = {
  getTransportsRuntime: () => 
    http.get<TransportsRuntimeResponse>("/multi/transports-runtime"),
  
  updateTransportsRuntime: (data: TransportsRuntimeData) => 
    http.put<TransportsRuntimeResponse>("/multi/transports-runtime", data),

  getTankerQueueSnapshot: (date: string) =>
    http.get<TankerQueueSnapshotResponse>("/multi/tanker-queue-snapshot", {
      params: { date },
    }),
};

export default systemApi;
