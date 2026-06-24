import type { Order } from "./order";
import type { Work } from "./work";

export type WorkAssignmentColumnKey = "pump_vehicle" | "driver" | "operator" | "hose";
export type WorkPumpRoleKey = "driver" | "operator" | "hose";
export type WorkAttendanceStatus = "working" | "morning" | "afternoon" | "full_day";

export interface WorkPersonnel {
  user_id: number;
  user_full_name: string;
  user_short_name?: string | null;
  department_id?: number | null;
  department_name?: string | null;
  skill_id?: number | null;
  skill_name?: string | null;
}

export interface WorkVehicle {
  vehicle_id: number;
  vehicle_name?: string | null;
  vehicle_license_plate?: string | null;
  vehicle_type_id?: number | null;
  vehicle_type_name?: string | null;
  vehicle_type_symbol?: string | null;
  vehicle_status?: string | null;
}

export interface WorkAttendanceDraft {
  work_date: string;
  user_statuses: {
    user_id: number;
    status: WorkAttendanceStatus;
  }[];
  updated_at?: string;
}

export interface WorkAttendanceBootstrap {
  work_date: string;
  personnel: WorkPersonnel[];
  is_attendance_marked?: boolean;
  draft?: WorkAttendanceDraft | null;
}

export interface WorkAssignmentDraft {
  work_date: string;
  pump_assignments: {
    assignment_id: string;
    vehicle_id: number;
    roles: Record<WorkPumpRoleKey, number[]>;
  }[];
  columns?: Record<WorkAssignmentColumnKey, number[]>;
  prefilled_from_date?: string;
  updated_at?: string;
}

export interface WorkLegacyAssignmentDraft {
  work_date: string;
  columns: Record<WorkAssignmentColumnKey, number[]>;
  updated_at?: string;
}

export interface WorkAssignmentBootstrap {
  work_date: string;
  personnel: WorkPersonnel[];
  vehicles: WorkVehicle[];
  half_day_user_ids: number[];
  draft?: WorkAssignmentDraft | null;
}

export interface WorkMixerAssignmentDraft {
  work_date: string;
  mixer_assignments: {
    assignment_id: string;
    vehicle_id: number;
    user_id: number | null; // 1 tài xế / xe; null = chưa gán
  }[];
  prefilled_from_date?: string;
  updated_at?: string;
}

export interface WorkArrangementBootstrap {
  work_date: string;
  personnel: WorkPersonnel[];
  half_day_user_ids: number[];
  pump: { vehicles: WorkVehicle[]; draft: WorkAssignmentDraft };
  mixer: { vehicles: WorkVehicle[]; draft: WorkMixerAssignmentDraft };
}

/**
 * Một dòng "lốt trộn" = 1 đơn pending đã gán xe, hiển thị dạng `short_name_code`.
 * code = 3 số cuối biển số với xe bồn (ký hiệu X), hoặc "XB" với xe bơm.
 */
export interface WorkMixSlotItem {
  order_id: number;
  order_number: number;
  order_status?: Order["order_status"];
  group?: "pending" | "running" | string;
  user_id: number;
  vehicle_id: number;
  vehicle_name: string | null;
  vehicle_license_plate: string;
  vehicle_type_symbol: string | null;
  short_name: string;
  code: string;
  label: string;
}

export interface WorkTaskAssignmentDraft {
  work_date: string;
  task_assignments: {
    assignment_id: string;
    work_id: number;
    user_ids: number[];
  }[];
  prefilled_from_date?: string;
  updated_at?: string;
}

export interface WorkTaskBootstrap {
  work_date: string;
  personnel: WorkPersonnel[];
  works: Work[];
  draft: WorkTaskAssignmentDraft;
}
