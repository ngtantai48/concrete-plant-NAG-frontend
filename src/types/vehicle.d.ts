import type { VehicleMedia } from './media';

export interface Vehicle {
  vehicle_id: number;
  vehicle_license_plate: string;
  vehicle_status: string;
  vehicle_description: string | null;
  vehicle_rfid: string | null;
  vehicle_type_id: number;
  updated_at?: string;
  updated_by?: number;
  media?: VehicleMedia[];
}

export interface VehicleType {
  vehicle_type_id: number;
  vehicle_type_name: string;
  vehicle_type_description: string | null;
  updated_at?: string;
  updated_by?: number;
}

export interface VehicleMaintenance {
  vehicle_maintenance_id: number;
  vehicle_maintenance_from_datetime: string;
  vehicle_maintenance_to_datetime: string;
  vehicle_distance_covered: number;
  vehicle_maintenance_description: string;
  vehicle_id: number;
}
