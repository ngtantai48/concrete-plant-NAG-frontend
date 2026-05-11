import http from "@/lib/http";

const transportApi = {
    /** Camera check-in: vehicle enters station (pending → collecting) */
    cmrStationCheck: (data: { vehicle_name: string; station_id: number }) =>
        http.post("/transports/check/cmr-station", data),

    /** Camera check-out: vehicle leaves station (collecting → transporting) */
    cmrStationCheckout: (data: { station_id: number }) =>
        http.post("/transports/check/cmr-station-checkout", data),
};

export default transportApi;
