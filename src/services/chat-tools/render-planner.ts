import type { ToolResult } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function hhmm() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

function fence(block: unknown) {
  return `:::render\n${JSON.stringify(block)}\n:::`;
}

function positiveRows(rows: Array<{ label: string; value: number; color?: string }>) {
  return rows.filter((row) => row.value > 0);
}

function plannedProductionBlocks(data: Record<string, unknown>) {
  const stamp = hhmm();
  const summary = isRecord(data.summary) ? data.summary : {};
  const from = stringValue(data.from);
  const to = stringValue(data.to);
  const dateLabel = from && to && from === to ? from : from && to ? `${from} - ${to}` : "hôm nay";
  const topVehicles = asRecordArray(data.top_vehicles);
  const topStations = asRecordArray(data.top_stations);
  const topDrivers = asRecordArray(data.top_drivers);
  const statusRows = positiveRows([
    { label: "Hoàn thành", value: numberValue(summary.completed), color: "#34C759" },
    { label: "Đang chạy", value: numberValue(summary.running), color: "#007AFF" },
    { label: "Đang thu thập", value: numberValue(summary.collecting), color: "#FF9F0A" },
    { label: "Đang vận chuyển", value: numberValue(summary.transporting), color: "#AF52DE" },
    { label: "Chờ xử lý", value: numberValue(summary.pending), color: "#8E8E93" },
    { label: "Đã hủy", value: numberValue(summary.canceled), color: "#FF3B30" },
  ]);
  const topVehicleRows = topVehicles.map((vehicle) => ({
    label: stringValue(vehicle.vehicle_name, stringValue(vehicle.vehicle_license_plate, "Xe")),
    value: numberValue(vehicle.total_orders),
  }));
  const topStationRows = topStations.map((station) => ({
    label: stringValue(station.station_name, "Trạm"),
    value: numberValue(station.total_orders),
  }));

  const blocks = [
    fence({
      type: "kpi_grid",
      id: `kpi-san-luong-doi-xe-${stamp}`,
      title: `Tổng quan sản lượng và đội xe ${dateLabel}`,
      columns: 4,
      source: ["production_query"],
      items: [
        { label: "Tổng đơn", value: numberValue(summary.total_orders), unit: "đơn", tone: "blue" },
        { label: "Hoàn thành", value: numberValue(summary.completed), unit: "đơn", tone: "good" },
        {
          label: "Đang vận hành",
          value:
            numberValue(summary.running) +
            numberValue(summary.collecting) +
            numberValue(summary.transporting) +
            numberValue(summary.pending),
          unit: "đơn",
          tone: "amber",
        },
        { label: "Quãng đường", value: numberValue(summary.total_distance_km), unit: "km", tone: "purple" },
      ],
    }),
  ];

  if (statusRows.length > 0) {
    blocks.push(
      fence({
        type: "donut_chart",
        id: `donut-trang-thai-don-hang-${stamp}`,
        title: `Trạng thái đơn hàng ${dateLabel}`,
        centerLabel: `${numberValue(summary.total_orders)} đơn`,
        showLegend: true,
        source: ["production_query"],
        data: statusRows,
      }),
    );
  }

  if (topVehicleRows.length > 0) {
    blocks.push(
      fence({
        type: "bar_chart",
        id: `bar-top-xe-hoat-dong-${stamp}`,
        title: "Top xe theo số đơn",
        unit: "đơn",
        source: ["vehicle_search"],
        data: topVehicleRows,
      }),
      fence({
        type: "table",
        id: `table-top-xe-hoat-dong-${stamp}`,
        title: "Chi tiết top xe hoạt động",
        source: ["vehicle_search"],
        columns: [
          { key: "vehicle", header: "Xe" },
          { key: "license_plate", header: "Biển số" },
          { key: "orders", header: "Số đơn", align: "right", format: "number" },
          { key: "distance", header: "Km", align: "right", format: "number" },
        ],
        rows: topVehicles.map((vehicle) => ({
          vehicle: stringValue(vehicle.vehicle_name),
          license_plate: stringValue(vehicle.vehicle_license_plate),
          orders: numberValue(vehicle.total_orders),
          distance: numberValue(vehicle.total_distance_km),
        })),
      }),
    );
  }

  if (topStationRows.length > 0) {
    blocks.push(
      fence({
        type: "bar_chart",
        id: `bar-phan-bo-theo-tram-${stamp}`,
        title: "Phân bổ đơn hàng theo trạm",
        unit: "đơn",
        source: ["site_lookup"],
        data: topStationRows,
      }),
    );
  }

  if (topDrivers.length > 0) {
    blocks.push(
      fence({
        type: "table",
        id: `table-top-tai-xe-${stamp}`,
        title: "Top tài xế theo số đơn",
        source: ["driver_schedule"],
        columns: [
          { key: "driver", header: "Tài xế" },
          { key: "orders", header: "Số đơn", align: "right", format: "number" },
        ],
        rows: topDrivers.map((driver) => ({
          driver: stringValue(driver.user_name),
          orders: numberValue(driver.total_orders),
        })),
      }),
    );
  }

  blocks.push(
    fence({
      type: "source_chips",
      id: `sources-production-${stamp}`,
      items: [{ id: 1, tool: "getProductionReport", label: "Báo cáo sản lượng", count: numberValue(summary.total_orders) }],
    }),
    fence({
      type: "followups",
      id: `followups-production-${stamp}`,
      items: ["Xem chi tiết đơn đang chạy", "Lọc top xe theo quãng đường", "Phân tích sản lượng theo trạm"],
    }),
  );

  return blocks.join("\n\n");
}

function plannedTodayOrdersBlocks(data: Record<string, unknown>) {
  const stamp = hhmm();
  const summary = isRecord(data.summary) ? data.summary : {};
  const byStatus = isRecord(summary.byStatus) ? summary.byStatus : {};
  const statusRows = positiveRows(
    Object.entries(byStatus).map(([label, value]) => ({
      label,
      value: numberValue(value),
    })),
  );
  const orders = asRecordArray(data.orders).slice(0, 10);
  const availability = isRecord(data.afternoon_availability) ? data.afternoon_availability : {};
  const candidates = asRecordArray(availability.candidates).slice(0, 10);

  const blocks = [
    fence({
      type: "kpi_grid",
      id: `kpi-orders-${stamp}`,
      title: `Đơn hàng ngày ${stringValue(data.date, "hôm nay")}`,
      columns: 4,
      source: ["production_query"],
      items: [
        { label: "Tổng đơn", value: numberValue(summary.total), unit: "đơn", tone: "blue" },
        { label: "Xe liên quan", value: numberValue(summary.vehicles), unit: "xe", tone: "green" },
        { label: "Trạm", value: numberValue(summary.stations), unit: "trạm", tone: "purple" },
        { label: "Xe ứng viên ca chiều", value: numberValue(availability.candidate_count), unit: "xe", tone: "good" },
      ],
    }),
  ];

  if (statusRows.length > 0) {
    blocks.push(
      fence({
        type: "donut_chart",
        id: `donut-orders-status-${stamp}`,
        title: "Trạng thái đơn hàng",
        centerLabel: `${numberValue(summary.total)} đơn`,
        showLegend: true,
        source: ["production_query"],
        data: statusRows,
      }),
    );
  }

  if (candidates.length > 0) {
    blocks.push(
      fence({
        type: "table",
        id: `table-xe-san-sang-ca-chieu-${stamp}`,
        title: "Xe ứng viên sẵn sàng ca chiều",
        source: ["driver_schedule"],
        columns: [
          { key: "license_plate", header: "Biển số" },
          { key: "vehicle", header: "Xe" },
          { key: "driver", header: "Tài xế" },
          { key: "note", header: "Ghi chú" },
        ],
        rows: candidates.map((vehicle) => ({
          license_plate: stringValue(vehicle.license_plate),
          vehicle: stringValue(vehicle.name),
          driver: stringValue(vehicle.driver),
          note: "Không có order active ca chiều trong orders hôm nay",
        })),
      }),
    );
  } else if (orders.length > 0) {
    blocks.push(
      fence({
        type: "table",
        id: `table-orders-${stamp}`,
        title: "Danh sách đơn hàng gần nhất",
        source: ["production_query"],
        columns: [
          { key: "order", header: "Đơn" },
          { key: "status", header: "Trạng thái", format: "badge" },
          { key: "vehicle", header: "Xe" },
          { key: "driver", header: "Tài xế" },
          { key: "station", header: "Trạm" },
        ],
        rows: orders.map((order) => ({
          order: String(order.order_number ?? order.order_id ?? ""),
          status: stringValue(order.status),
          vehicle: stringValue(order.vehicle),
          driver: stringValue(order.driver),
          station: stringValue(order.station),
        })),
      }),
    );
  }

  blocks.push(
    fence({
      type: "source_chips",
      id: `sources-orders-${stamp}`,
      items: [{ id: 1, tool: "getTodayOrders", label: "Orders hôm nay", count: numberValue(summary.total) }],
    }),
    fence({
      type: "followups",
      id: `followups-orders-${stamp}`,
      items: ["Lọc xe sẵn sàng ca chiều", "Xem đơn đang chạy", "Đề xuất điều xe cho trạm thiếu xe"],
    }),
  );

  return blocks.join("\n\n");
}

export function buildPlannedRenderStream(result: ToolResult): string {
  if (result.status !== "ok" || !isRecord(result.data)) return "";
  if (result.tool === "getProductionReport") return plannedProductionBlocks(result.data);
  if (result.tool === "getTodayOrders") return plannedTodayOrdersBlocks(result.data);
  return "";
}
