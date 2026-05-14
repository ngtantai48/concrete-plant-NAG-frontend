export type MaintenanceRiskLevel = "normal" | "warning" | "critical";

export interface MaintenanceForecastItem {
  vehicle_id: number;
  vehicle_license_plate: string;
  vehicle_name?: string | null;
  vehicle_status?: string | null;
  risk_level: MaintenanceRiskLevel;
  last_maintenance_at?: string | null;
  distance_since_last_maintenance_km?: number | null;
  km_until_due?: number | null;
  rule_hit?: string | null;
  note?: string | null;
}

export interface MaintenanceForecastResponse {
  date?: string;
  days_ahead?: number;
  thresholds?: Record<string, unknown>;
  total?: number;
  items?: MaintenanceForecastItem[];
}

export type AiReportContext = "fleet" | "production" | "maintenance";

export interface AiReportTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  status?: "streaming" | "done" | "error";
  totalMs?: number;
}

export interface AiReportBlock {
  id: string;
  type: string;
  title?: string;
  createdAt: string;
  data: unknown;
}

export interface CreateAiReportPayload {
  conversationId: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  activeContext: AiReportContext;
  shareUrl?: string;
  turns: AiReportTurn[];
  blocks: AiReportBlock[];
}

export interface AiGeneratedReport {
  id: string;
  conversationId: string;
  title: string;
  createdAt: string;
  filename: string;
  format: "pdf";
  mimeType: "application/pdf";
  markdown: string;
  html?: string;
  blockCount: number;
  turnCount: number;
  sizeBytes?: number;
}

export interface CreateAiReportResponse extends AiGeneratedReport {
  pdfBase64: string;
  sizeBytes: number;
}
