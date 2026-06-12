import type { VehicleMedia } from './media';
import type { Driver } from './driver';

export interface Vehicle {
  vehicle_id: number;
  vehicle_name?: string | null;
  vehicle_license_plate: string;
  vehicle_status: string;
  vehicle_description: string | null;
  vehicle_rfid: string | null;
  vehicle_type_id: number;
  user_id?: number | null;
  updated_at?: string;
  updated_by?: number;
  media?: VehicleMedia[];
  users?: Pick<Driver, 'user_id' | 'user_full_name' | 'username' | 'role'> | null;
}

export interface VehicleType {
  vehicle_type_id: number;
  vehicle_type_name: string;
  vehicle_type_symbol?: string | null;
  vehicle_type_description: string | null;
  updated_at?: string;
  updated_by?: number;
}

export interface VehicleMaintenance {
  vehicle_maintenance_id: number;
  vehicle_maintenance_from_datetime: string;
  vehicle_maintenance_to_datetime?: string | null;
  vehicle_maintenance_location?: string | null;
  vehicle_distance_covered?: number | null;
  vehicle_maintenance_description?: string | null;
  vehicle_maintenance_type?: string;
  vehicle_maintenance_rank?: number;
  vehicle_maintenance_status?: string;
  payment_status?: string;
  deadline_pay?: string | null;
  paid_at?: string | null;
  service_provider_name?: string | null;
  service_provider_address?: string | null;
  invoice_no?: string | null;
  invoice_date?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  vehicle_maintenance_ocr_text?: string | null;
  reported_by?: number | null;
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  created_by?: number | null;
  vehicle_id: number;
  vehicle?: Pick<Vehicle, 'vehicle_id' | 'vehicle_name' | 'vehicle_license_plate' | 'vehicle_status'> | null;
  created_by_user?: {
    user_id: number;
    user_full_name: string;
  } | null;
  reviewed_by_user?: {
    user_id: number;
    user_full_name: string;
  } | null;
  document_count?: number;
  documents?: VehicleMaintenanceDocument[];
  workflow_available_actions?: VehicleMaintenanceWorkflowAction[];
  ai_insight?: VehicleMaintenanceAiInsight | null;
}

export type VehicleMaintenanceWorkflowAction =
  | 'submit'
  | 'dispatch_approve'
  | 'dispatch_reject'
  | 'production_approve'
  | 'production_reject'
  | 'revert_approval';

export interface VehicleMaintenanceHistory {
  vehicle_maintenance_history_id: number;
  vehicle_maintenance_id: number;
  action: string;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  actor: {
    id: number;
    role?: string | null;
    role_label?: string | null;
    name?: string | null;
  };
  created_at: string;
}

export interface VehicleMaintenanceDocument {
  vehicle_maintenance_document_id: number;
  vehicle_maintenance_id: number;
  media_id: number;
  document_type: string;
  ocr_status: string;
  ocr_raw_text?: string | null;
  ocr_text?: string | null;
  ocr_confidence?: number | null;
  ocr_provider?: string | null;
  ocr_error?: string | null;
  sort_order?: number;
  updated_at?: string;
  media?: VehicleMedia | null;
}

export interface DriverMaintenanceContext {
  date: string;
  default_vehicle_id: number | null;
  can_select_any_vehicle: boolean;
  assigned_vehicles_today: Array<
    Pick<Vehicle, 'vehicle_id' | 'vehicle_name' | 'vehicle_license_plate' | 'vehicle_status'> & {
      assignment_sources?: string[];
    }
  >;
}

export interface VehicleMaintenanceAiInsightFlag {
  code: 'cost_anomaly' | 'repeat_issue' | 'missing_invoice' | 'long_duration' | 'other';
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

export interface VehicleMaintenanceAiInsight {
  summary: string | null;
  suggested_type: string | null;
  suggested_rank: number | null;
  flags: VehicleMaintenanceAiInsightFlag[];
  recommendation: 'approve' | 'review_carefully' | null;
  suggested_reject_reason: string | null;
  confidence: number | null;
  status: 'pending' | 'done' | 'failed';
  error: string | null;
  generated_at: string | null;
  applied_by: number | null;
  applied_at: string | null;
}

export interface PendingMaintenanceCard {
  vehicle_maintenance_id: number;
  vehicle: Pick<Vehicle, 'vehicle_id' | 'vehicle_license_plate' | 'vehicle_name'>;
  vehicle_maintenance_type: string;
  vehicle_maintenance_rank: number;
  vehicle_maintenance_status: string;
  total_amount: number | null;
  vehicle_maintenance_from_datetime: string;
  vehicle_maintenance_to_datetime: string | null;
  submitted_at: string;
  created_by_user: { user_id: number; user_full_name: string | null };
  ai_insight: VehicleMaintenanceAiInsight | null;
  workflow_available_actions: VehicleMaintenanceWorkflowAction[];
}

export interface MaintenanceAiOverview {
  generated_at: string;
  period: string;
  sections: {
    repeat_offenders: Array<{
      vehicle: Pick<Vehicle, 'vehicle_id' | 'vehicle_license_plate' | 'vehicle_name'>;
      count: number;
      total_amount: number;
    }>;
    stale_pending: Array<{
      vehicle_maintenance_id: number;
      vehicle: Pick<Vehicle, 'vehicle_id' | 'vehicle_license_plate' | 'vehicle_name'>;
      status: string;
      waiting_hours: number;
    }>;
    upcoming_maintenance: Array<{
      vehicle: Pick<Vehicle, 'vehicle_id' | 'vehicle_license_plate' | 'vehicle_name'>;
      basis: 'km' | 'days';
      remaining: number;
    }>;
  };
  ai_commentary: string;
}
