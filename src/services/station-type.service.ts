import http from "@/lib/http";

export interface StationType {
  station_type_id: number;
  station_type_name: string;
  station_type_description: string | null;
}

const stationTypeApi = {
  getAll: () => http.get("/station-types"),
};

export default stationTypeApi;
