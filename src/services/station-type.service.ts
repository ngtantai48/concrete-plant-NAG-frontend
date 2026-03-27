import http from "@/lib/http";

const stationTypeApi = {
  getAll: () => http.get("/station-types"),
};

export default stationTypeApi;
