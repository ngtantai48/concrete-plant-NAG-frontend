export interface Work {
  work_id: number;
  work_name: string;
  work_description?: string | null;
  /** 0 hoặc null = công việc gốc; > 0 = work_id của công việc cha (self-reference). */
  work_root?: number | null;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  updated_by?: number;
  delete_flag?: boolean;
}

export interface WorkPayload {
  work_name: string;
  work_description?: string | null;
  work_root?: number | null;
}
