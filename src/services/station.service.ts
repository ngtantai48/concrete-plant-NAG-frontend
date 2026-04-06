import http from "@/lib/http";
import type { Station } from "@/types/station";

const stationApi = {
    getAll: () => http.get("/stations?limit=1000"),
    create: (data: Partial<Station>) => http.post("/stations", data),
    update: (id: number, data: Partial<Station>) => http.put(`/stations/${id}`, data),
    delete: (id: number) => http.delete(`/stations/${id}`),
    reportIncident: (id: number, data: { station_incident_description: string }) => http.put(`/stations/${id}/incident`, data),
    reportStop: (id: number) => http.put(`/stations/${id}/stopped`),
    reportOperating: (id: number) => http.put(`/stations/${id}/operating`),
};

export default stationApi;
