import type { CreateAiReportPayload } from "@/types/report";

const contextLabels: Record<CreateAiReportPayload["activeContext"], string> = {
  fleet: "Đội xe",
  maintenance: "Bảo trì",
  production: "Sản lượng",
};

type ChartRow = {
  label: string;
  value: number;
  color?: string;
};

type KpiItem = {
  label: string;
  value: string | number;
  unit?: string;
  tone?: string;
};

type TableColumn = {
  key: string;
  header: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function safeReportFilename(value: string) {
  return normalizeText(value)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .toLowerCase() || "bao-cao-ai";
}

export function stripReportRenderSyntax(text: string) {
  return text
    .replace(/:::render\s*[\s\S]*?:::/g, "")
    .replace(/\{\{\s*(?:chart|bar|bar_chart|donut|donut_chart|pie|pie_chart|doughnut|line|line_chart|area|area_chart|table)\b[\s\S]*?\}\}/gi, "")
    .replace(/(?:<|&lt;)chart\b[\s\S]*?(?:\/>|\/&gt;)/gi, "")
    .replace(/(?:<|&lt;)chart\b[\s\S]*?(?:>|&gt;)[\s\S]*?(?:<|&lt;)\/chart(?:>|&gt;)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatReportDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

function truncate(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function isMarkdownTableDivider(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isMarkdownTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.includes("|") && !isMarkdownTableDivider(trimmed);
}

function splitMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownBlockStart(line: string, nextLine?: string) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^[-*+]\s+/.test(trimmed)) return true;
  if (/^\d+[.)]\s+/.test(trimmed)) return true;
  if (/^>\s?/.test(trimmed)) return true;
  if (/^```/.test(trimmed)) return true;
  return isMarkdownTableRow(trimmed) && Boolean(nextLine && isMarkdownTableDivider(nextLine));
}

function renderInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s([{])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s([{])_([^_\n]+)_/g, "$1<em>$2</em>");
}

function renderMarkdownHtml(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(
        `<pre class="markdown-code"${language ? ` data-language="${escapeHtml(language)}"` : ""}><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (isMarkdownTableRow(line) && index + 1 < lines.length && isMarkdownTableDivider(lines[index + 1] ?? "")) {
      const headers = splitMarkdownTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isMarkdownTableRow(lines[index] ?? "")) {
        rows.push(splitMarkdownTableRow(lines[index] ?? ""));
        index += 1;
      }
      html.push(`
        <div class="markdown-table-wrap">
          <table class="markdown-table">
            <thead><tr>${headers.map((header) => `<th>${renderInlineMarkdown(header)}</th>`).join("")}</tr></thead>
            <tbody>
              ${rows
                .map(
                  (row) =>
                    `<tr>${headers
                      .map((_, cellIndex) => `<td>${renderInlineMarkdown(row[cellIndex] ?? "")}</td>`)
                      .join("")}</tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `);
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^[-*+]\s+(.+)$/.exec((lines[index] ?? "").trim());
        if (!item) break;
        items.push(`<li>${renderInlineMarkdown(item[1])}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^\d+[.)]\s+(.+)$/.exec((lines[index] ?? "").trim());
        if (!item) break;
        items.push(`<li>${renderInlineMarkdown(item[1])}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quote = /^>\s?(.*)$/.exec((lines[index] ?? "").trim());
        if (!quote) break;
        quoteLines.push(quote[1]);
        index += 1;
      }
      html.push(`<blockquote>${renderInlineMarkdown(quoteLines.join(" "))}</blockquote>`);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && !isMarkdownBlockStart(lines[index] ?? "", lines[index + 1])) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return html.join("");
}

function blockTitle(block: CreateAiReportPayload["blocks"][number]) {
  return block.title?.trim() || block.type;
}

function blockRecord(block: CreateAiReportPayload["blocks"][number]) {
  return isRecord(block.data) ? block.data : {};
}

function chartRows(value: unknown): ChartRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ChartRow | null => {
      if (!isRecord(item)) return null;
      const value = typeof item.value === "number" ? item.value : Number(item.value);
      if (!Number.isFinite(value)) return null;
      return {
        label: String(item.label ?? item.x ?? ""),
        value,
        color: typeof item.color === "string" ? item.color : undefined,
      };
    })
    .filter((item): item is ChartRow => item !== null && item.label.trim().length > 0);
}

function kpiItems(value: unknown): KpiItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): KpiItem | null => {
      if (!isRecord(item)) return null;
      if (typeof item.label !== "string") return null;
      const rawValue = item.value;
      if (typeof rawValue !== "string" && typeof rawValue !== "number") return null;
      return {
        label: item.label,
        value: rawValue,
        unit: typeof item.unit === "string" ? item.unit : undefined,
        tone: typeof item.tone === "string" ? item.tone : undefined,
      };
    })
    .filter((item): item is KpiItem => item !== null);
}

function tableColumns(value: unknown): TableColumn[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): TableColumn | null => {
      if (!isRecord(item) || typeof item.key !== "string") return null;
      return {
        key: item.key,
        header: typeof item.header === "string" ? item.header : item.key,
      };
    })
    .filter((item): item is TableColumn => item !== null);
}

function tableRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function renderKpiBlock(block: CreateAiReportPayload["blocks"][number]) {
  const data = blockRecord(block);
  const items = kpiItems(data.items);
  if (items.length === 0) return "";
  return `
    <section class="block-card">
      <h2>${escapeHtml(blockTitle(block))}</h2>
      <div class="kpi-grid">
        ${items
          .map(
            (item) => `
              <article class="kpi ${escapeHtml(item.tone ?? "info")}">
                <div class="kpi-label">${escapeHtml(item.label)}</div>
                <div><span class="kpi-value">${escapeHtml(item.value)}</span>${item.unit ? `<span class="kpi-unit">${escapeHtml(item.unit)}</span>` : ""}</div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderBarBlock(block: CreateAiReportPayload["blocks"][number]) {
  const data = blockRecord(block);
  const rows = chartRows(data.data);
  if (rows.length === 0) return "";
  const max = Math.max(...rows.map((row) => row.value), 1);
  return `
    <section class="block-card">
      <h2>${escapeHtml(blockTitle(block))}</h2>
      <div class="bars">
        ${rows
          .map((row) => {
            const width = Math.max(3, Math.round((row.value / max) * 100));
            return `
              <div class="bar-row">
                <div class="bar-label">${escapeHtml(row.label)}</div>
                <div class="bar-track"><span style="width:${width}%;background:${escapeHtml(row.color ?? "#007AFF")}"></span></div>
                <div class="bar-value">${escapeHtml(row.value)}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderDonutBlock(block: CreateAiReportPayload["blocks"][number]) {
  const data = blockRecord(block);
  const rows = chartRows(data.data);
  if (rows.length === 0) return "";
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  let offset = 25;
  const circles = rows
    .map((row, index) => {
      const value = total > 0 ? (row.value / total) * 75 : 0;
      const dash = `${value} ${100 - value}`;
      const circle = `<circle cx="21" cy="21" r="15.915" fill="transparent" stroke="${escapeHtml(row.color ?? ["#007AFF", "#34C759", "#FF9F0A", "#AF52DE"][index % 4])}" stroke-width="7" stroke-dasharray="${dash}" stroke-dashoffset="${offset}" />`;
      offset -= value;
      return circle;
    })
    .join("");
  return `
    <section class="block-card">
      <h2>${escapeHtml(blockTitle(block))}</h2>
      <div class="donut-layout">
        <svg class="donut" viewBox="0 0 42 42">${circles}<text x="21" y="20" text-anchor="middle" class="donut-total">${escapeHtml(total)}</text><text x="21" y="25" text-anchor="middle" class="donut-caption">tổng</text></svg>
        <div class="legend">
          ${rows
            .map(
              (row, index) => `
                <div class="legend-row">
                  <span class="dot" style="background:${escapeHtml(row.color ?? ["#007AFF", "#34C759", "#FF9F0A", "#AF52DE"][index % 4])}"></span>
                  <span>${escapeHtml(row.label)}</span>
                  <strong>${escapeHtml(row.value)}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderTableBlock(block: CreateAiReportPayload["blocks"][number]) {
  const data = blockRecord(block);
  const columns = tableColumns(data.columns);
  const rows = tableRows(data.rows).slice(0, 30);
  if (columns.length === 0 || rows.length === 0) return "";
  return `
    <section class="block-card table-card">
      <h2>${escapeHtml(blockTitle(block))}</h2>
      <table>
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows
            .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}</tr>`)
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderGenericBlock(block: CreateAiReportPayload["blocks"][number]) {
  return `
    <section class="block-card generic">
      <h2>${escapeHtml(blockTitle(block))}</h2>
      <div class="generic-type">${escapeHtml(block.type)}</div>
    </section>
  `;
}

function renderBlock(block: CreateAiReportPayload["blocks"][number]) {
  if (block.type === "kpi_grid") return renderKpiBlock(block);
  if (block.type === "bar_chart") return renderBarBlock(block);
  if (block.type === "donut_chart") return renderDonutBlock(block);
  if (block.type === "table") return renderTableBlock(block);
  return renderGenericBlock(block);
}

export function buildReportMarkdown(payload: CreateAiReportPayload, reportId: string) {
  const completedTurns = payload.turns.filter((turn) => turn.text.trim());
  const latestAssistant = [...completedTurns]
    .reverse()
    .find((turn) => turn.role === "assistant" && stripReportRenderSyntax(turn.text));
  const summary = latestAssistant ? stripReportRenderSyntax(latestAssistant.text) : "";

  const lines: string[] = [
    `# ${payload.title}`,
    "",
    `- Mã báo cáo: \`${reportId}\``,
    `- Ngữ cảnh: ${contextLabels[payload.activeContext]}`,
    `- Cuộc trò chuyện: \`${payload.conversationId}\``,
    `- Tạo lúc: ${formatReportDate(new Date().toISOString())}`,
    `- Cập nhật cuộc trò chuyện: ${formatReportDate(payload.lastMessageAt)}`,
    `- Số lượt: ${completedTurns.length}`,
    `- Số khối trực quan: ${payload.blocks.length}`,
  ];

  if (payload.shareUrl) lines.push(`- Link chỉ xem: ${payload.shareUrl}`);
  if (summary) lines.push("", "## Tóm tắt", "", truncate(summary, 2000));
  if (payload.blocks.length > 0) {
    lines.push("", "## Khối trực quan", "");
    payload.blocks.forEach((block, index) => {
      lines.push(`${index + 1}. **${blockTitle(block)}** - \`${block.type}\``);
    });
  }

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

export function renderAiReportHtml(payload: CreateAiReportPayload, reportId: string) {
  const completedTurns = payload.turns.filter((turn) => turn.text.trim());
  const latestAssistant = [...completedTurns]
    .reverse()
    .find((turn) => turn.role === "assistant" && stripReportRenderSyntax(turn.text));
  const summary = latestAssistant ? stripReportRenderSyntax(latestAssistant.text) : "";
  const createdAt = new Date().toISOString();
  const visualBlocks = payload.blocks.filter((block) => ["kpi_grid", "bar_chart", "donut_chart", "table"].includes(block.type));

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.title)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #18181b; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f6f8; }
    .page { min-height: 100vh; background: #fff; padding: 28px; }
    .hero { border: 1px solid #e4e7ec; border-radius: 18px; padding: 24px; background: linear-gradient(135deg, #f8fbff 0%, #ffffff 48%, #fff5f5 100%); }
    .brand { display: flex; align-items: center; gap: 10px; color: #e11d2e; font-weight: 900; letter-spacing: .02em; text-transform: uppercase; font-size: 12px; }
    .mark { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; background: #fff; border: 1px solid #ffd1d6; }
    .mark::before { content: ""; width: 16px; height: 10px; background: linear-gradient(135deg, #ef4444, #e11d48); clip-path: polygon(0 0, 70% 0, 100% 50%, 70% 100%, 0 100%, 24% 50%); }
    h1 { margin: 16px 0 10px; font-size: 30px; line-height: 1.12; letter-spacing: -0.02em; }
    .summary { max-width: 650px; color: #4b5563; font-size: 13px; line-height: 1.7; }
    .markdown p { margin: 0 0 10px; }
    .markdown p:last-child { margin-bottom: 0; }
    .markdown h2, .markdown h3, .markdown h4 { margin: 16px 0 8px; color: #111827; line-height: 1.25; letter-spacing: -0.01em; }
    .markdown h2 { font-size: 15px; }
    .markdown h3 { font-size: 14px; }
    .markdown h4 { font-size: 13px; }
    .markdown strong { color: #111827; font-weight: 900; }
    .markdown em { color: #4b5563; }
    .markdown code { border-radius: 5px; background: #eef4ff; color: #0a66e0; padding: 1px 4px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .92em; }
    .markdown ul, .markdown ol { margin: 8px 0 12px 20px; padding: 0; }
    .markdown li { margin: 4px 0; padding-left: 2px; }
    .markdown blockquote { margin: 10px 0; border-left: 3px solid #007aff; padding: 8px 10px; border-radius: 0 10px 10px 0; background: #f4f8ff; color: #4b5563; }
    .markdown-code { margin: 10px 0; overflow-wrap: anywhere; white-space: pre-wrap; border-radius: 10px; background: #101828; color: #f8fafc; padding: 10px; font-size: 10px; line-height: 1.55; }
    .markdown-table-wrap { margin: 10px 0 14px; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 12px; }
    .markdown-table { font-size: 11px; }
    .markdown-table th { background: #f8fafc; color: #4b5563; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
    .meta-card { border-radius: 12px; border: 1px solid #e5e7eb; background: rgba(255,255,255,.84); padding: 11px; }
    .meta-label { color: #8b93a1; font-size: 10px; text-transform: uppercase; font-weight: 800; }
    .meta-value { margin-top: 4px; font-weight: 900; font-size: 13px; }
    .section-title { margin: 24px 0 12px; display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 950; }
    .section-title::before { content: ""; width: 4px; height: 18px; border-radius: 99px; background: #007aff; }
    .block-card { break-inside: avoid; margin: 12px 0; border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; padding: 16px; box-shadow: 0 8px 22px rgba(15,23,42,.055); }
    .block-card h2 { margin: 0 0 12px; font-size: 15px; line-height: 1.25; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .kpi { border: 1px solid #e8edf3; border-radius: 13px; padding: 12px; background: #f8fafc; }
    .kpi-label { color: #7b8494; font-size: 10px; text-transform: uppercase; font-weight: 900; }
    .kpi-value { display: inline-block; margin-top: 8px; font-size: 24px; font-weight: 950; color: #007aff; }
    .kpi.good .kpi-value, .kpi.green .kpi-value { color: #1f8e47; }
    .kpi.amber .kpi-value, .kpi.warn .kpi-value { color: #b86e00; }
    .kpi-unit { margin-left: 5px; color: #6b7280; font-weight: 800; font-size: 11px; }
    .bars { display: grid; gap: 9px; }
    .bar-row { display: grid; grid-template-columns: 108px 1fr 52px; gap: 10px; align-items: center; font-size: 12px; }
    .bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; color: #4b5563; }
    .bar-track { height: 15px; border-radius: 999px; background: #edf1f6; overflow: hidden; }
    .bar-track span { display: block; height: 100%; border-radius: inherit; }
    .bar-value { text-align: right; font-weight: 900; }
    .donut-layout { display: grid; grid-template-columns: 170px 1fr; gap: 18px; align-items: center; }
    .donut { width: 160px; height: 160px; transform: rotate(-90deg); }
    .donut text { transform: rotate(90deg); transform-origin: 21px 21px; font-family: inherit; fill: #111827; }
    .donut-total { font-size: 7px; font-weight: 950; }
    .donut-caption { font-size: 3px; fill: #8b93a1; text-transform: uppercase; }
    .legend { display: grid; gap: 8px; }
    .legend-row { display: grid; grid-template-columns: 12px 1fr auto; gap: 8px; align-items: center; font-size: 12px; }
    .dot { width: 9px; height: 9px; border-radius: 50%; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; color: #6b7280; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
    th, td { border-bottom: 1px solid #edf0f3; padding: 8px 7px; vertical-align: top; }
    .conversation { display: grid; gap: 10px; }
    .turn { break-inside: avoid; border-radius: 13px; border: 1px solid #e5e7eb; padding: 12px; }
    .turn.user { background: #f0f7ff; }
    .turn.assistant { background: #fbfbfc; }
    .turn-head { color: #6b7280; font-size: 10px; font-weight: 900; text-transform: uppercase; }
    .turn-body { margin-top: 7px; line-height: 1.65; font-size: 12px; color: #374151; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #8b93a1; font-size: 10px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand"><span class="mark"></span>Nguyên Anh Group · AI Report</div>
      <h1>${escapeHtml(payload.title)}</h1>
      ${summary ? `<div class="summary markdown">${renderMarkdownHtml(truncate(summary, 1000))}</div>` : ""}
      <div class="meta">
        <div class="meta-card"><div class="meta-label">Ngữ cảnh</div><div class="meta-value">${escapeHtml(contextLabels[payload.activeContext])}</div></div>
        <div class="meta-card"><div class="meta-label">Tạo lúc</div><div class="meta-value">${escapeHtml(formatReportDate(createdAt))}</div></div>
        <div class="meta-card"><div class="meta-label">Số lượt</div><div class="meta-value">${escapeHtml(completedTurns.length)}</div></div>
        <div class="meta-card"><div class="meta-label">Khối render</div><div class="meta-value">${escapeHtml(payload.blocks.length)}</div></div>
      </div>
    </section>

    ${visualBlocks.length > 0 ? `<h2 class="section-title">Trực quan vận hành</h2>${visualBlocks.map(renderBlock).join("")}` : ""}

    <h2 class="section-title">Nội dung trao đổi</h2>
    <section class="conversation">
      ${completedTurns
        .map((turn) => {
          const body = stripReportRenderSyntax(turn.text);
          if (!body) return "";
          return `<article class="turn ${turn.role}"><div class="turn-head">${turn.role === "user" ? "Người dùng" : "Trợ lý AI"} · ${escapeHtml(formatReportDate(turn.createdAt))}</div><div class="turn-body markdown">${renderMarkdownHtml(body)}</div></article>`;
        })
        .join("")}
    </section>

    <div class="footer"><span>${escapeHtml(reportId)}</span><span>${escapeHtml(payload.conversationId)}</span></div>
  </main>
</body>
</html>`;
}
