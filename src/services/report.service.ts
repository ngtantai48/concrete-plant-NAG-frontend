import http from "@/lib/http";
import type { MaintenanceForecastResponse } from "@/types/report";

export interface MaintenanceForecastParams {
  days_ahead?: number;
  risk_level?: "all" | "normal" | "warning" | "critical";
}

const reportApi = {
  getMaintenanceForecast: (params: MaintenanceForecastParams) =>
    http.get<MaintenanceForecastResponse>("/reports/maintenance-forecast", { params }),
};

export default reportApi;
