export interface VtrackingAttribute {
  attribute_type?: string;
  attribute_key: string;
  value: unknown;
  [key: string]: unknown;
}

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
  attributes?: VtrackingAttribute[];
}

export interface VtrackingResponse {
  total: number;
  vehicles: VtrackingVehicle[];
}
