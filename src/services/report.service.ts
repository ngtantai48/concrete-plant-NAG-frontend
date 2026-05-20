import http from "@/lib/http";
import type {
  CreateAiReportPayload,
  CreateAiReportResponse,
  FuelConsumptionQuery,
  FuelConsumptionResponse,
  MaintenanceForecastQuery,
  MaintenanceForecastResponse,
  ProductionQuery,
  ProductionReportResponse,
} from "@/types/report";

const reportApi = {
  /** GET /api/v1/reports/production */
  getProduction: (params?: ProductionQuery) =>
    http.get<ProductionReportResponse>("/reports/production", { params }),

  /** GET /api/v1/reports/maintenance/forecast */
  getMaintenanceForecast: (params?: MaintenanceForecastQuery) =>
    http.get<MaintenanceForecastResponse>("/reports/maintenance/forecast", { params }),

  /** GET /api/v1/reports/fuel-consumption */
  getFuelConsumption: (params?: FuelConsumptionQuery) =>
    http.get<FuelConsumptionResponse>("/reports/fuel-consumption", { params }),

  /** POST /api/reports (Next.js route) — generate AI PDF report */
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
