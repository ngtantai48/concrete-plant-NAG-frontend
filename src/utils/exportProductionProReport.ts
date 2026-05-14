import { saveAs } from "file-saver";

export interface ProReportSeriesPoint {
  label: string;
  completed: number;
  processing: number;
  km: number;
}

export interface ProReportSummaryCard {
  label: string;
  value: string;
  hint?: string;
}

export interface ProReportVehicleRow {
  vehicleName: string;
  licensePlate: string;
  totalOrders: number;
  totalKm: number;
  performancePercent: number;
}

export interface ProReportStationRow {
  stationName: string;
  totalOrders: number;
  sharePercent: number;
}

export interface ProReportStatusPoint {
  label: string;
  value: number;
  color: string;
}

export interface ProReportInsightItem {
  label: string;
  value: string;
}

export interface ProReportTripRow {
  dateLabel: string;
  vehicleName: string;
  licensePlate: string;
  stationName: string;
  orderCode: string;
  distanceKmText: string;
  tripVolumeText: string;
  stopText: string;
  movementTimeText: string;
  startText: string;
  endText: string;
  statusLabel: string;
  statusTone: "ok" | "warn" | "bad" | "info";
}

export interface ProProductionSection {
  title: string;
  subtitle: string;
  summaryCards: ProReportSummaryCard[];
  series: ProReportSeriesPoint[];
  statusBreakdown: ProReportStatusPoint[];
  topVehicles: ProReportVehicleRow[];
  topStations: ProReportStationRow[];
  insights?: ProReportInsightItem[];
  trips: ProReportTripRow[];
}

export interface ProProductionReportDocument {
  title: string;
  scopeLabel: string;
  periodLabel: string;
  generatedAtLabel: string;
  summaryCards: ProReportSummaryCard[];
  sections: ProProductionSection[];
}

type ChartSectionPayload = {
  barId: string;
  donutId: string;
  labels: string[];
  completed: number[];
  processing: number[];
  statusLabels: string[];
  statusValues: number[];
  statusColors: string[];
};

const formatNumber = (value: number) => value.toLocaleString("vi-VN");

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderSummaryStrip = (cards: ProReportSummaryCard[]) =>
  cards
    .map(
      (card) => `
        <div class="summary-item">
          <div class="label">${escapeHtml(card.label)}</div>
          <div class="value">${escapeHtml(card.value)}</div>
          ${card.hint ? `<div class="delta">${escapeHtml(card.hint)}</div>` : ""}
        </div>
      `
    )
    .join("");

const renderVehicleRows = (vehicles: ProReportVehicleRow[]) =>
  vehicles
    .map(
      (vehicle, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>
            <div class="vehicle">${escapeHtml(vehicle.vehicleName)}</div>
            <span class="plate">${escapeHtml(vehicle.licensePlate)}</span>
          </td>
          <td>${formatNumber(vehicle.totalOrders)}</td>
          <td><b>${formatNumber(Math.round(vehicle.totalKm))} km</b></td>
          <td>
            <span class="progress"><span class="bar" style="width:${vehicle.performancePercent}%"></span></span>
            ${vehicle.performancePercent}%
          </td>
        </tr>
      `
    )
    .join("");

const renderStationRows = (stations: ProReportStationRow[]) =>
  stations
    .map(
      (station, index) => `
        <tr>
          <td>${index + 1}</td>
          <td><div class="vehicle">${escapeHtml(station.stationName)}</div></td>
          <td>${formatNumber(station.totalOrders)}</td>
          <td>
            <span class="progress"><span class="bar" style="width:${station.sharePercent}%"></span></span>
            ${station.sharePercent}%
          </td>
        </tr>
      `
    )
    .join("");

const renderStatusClass = (tone: ProReportTripRow["statusTone"]) => {
  if (tone === "ok") return "ok";
  if (tone === "warn") return "warn";
  if (tone === "bad") return "bad";
  return "info";
};

const renderTripRows = (trips: ProReportTripRow[]) =>
  trips
    .map(
      (trip) => `
        <tr>
          <td>${escapeHtml(trip.dateLabel)}</td>
          <td><div class="vehicle">${escapeHtml(trip.vehicleName)}</div><span class="plate">${escapeHtml(trip.licensePlate)}</span></td>
          <td>${escapeHtml(trip.stationName)}</td>
          <td>${escapeHtml(trip.orderCode)}</td>
          <td>${escapeHtml(trip.distanceKmText)}</td>
          <td>${escapeHtml(trip.tripVolumeText)}</td>
          <td>${escapeHtml(trip.stopText)}</td>
          <td>${escapeHtml(trip.movementTimeText)}</td>
          <td>${escapeHtml(trip.startText)}</td>
          <td>${escapeHtml(trip.endText)}</td>
          <td><span class="status ${renderStatusClass(trip.statusTone)}">${escapeHtml(trip.statusLabel)}</span></td>
        </tr>
      `
    )
    .join("");

const renderInsightItems = (items: ProReportInsightItem[]) =>
  items
    .map(
      (item) => `
        <div class="pill-line">
          <span>${escapeHtml(item.label)}</span>
          <b>${escapeHtml(item.value)}</b>
        </div>
      `
    )
    .join("");

const createChartPayload = (section: ProProductionSection, index: number): ChartSectionPayload => ({
  barId: `barChart-${index}`,
  donutId: `donutChart-${index}`,
  labels: section.series.map((item) => item.label),
  completed: section.series.map((item) => item.completed),
  processing: section.series.map((item) => item.processing),
  statusLabels: section.statusBreakdown.map((item) => item.label),
  statusValues: section.statusBreakdown.map((item) => item.value),
  statusColors: section.statusBreakdown.map((item) => item.color),
});

const renderSection = (section: ProProductionSection, index: number) => {
  const chartPayload = createChartPayload(section, index);
  const tripsContent = section.trips.length
    ? renderTripRows(section.trips)
    : `<tr><td colspan="11" class="empty-cell">Không có dữ liệu chuyến trong kỳ.</td></tr>`;

  return {
    chartPayload,
    html: `
      <section class="section">
        <div class="section-title">
          <h2>${escapeHtml(section.title)}</h2>
          <div class="note">${escapeHtml(section.subtitle)}</div>
        </div>

        <div class="summary-grid">
          ${section.summaryCards
        .map(
          (card) => `
                <div class="summary-card">
                  <div class="summary-label">${escapeHtml(card.label)}</div>
                  <div class="summary-value">${escapeHtml(card.value)}</div>
                  ${card.hint ? `<div class="summary-hint">${escapeHtml(card.hint)}</div>` : ""}
                </div>
              `
        )
        .join("")}
        </div>

        <div class="insight-box">
          <div>
            <div class="insight-title">Nhận định nhanh</div>
            <div class="insight-main">
              ${escapeHtml(section.title)}: ${escapeHtml(section.subtitle)}
            </div>
          </div>
          <div class="insight-list">
            ${renderInsightItems(
          section.insights?.length
            ? section.insights
            : [
              { label: "Tổng chuyến", value: section.summaryCards[0]?.value || "0" },
              { label: "Hoàn thành", value: section.summaryCards[1]?.value || "0" },
              { label: "Tổng KM", value: section.summaryCards[3]?.value || "0" },
            ]
        )}
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="section-title">
              <h2>Sản lượng theo kỳ</h2>
              <div class="note">Hoàn thành / Đang xử lý</div>
            </div>
            <div class="chart-box"><canvas id="${chartPayload.barId}"></canvas></div>
          </div>
          <div class="card">
            <div class="section-title">
              <h2>Phân bổ trạng thái</h2>
              <div class="note">${section.statusBreakdown.length} loại</div>
            </div>
            <div class="chart-box"><canvas id="${chartPayload.donutId}"></canvas></div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="section-title">
              <h2>Xếp hạng xe</h2>
              <div class="note">Mã xe + biển số</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Xe</th>
                  <th>Chuyến</th>
                  <th>KM</th>
                  <th>Hiệu suất</th>
                </tr>
              </thead>
              <tbody>
                ${section.topVehicles.length ? renderVehicleRows(section.topVehicles) : `<tr><td colspan="5" class="empty-cell">Không có dữ liệu xe.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="card">
            <div class="section-title">
              <h2>Hiệu suất trạm</h2>
              <div class="note">Theo số chuyến</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Trạm</th>
                  <th>Chuyến</th>
                  <th>Tỷ lệ</th>
                </tr>
              </thead>
              <tbody>
                ${section.topStations.length ? renderStationRows(section.topStations) : `<tr><td colspan="4" class="empty-cell">Không có dữ liệu trạm.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card section-card">
          <div class="section-title">
            <h2>Bảng chi tiết chuyến</h2>
            <div class="note">${section.trips.length.toLocaleString("vi-VN")} chuyến</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Xe</th>
                <th>Trạm</th>
                <th>Mã lệnh</th>
                <th>KM</th>
                <th>Sản lượng</th>
                <th>Dừng/đỗ</th>
                <th>TG di chuyển</th>
                <th>Bắt đầu</th>
                <th>Kết thúc</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              ${tripsContent}
            </tbody>
          </table>
        </div>
      </section>
    `,
  };
};

export const exportProductionProReport = (documentData: ProProductionReportDocument, fileName: string) => {
  const renderedSections = documentData.sections.map((section, index) => renderSection(section, index));
  const sectionsHtml = renderedSections.map((item) => item.html).join("");
  const chartPayload = renderedSections.map((item) => item.chartPayload);
  const chartPayloadScript = JSON.stringify(chartPayload).replace(/</g, "\\u003c");
  const pdfFileNameScript = JSON.stringify(`${fileName}.pdf`);

  const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(documentData.title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <style>
    :root {
      --bg: #f4f7fb;
      --paper: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --line: #e2e8f0;
      --blue: #2563eb;
      --green: #059669;
      --red: #dc2626;
      --amber: #d97706;
      --soft-blue: #eff6ff;
      --soft-green: #ecfdf5;
      --soft-red: #fef2f2;
      --soft-amber: #fffbeb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .pdf-capture-root {
      transform: scale(0.7);
      transform-origin: top left;
      width: 142.857%;
      padding: 0;
      margin: 0;
    }
    .report {
      max-width: 1180px;
      margin: 0 auto 40px;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
    }
    .cover {
      padding: 36px 40px 30px;
      border-bottom: 1px solid var(--line);
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 24px;
      align-items: start;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 28px;
      font-weight: 800;
      color: var(--blue);
    }
    .logo {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--soft-blue);
      display: grid;
      place-items: center;
      font-size: 20px;
    }
    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.15;
      letter-spacing: -0.04em;
    }
    .subtitle {
      margin-top: 10px;
      color: var(--muted);
      font-size: 15px;
    }
    .period-card {
      min-width: 260px;
      background: #f8fafc;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 18px;
    }
    .period-card .label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .period-card .value {
      margin-top: 8px;
      font-size: 20px;
      font-weight: 900;
    }
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      border-top: 1px solid var(--line);
      background: #fbfdff;
    }
    .summary-item {
      padding: 22px 26px;
      border-right: 1px solid var(--line);
    }
    .summary-item:last-child { border-right: 0; }
    .summary-item .label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .summary-item .value {
      margin-top: 8px;
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.03em;
    }
    .summary-item .delta {
      margin-top: 6px;
      font-size: 12px;
      color: var(--green);
      font-weight: 700;
    }
    .content {
      padding: 28px 40px 36px;
    }
    .section {
      margin-bottom: 34px;
    }
    .section:last-child {
      margin-bottom: 0;
    }
    .section-title {
      display: flex;
      justify-content: space-between;
      align-items: end;
      margin-bottom: 14px;
    }
    h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: -0.02em;
    }
    .note {
      color: var(--muted);
      font-size: 13px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .summary-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    }
    .summary-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .summary-value {
      margin-top: 6px;
      font-size: 22px;
      font-weight: 900;
    }
    .summary-hint {
      margin-top: 5px;
      font-size: 12px;
      color: var(--muted);
      font-weight: 700;
    }
    .insight-box {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 20px;
      background: linear-gradient(180deg, #ffffff, #f8fbff);
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 24px;
      margin-bottom: 16px;
    }
    .insight-title {
      font-size: 14px;
      color: var(--muted);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 10px;
    }
    .insight-main {
      font-size: 22px;
      font-weight: 900;
      line-height: 1.35;
      letter-spacing: -0.03em;
    }
    .insight-list {
      display: grid;
      gap: 10px;
    }
    .pill-line {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      background: white;
      border: 1px solid var(--line);
      font-size: 13px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 20px;
      margin-bottom: 16px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 20px;
      background: white;
    }
    .section-card {
      margin-top: 4px;
    }
    .chart-box {
      height: 280px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      text-align: left;
      padding: 12px 10px;
      border-bottom: 1px solid var(--line);
      white-space: nowrap;
    }
    td {
      padding: 14px 10px;
      border-bottom: 1px solid var(--line);
      vertical-align: middle;
    }
    .vehicle {
      font-weight: 900;
      font-size: 14px;
    }
    .plate {
      display: inline-block;
      margin-top: 4px;
      border: 1px solid var(--line);
      background: #f8fafc;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      color: #334155;
      font-weight: 800;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
    }
    .ok { background: var(--soft-green); color: var(--green); }
    .warn { background: var(--soft-amber); color: var(--amber); }
    .bad { background: var(--soft-red); color: var(--red); }
    .info { background: var(--soft-blue); color: var(--blue); }
    .progress {
      height: 8px;
      width: 110px;
      background: #e5e7eb;
      border-radius: 999px;
      overflow: hidden;
      display: inline-block;
      margin-right: 10px;
      vertical-align: middle;
    }
    .bar {
      display: block;
      height: 100%;
      background: var(--blue);
      border-radius: 999px;
    }
    .empty-cell {
      text-align: center;
      color: var(--muted);
      font-style: italic;
      font-weight: 700;
    }
    .footer {
      padding: 20px 40px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
      display: flex;
      justify-content: space-between;
    }
    @media (max-width: 960px) {
      .cover, .insight-box, .grid-2 { grid-template-columns: 1fr; }
      .summary-strip { grid-template-columns: repeat(2, 1fr); }
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .summary-item { border-bottom: 1px solid var(--line); }
      .content { padding: 18px; }
    }
  </style>
</head>
<body>
  <div id="pdf-capture-root" class="pdf-capture-root">
    <main class="report">
      <section class="cover">
        <div>
          <div class="brand">
            <div class="logo">▣</div>
            QUẢN LÝ ĐIỀU PHỐI XE
          </div>
          <h1>${escapeHtml(documentData.title)}</h1>
          <div class="subtitle">Báo cáo dữ liệu vận hành nâng cao: thống kê, biểu đồ và chi tiết chuyến đầy đủ theo phạm vi xuất.</div>
        </div>

        <div class="period-card">
          <div class="label">Kỳ báo cáo</div>
          <div class="value">${escapeHtml(documentData.periodLabel)}</div>
          <div class="subtitle">Phạm vi: ${escapeHtml(documentData.scopeLabel)} · Phát hành: ${escapeHtml(documentData.generatedAtLabel)}</div>
        </div>
      </section>

      <section class="summary-strip">
        ${renderSummaryStrip(documentData.summaryCards)}
      </section>

      <div class="content">
        ${sectionsHtml}
      </div>

      <footer class="footer">
        <span>Generated by Fleet Management System</span>
        <span>Trang 1 / 1</span>
      </footer>
    </main>
  </div>

  <script>
    const chartSections = ${chartPayloadScript};
    const pdfFileName = ${pdfFileNameScript};
    const font = { family: "Segoe UI, Arial, sans-serif", size: 12, weight: "600" };
    const expectedChartCount = chartSections.length * 2;
    let renderedChartCount = 0;
    let exportTriggered = false;
    const tryAutoExportPdf = () => {
      if (exportTriggered) return;
      if (renderedChartCount >= expectedChartCount) {
        exportTriggered = true;
        const captureRoot = document.getElementById("pdf-capture-root");
        if (!captureRoot || typeof html2pdf === "undefined") return;
        const options = {
          margin: [6, 6, 6, 6],
          filename: pdfFileName,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] }
        };
        setTimeout(() => {
          html2pdf()
            .set(options)
            .from(captureRoot)
            .save()
            .then(() => {
              setTimeout(() => {
                if (window.opener) window.close();
              }, 350);
            });
        }, 600);
      }
    };
    if (typeof Chart !== "undefined") {
      chartSections.forEach((section) => {
        const barEl = document.getElementById(section.barId);
        if (barEl) {
          new Chart(barEl, {
            type: "bar",
            data: {
              labels: section.labels,
              datasets: [
                {
                  label: "Hoàn thành",
                  data: section.completed,
                  backgroundColor: "#10b981",
                  borderRadius: 8,
                  maxBarThickness: 42
                },
                {
                  label: "Đang xử lý",
                  data: section.processing,
                  backgroundColor: "#f59e0b",
                  borderRadius: 8,
                  maxBarThickness: 42
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              plugins: { legend: { position: "top", labels: { font } } },
              scales: {
                x: { grid: { display: false }, ticks: { font } },
                y: { grid: { color: "#e2e8f0" }, ticks: { font } }
              }
            }
          });
          renderedChartCount += 1;
        } else {
          renderedChartCount += 1;
        }

        const donutEl = document.getElementById(section.donutId);
        if (donutEl) {
          new Chart(donutEl, {
            type: "doughnut",
            data: {
              labels: section.statusLabels,
              datasets: [{
                data: section.statusValues,
                backgroundColor: section.statusColors,
                borderWidth: 0
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              cutout: "68%",
              plugins: {
                legend: {
                  position: "right",
                  labels: { font, boxWidth: 10, boxHeight: 10 }
                }
              }
            }
          });
          renderedChartCount += 1;
        } else {
          renderedChartCount += 1;
        }
        tryAutoExportPdf();
      });
      if (!chartSections.length) tryAutoExportPdf();
    } else {
      renderedChartCount = expectedChartCount;
      tryAutoExportPdf();
    }
  </script>
</body>
</html>
`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const printWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!printWindow) {
    saveAs(blob, `${fileName}.html`);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 20000);
};
