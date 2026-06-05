import http from "@/lib/http";
import type { Skill, SkillPayload } from "@/types/skill";

export interface ListSkillsParams {
  page?: number;
  limit?: number;
  skill_name?: string;
}

export interface ListSkills {
  data: Skill[];
  total: number;
  page: number;
  limit: number;
}

const getArrayFromPayload = (payload: unknown): Skill[] => {
  if (Array.isArray(payload)) return payload as Skill[];
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const candidates = [record.data, record.skills, record.items, record.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Skill[];
  }

  return [];
};

const getSkillFromPayload = (payload: unknown): Skill => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: Skill }).data;
  }

  return payload as Skill;
};

const normalizeListSkills = (payload: unknown, params?: ListSkillsParams): ListSkills => {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = getArrayFromPayload(payload);

  return {
    data,
    total:
      Number(record.total) ||
      Number((record.meta as Record<string, unknown> | undefined)?.total) ||
      Number((record.pagination as Record<string, unknown> | undefined)?.total) ||
      data.length,
    page: Number(record.page) || params?.page || 1,
    limit: Number(record.limit) || params?.limit || data.length || 10,
  };
};

export const skillApi = {
  list: async (params?: ListSkillsParams): Promise<ListSkills> => {
    const res = await http.get("/skills", { params });
    return normalizeListSkills(res.data, params);
  },

  create: async (payload: SkillPayload): Promise<Skill> => {
    const res = await http.post("/skills", payload);
    return getSkillFromPayload(res.data);
  },

  update: async (skillId: number, payload: SkillPayload): Promise<Skill> => {
    const res = await http.put(`/skills/${skillId}`, payload);
    return getSkillFromPayload(res.data);
  },

  delete: async (skillId: number): Promise<void> => {
    await http.delete(`/skills/${skillId}`);
  },

  getById: async (skillId: number): Promise<Skill> => {
    const res = await http.get(`/skills/${skillId}`);
    return getSkillFromPayload(res.data);
  },
};
