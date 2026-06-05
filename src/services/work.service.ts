import http from "@/lib/http";
import type { Work, WorkPayload } from "@/types/work";

export interface ListWorksParams {
  page?: number;
  limit?: number;
  work_name?: string;
}

export interface ListWorks {
  data: Work[];
  total: number;
  page: number;
  limit: number;
}

const getArrayFromPayload = (payload: unknown): Work[] => {
  if (Array.isArray(payload)) return payload as Work[];
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const candidates = [record.data, record.works, record.items, record.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Work[];
  }

  return [];
};

const getWorkFromPayload = (payload: unknown): Work => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: Work }).data;
  }

  return payload as Work;
};

const normalizeListWorks = (payload: unknown, params?: ListWorksParams): ListWorks => {
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

export const workApi = {
  list: async (params?: ListWorksParams): Promise<ListWorks> => {
    const res = await http.get("/works", { params });
    return normalizeListWorks(res.data, params);
  },

  create: async (payload: WorkPayload): Promise<Work> => {
    const res = await http.post("/works", payload);
    return getWorkFromPayload(res.data);
  },

  update: async (workId: number, payload: WorkPayload): Promise<Work> => {
    const res = await http.put(`/works/${workId}`, payload);
    return getWorkFromPayload(res.data);
  },

  delete: async (workId: number): Promise<void> => {
    await http.delete(`/works/${workId}`);
  },

  getById: async (workId: number): Promise<Work> => {
    const res = await http.get(`/works/${workId}`);
    return getWorkFromPayload(res.data);
  },
};
