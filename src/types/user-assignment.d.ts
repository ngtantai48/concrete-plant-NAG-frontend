export interface UserAssignment {
  user_assignment_id?: number;
  assignment_id?: number;
  user_id?: number;
  department_id?: number;
  skill_id?: number;
  user_full_name: string;
  user_short_name?: string | null;
  department_name: string;
  skill_name: string;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  updated_by?: number;
  delete_flag?: boolean;
}

export interface UserAssignmentPayload {
  user_id: number;
  department_id: number;
  skill_id: number;
}

export interface UpdateUserAssignmentPayload {
  department_id: number;
  skill_id: number;
}
