import http from "@/lib/http";
import type {
  ProductionQuery,
  ProductionReportResponse,
  MaintenanceForecastQuery,
  MaintenanceForecastResponse,
  FuelConsumptionQuery,
  FuelConsumptionResponse,
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
};

export default reportApi;
