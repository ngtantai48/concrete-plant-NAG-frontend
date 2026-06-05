import type { User } from "@/types/user";

export interface Department {
  department_id: number;
  department_name: string;
  department_description?: string | null;
  department_root?: number | null;
  manager_id?: number | null;
  manager?: User | null;
  manager_user?: User | null;
  users?: User[] | User | null;
  department_users?: User[] | null;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  updated_by?: number;
  delete_flag?: boolean;
}

export interface DepartmentPayload {
  department_name: string;
  department_description?: string | null;
  department_root: number;
  manager_id?: number | null;
}
