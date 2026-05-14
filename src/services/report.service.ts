import http from "@/lib/http";
import type { CreateAiReportPayload, CreateAiReportResponse, MaintenanceForecastResponse } from "@/types/report";

export interface MaintenanceForecastParams {
  days_ahead?: number;
  risk_level?: "all" | "normal" | "warning" | "critical";
}

const reportApi = {
  getMaintenanceForecast: (params: MaintenanceForecastParams) =>
    http.get<MaintenanceForecastResponse>("/reports/maintenance-forecast", { params }),
  createAiReport: async (payload: CreateAiReportPayload): Promise<CreateAiReportResponse> => {
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `Không thể tạo báo cáo (${response.status})`);
    }

    return (await response.json()) as CreateAiReportResponse;
  },
};

export default reportApi;
