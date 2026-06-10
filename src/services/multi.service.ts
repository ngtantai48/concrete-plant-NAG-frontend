import http from "@/lib/http";

export interface MultiSpecData {
  data?: string[] | string;
  [key: string]: unknown;
}

export interface MultiSpec {
  multi_id?: number;
  multi_name: string;
  multi_data: MultiSpecData;
  multi_type: string;
  multi_description?: string;
}

export interface MultiSpecResponse {
  multi_id: number;
  multi_name: string;
  multi_data: MultiSpecData;
  multi_type: string;
  multi_description?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  updated_by?: number;
}

interface PaginatedMultiResponse {
  statusCode: number;
  data: MultiSpecResponse[];
  total: number;
  page: number;
  limit: number;
}

function parseCommentData<T>(data?: MultiSpecData | null): T[] {
  const raw = Array.isArray(data?.data) ? data?.data[0] : data?.data;
  if (!raw || typeof raw !== "string") return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

class MultiService {
  private readonly baseUrl = "/multi";

  async getAll(type?: string, limit?: number): Promise<MultiSpecResponse[]> {
    const params: Record<string, string | number> = {};
    if (type) params.multi_type = type;
    if (limit) params.limit = limit;

    const response = await http.get<PaginatedMultiResponse>(this.baseUrl, { params });
    return response.data.data || [];
  }

  async getById(id: number): Promise<MultiSpecResponse> {
    const response = await http.get<MultiSpecResponse>(`${this.baseUrl}/${id}`);
    return response.data;
  }

  async create(data: MultiSpec): Promise<MultiSpecResponse> {
    const response = await http.post<MultiSpecResponse>(this.baseUrl, data);
    return response.data;
  }

  async update(id: number, data: Partial<MultiSpec>): Promise<MultiSpecResponse> {
    const response = await http.put<MultiSpecResponse>(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  async getVehicleMaintenanceDiscussComments<T>(
    maintenanceId: number
  ): Promise<{ comments: T[]; multiId: number | null }> {
    const multiType = `discuss-vehicle-maintenance-${maintenanceId}`;
    const results = await this.getAll(multiType, 1);
    const record = results[0];
    if (!record) return { comments: [], multiId: null };

    return {
      comments: parseCommentData<T>(record.multi_data),
      multiId: record.multi_id,
    };
  }

  async saveVehicleMaintenanceDiscussComments<T>(
    maintenanceId: number,
    comments: T[],
    multiId: number | null
  ): Promise<number> {
    const payload: MultiSpec = {
      multi_name: "discuss",
      multi_type: `discuss-vehicle-maintenance-${maintenanceId}`,
      multi_description: `Thao luan phieu bao tri #${maintenanceId}`,
      multi_data: { data: [JSON.stringify(comments)] },
    };

    if (multiId) {
      await this.update(multiId, payload);
      return multiId;
    }

    const created = await this.create(payload);
    return created.multi_id;
  }
}

export const multiService = new MultiService();
