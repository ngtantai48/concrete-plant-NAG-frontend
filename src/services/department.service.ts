import http from "@/lib/http";
import type { Department, DepartmentPayload } from "@/types/department";

export interface ListDepartmentsParams {
  page?: number;
  limit?: number;
  department_name?: string;
  manager_id?: number;
}

export interface ListDepartments {
  data: Department[];
  total: number;
  page: number;
  limit: number;
}

const getArrayFromPayload = (payload: unknown): Department[] => {
  if (Array.isArray(payload)) return payload as Department[];
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const candidates = [record.data, record.departments, record.items, record.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Department[];
  }

  return [];
};

const getDepartmentFromPayload = (payload: unknown): Department => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: Department }).data;
  }

  return payload as Department;
};

const normalizeListDepartments = (
  payload: unknown,
  params?: ListDepartmentsParams
): ListDepartments => {
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

export const departmentApi = {
  list: async (params?: ListDepartmentsParams): Promise<ListDepartments> => {
    const res = await http.get("/departments", { params });
    return normalizeListDepartments(res.data, params);
  },

  create: async (payload: DepartmentPayload): Promise<Department> => {
    const res = await http.post("/departments", payload);
    return getDepartmentFromPayload(res.data);
  },

  update: async (departmentId: number, payload: DepartmentPayload): Promise<Department> => {
    const res = await http.put(`/departments/${departmentId}`, payload);
    return getDepartmentFromPayload(res.data);
  },

  delete: async (departmentId: number): Promise<void> => {
    await http.delete(`/departments/${departmentId}`);
  },

  getById: async (departmentId: number): Promise<Department> => {
    const res = await http.get(`/departments/${departmentId}`);
    return getDepartmentFromPayload(res.data);
  },
};
