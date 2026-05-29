import http from "@/lib/http";

export interface Role {
  id: number;
  role: string;
  role_label: string;
}

const unwrapData = <T>(payload: unknown): T => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
};

const normalizeRole = (role: unknown): Role => {
  const record = role && typeof role === "object" ? (role as Record<string, unknown>) : {};
  const roleName = String(record.role || "");

  return {
    id: Number(record.id),
    role: roleName,
    role_label: String(record.role_label || roleName),
  };
};

const normalizeRoleList = (payload: unknown): Role[] => {
  const data = unwrapData<unknown>(payload);
  if (!Array.isArray(data)) return [];
  return data.map(normalizeRole).filter((role) => role.id && role.role);
};

const normalizeRolePayload = (payload: unknown): Role =>
  normalizeRole(unwrapData<unknown>(payload));

const roleApi = {
  list: async (): Promise<Role[]> => {
    const res = await http.get("/roles");
    return normalizeRoleList(res.data);
  },

  create: async (data: { role: string; role_label: string }): Promise<Role> => {
    const res = await http.post("/roles", data);
    return normalizeRolePayload(res.data);
  },

  update: async (id: number, data: { role_label: string }): Promise<Role> => {
    const res = await http.put(`/roles/${id}`, data);
    return normalizeRolePayload(res.data);
  },

  delete: async (id: number): Promise<void> => {
    await http.delete(`/roles/${id}`);
  },
};

export default roleApi;
