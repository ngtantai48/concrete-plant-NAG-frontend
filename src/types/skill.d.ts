export interface Skill {
  skill_id: number;
  skill_name: string;
  skill_description?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  updated_by?: number;
  delete_flag?: boolean;
}

export interface SkillPayload {
  skill_name: string;
  skill_description?: string | null;
}
