import http from "@/lib/http";
import type {
  UpdateUserAssignmentPayload,
  UserAssignment,
  UserAssignmentPayload,
} from "@/types/user-assignment";

export interface ListUserAssignmentsParams {
  page?: number;
  limit?: number;
  user_full_name?: string;
  department_id?: number;
  skill_id?: number;
}

export interface ListUserAssignments {
  data: UserAssignment[];
  total: number;
  page: number;
  limit: number;
}

const getArrayFromPayload = (payload: unknown): UserAssignment[] => {
  if (Array.isArray(payload)) return payload as UserAssignment[];
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.data,
    record.user_assignments,
    record.assignments,
    record.items,
    record.results,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as UserAssignment[];
  }

  return [];
};

const getAssignmentFromPayload = (payload: unknown): UserAssignment => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: UserAssignment }).data;
  }

  return payload as UserAssignment;
};

const normalizeListUserAssignments = (
  payload: unknown,
  params?: ListUserAssignmentsParams
): ListUserAssignments => {
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

export const userAssignmentApi = {
  list: async (params?: ListUserAssignmentsParams): Promise<ListUserAssignments> => {
    const res = await http.get("/user-assignments", { params });
    return normalizeListUserAssignments(res.data, params);
  },

  create: async (payload: UserAssignmentPayload): Promise<UserAssignment> => {
    const res = await http.post("/user-assignments", payload);
    return getAssignmentFromPayload(res.data);
  },

  updateById: async (
    assignmentId: number,
    payload: UserAssignmentPayload | UpdateUserAssignmentPayload
  ): Promise<UserAssignment> => {
    const res = await http.put(`/user-assignments/${assignmentId}`, {
      department_id: payload.department_id,
      skill_id: payload.skill_id,
    });
    return getAssignmentFromPayload(res.data);
  },

  deleteById: async (assignmentId: number): Promise<void> => {
    await http.delete(`/user-assignments/${assignmentId}`);
  },
};
