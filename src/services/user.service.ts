import http from "@/lib/http";
import type { CreateUserPayload, UpdateUserPayload, User, UserRole } from "@/types/user";

export interface ListUsersParams {
  page?: number;
  limit?: number;
  user_full_name?: string;
  username?: string;
  user_phone_number?: string;
  user_email?: string;
  role?: UserRole | UserRole[];
}

export interface ListUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
}

const getArrayFromPayload = (payload: unknown): User[] => {
  if (Array.isArray(payload)) return payload as User[];
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const candidates = [record.data, record.users, record.items, record.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as User[];
  }

  return [];
};

const getUserFromPayload = (payload: unknown): User => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: User }).data;
  }

  return payload as User;
};

const normalizeListUsers = (payload: unknown, params?: ListUsersParams): ListUsers => {
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
    limit: Number(record.limit) || params?.limit || 10,
  };
};

export const userApi = {
  list: async (params?: ListUsersParams): Promise<ListUsers> => {
    const res = await http.get("/users", { params });
    return normalizeListUsers(res.data, params);
  },

  create: async (payload: CreateUserPayload): Promise<User> => {
    const res = await http.post("/users", payload);
    return getUserFromPayload(res.data);
  },

  update: async (userId: number, payload: UpdateUserPayload): Promise<User> => {
    const res = await http.put(`/users/${userId}`, payload);
    return getUserFromPayload(res.data);
  },

  delete: async (userId: number): Promise<void> => {
    await http.delete(`/users/${userId}`);
  },

  getById: async (userId: number): Promise<User> => {
    const res = await http.get(`/users/${userId}`);
    return getUserFromPayload(res.data);
  },
};
