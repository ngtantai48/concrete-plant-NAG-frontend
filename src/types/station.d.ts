export interface Station {
    station_id: number;
    station_name: string;
    station_address: string;
    station_gps: string;
    station_gps_geofencing: number;
    station_status: string;
    station_description: string;
    station_type_id: number;
    station_types?: {
        station_type_id: number;
        station_type_name: string;
        station_type_description: string;
    };
}

export interface StationType {
  station_type_id: number;
  station_type_name: string;
  station_type_description: string | null;
}
