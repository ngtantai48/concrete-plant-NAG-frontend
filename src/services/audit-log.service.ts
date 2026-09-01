import http from "@/lib/http";

export interface AuditLogUser {
  user_id?: number;
  user_full_name?: string;
  user_short_name?: string | null;
}

export interface AuditLog {
  audit_log_id: number;
  user_id: number | null;
  user_role: string | null;
  audit_action: string;
  audit_module: string;
  target_id: string | null;
  http_method: string;
  request_path: string;
  status_code: number;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  request_query: Record<string, unknown> | null;
  request_params: Record<string, unknown> | null;
  request_body: Record<string, unknown> | null;
  duration_ms: number | null;
  created_at: string;
  users?: AuditLogUser | null;
}

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  user_id?: number;
  audit_action?: string;
  audit_module?: string;
  http_method?: string;
  success?: boolean;
  from_date?: string;
  to_date?: string;
  search?: string;
}

export interface ListAuditLogsResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

const auditLogApi = {
  list: async (params?: ListAuditLogsParams): Promise<ListAuditLogsResponse> => {
    const res = await http.get<ListAuditLogsResponse>("/audit-logs", { params });
    return res.data;
  },
};

export default auditLogApi;
