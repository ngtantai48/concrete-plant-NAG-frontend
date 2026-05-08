import type { StreamChunk } from "./types";

const renderFencePattern = /:::render\s*([\s\S]*?):::/g;
const knownRenderTypes = new Set([
  "kpi_grid",
  "line_chart",
  "bar_chart",
  "donut_chart",
  "area_chart",
  "gantt",
  "timeline",
  "table",
  "map_view",
  "alert",
  "action_proposal",
  "markdown",
  "source_chips",
  "followups",
  "pie_chart",
]);

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "chart";
}

function currentHHmm() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter((item) => Number.isFinite(item));
}

function asLabelArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function chartJsTitle(chart: Record<string, unknown>, fallback: string): string {
  const options = isRecord(chart.options) ? chart.options : {};
  const plugins = isRecord(options.plugins) ? options.plugins : {};
  const title = isRecord(plugins.title) ? plugins.title : {};
  return typeof title.text === "string" && title.text.trim() ? title.text.trim() : fallback;
}

function chartColor(value: unknown, index: number): string | undefined {
  if (Array.isArray(value)) {
    const color = value[index];
    return typeof color === "string" ? color : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function tableKey(value: string, index: number) {
  return slugify(value) || `metric-${index + 1}`;
}

function renderFence(block: unknown) {
  return `:::render\n${JSON.stringify(block)}\n:::`;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseChartTagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  const normalizedTag = decodeHtmlEntities(tag);
  while ((match = attributePattern.exec(normalizedTag)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3];
    if (key && value !== undefined) attributes[key] = decodeHtmlEntities(value);
  }
  return attributes;
}

function parseLooseKeyValueData(value: string): Array<{ label: string; value: number }> {
  const items: Array<{ label: string; value: number }> = [];
  const pairPattern = /['"]([^'"]+)['"]\s*:\s*(-?\d+(?:[.,]\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pairPattern.exec(value)) !== null) {
    if (!match[1] || !match[2]) continue;
    const numericValue = Number(match[2].replace(",", "."));
    if (!Number.isFinite(numericValue)) continue;
    items.push({ label: match[1], value: numericValue });
  }
  return items;
}

function chartJsTypeFromXmlType(value: string): string | null {
  const type = value.toLowerCase();
  if (type === "bar_chart" || type === "bar") return "bar";
  if (type === "donut_chart" || type === "pie_chart" || type === "doughnut" || type === "donut" || type === "pie") {
    return "donut";
  }
  if (type === "line_chart" || type === "line") return "line";
  if (type === "area_chart" || type === "area") return "area";
  return null;
}

function chartJsTitleOptions(title: string) {
  return {
    plugins: {
      title: {
        text: title,
      },
    },
  };
}

function parseLooseChartObject(value: string): unknown | null {
  const trimmed = decodeHtmlEntities(value)
    .trim()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/;\s*$/, "");
  const candidates = [
    trimmed,
    trimmed.startsWith("{") ? trimmed : `{${trimmed}}`,
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try a conservative repair pass for common LLM JavaScript-object output.
    }

    const repaired = candidate
      .replace(/([{,]\s*)(labels|datasets|label|data|backgroundColor|borderColor|borderWidth|options|plugins|title|text|value)\s*:/g, "$1\"$2\":")
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner: string) => `"${inner.replace(/"/g, "\\\"")}"`)
      .replace(/,\s*([}\]])/g, "$1");

    try {
      return JSON.parse(repaired) as unknown;
    } catch {
      // Keep looking.
    }
  }

  return null;
}

function unquoteYamlValue(value: string): string {
  const trimmed = decodeHtmlEntities(value).trim().replace(/,$/, "").trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineArrayLiteral(value: string): unknown[] | null {
  const parsed = parseLooseChartObject(`value: ${value}`);
  return isRecord(parsed) && Array.isArray(parsed.value) ? parsed.value : null;
}

function parseYamlList(lines: string[], startIndex: number): { values: string[]; nextIndex: number } {
  const values: string[] = [];
  let index = startIndex;
  for (; index < lines.length; index += 1) {
    const match = /^\s*-\s*(.+?)\s*$/.exec(lines[index] ?? "");
    if (!match?.[1]) break;
    values.push(unquoteYamlValue(match[1]));
  }
  return { values, nextIndex: index };
}

function parseYamlArrayKey(lines: string[], key: string, startIndex = 0): { values: unknown[]; lineIndex: number } | null {
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, "i");
  for (let index = startIndex; index < lines.length; index += 1) {
    const match = pattern.exec(lines[index] ?? "");
    if (!match) continue;
    const rest = match[1]?.trim() ?? "";
    if (rest.startsWith("[")) {
      const parsed = parseInlineArrayLiteral(rest);
      return parsed ? { values: parsed, lineIndex: index } : null;
    }
    const list = parseYamlList(lines, index + 1);
    return list.values.length > 0 ? { values: list.values, lineIndex: list.nextIndex - 1 } : null;
  }
  return null;
}

function parseYamlDatasets(lines: string[]): Array<Record<string, unknown>> {
  const datasets: Array<Record<string, unknown>> = [];
  let current: Record<string, unknown> | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const labelMatch = /^\s*-\s*label\s*:\s*(.+)$/.exec(line);
    if (labelMatch?.[1]) {
      current = { label: unquoteYamlValue(labelMatch[1]) };
      datasets.push(current);
      continue;
    }

    if (!current) continue;

    const dataMatch = /^\s*data\s*:\s*(.+)$/.exec(line);
    if (dataMatch?.[1]) {
      const values = parseInlineArrayLiteral(dataMatch[1]);
      if (values) current.data = values;
      continue;
    }

    const backgroundMatch = /^\s*backgroundColor\s*:\s*(.*)$/.exec(line);
    if (backgroundMatch) {
      const rest = backgroundMatch[1]?.trim() ?? "";
      if (rest.startsWith("[")) {
        current.backgroundColor = parseInlineArrayLiteral(rest) ?? undefined;
      } else {
        const list = parseYamlList(lines, index + 1);
        if (list.values.length > 0) {
          current.backgroundColor = list.values;
          index = list.nextIndex - 1;
        }
      }
      continue;
    }

    const borderMatch = /^\s*borderColor\s*:\s*(.*)$/.exec(line);
    if (borderMatch) {
      const rest = borderMatch[1]?.trim() ?? "";
      current.borderColor = rest.startsWith("[") ? parseInlineArrayLiteral(rest) ?? undefined : unquoteYamlValue(rest);
    }
  }

  return datasets.filter((dataset) => Array.isArray(dataset.data));
}

function convertYamlChartBlock(body: string): string | null {
  const decoded = decodeHtmlEntities(body).trim();
  const typeMatch = /^type\s*:\s*["']?([a-z_ -]+)["']?\s*$/im.exec(decoded);
  const chartType = typeMatch?.[1] ? chartJsTypeFromXmlType(typeMatch[1].trim()) : null;
  if (!chartType) return null;

  const titleMatch = /^title\s*:\s*(.+)$/im.exec(decoded);
  const title = titleMatch?.[1] ? unquoteYamlValue(titleMatch[1]) : "Chart";
  const lines = decoded.split(/\r?\n/);
  const labels = parseYamlArrayKey(lines, "labels")?.values.map(String) ?? [];
  const datasets = parseYamlDatasets(lines);
  if (labels.length === 0 || datasets.length === 0) return null;

  return convertChartJsBlock({
    type: chartType,
    data: { labels, datasets },
    options: chartJsTitleOptions(title),
  });
}

function convertXmlChartTag(tag: string): string | null {
  const attributes = parseChartTagAttributes(tag);
  const type = attributes.type?.toLowerCase();
  const title = attributes.title?.trim() || "Chart";
  const data = parseLooseKeyValueData(attributes.data ?? "");
  if (!type || data.length === 0) return null;

  if (type === "donut_chart" || type === "pie_chart" || type === "doughnut" || type === "donut" || type === "pie") {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    return renderFence({
      type: "donut_chart",
      id: `donut-${slugify(title)}-${currentHHmm()}`,
      title,
      centerLabel: `${total}`,
      showLegend: true,
      data,
    });
  }

  if (type === "bar_chart" || type === "bar") {
    return renderFence({
      type: "bar_chart",
      id: `bar-${slugify(title)}-${currentHHmm()}`,
      title,
      data,
    });
  }

  if (type === "line_chart" || type === "line" || type === "area_chart" || type === "area") {
    return renderFence({
      type: type === "area" ? "area_chart" : type === "line" ? "line_chart" : type,
      id: `${type.startsWith("area") ? "area" : "line"}-${slugify(title)}-${currentHHmm()}`,
      title,
      series: [
        {
          name: title,
          data: data.map((item) => ({ x: item.label, y: item.value })),
        },
      ],
    });
  }

  return null;
}

function convertXmlChartElement(openTag: string, body: string): string | null {
  const attributes = parseChartTagAttributes(openTag);
  const type = attributes.type?.toLowerCase();
  const chartType = type ? chartJsTypeFromXmlType(type) : null;
  const title = attributes.title?.trim() || "Chart";
  const decodedBody = decodeHtmlEntities(body).trim();
  if (!chartType || !decodedBody) return null;

  try {
    const parsedBody = parseLooseChartObject(decodedBody);
    if (!parsedBody) return null;
    const chart = isRecord(parsedBody) && typeof parsedBody.type === "string" && isRecord(parsedBody.data)
      ? parsedBody
      : {
          type: chartType,
          data: parsedBody,
          options: chartJsTitleOptions(title),
        };
    const converted = convertChartJsBlock(chart);
    if (converted) return converted;

    const data = parseLooseKeyValueData(decodedBody);
    if (data.length === 0) return null;
    return convertXmlChartTag(`<chart type="${chartType}" title="${title}" data="${decodedBody}" />`);
  } catch {
    const data = parseLooseKeyValueData(decodedBody);
    if (data.length === 0) return null;
    return convertXmlChartTag(`<chart type="${chartType}" title="${title}" data="${decodedBody}" />`);
  }
}

function normalizeXmlChartTags(text: string): string {
  if (!/(?:<|&lt;)chart\b/i.test(text)) return text;
  return text
    .replace(/(?:<|&lt;)chart\b[\s\S]*?(?:\/>|\/&gt;)/gi, (tag) => convertXmlChartTag(tag) ?? tag)
    .replace(/(?:<|&lt;)chart\b[\s\S]*?(?:>|&gt;)([\s\S]*?)(?:<|&lt;)\/chart(?:>|&gt;)/gi, (tag, body: string) => convertXmlChartElement(tag, body) ?? tag);
}

function parseMermaidHour(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match?.[1] || !match[2]) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 24 || minute < 0 || minute > 59) {
    return null;
  }
  return hour + minute / 60;
}

function parseMermaidDuration(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(h|hour|hours|m|min|mins)$/i.exec(value.trim());
  if (!match?.[1] || !match[2]) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return match[2].toLowerCase().startsWith("h") ? amount : amount / 60;
}

function mermaidTone(tokens: string[]): "blue" | "green" | "amber" | "red" | "purple" {
  const joined = tokens.join(" ").toLowerCase();
  if (joined.includes("crit") || joined.includes("late") || joined.includes("overdue") || joined.includes("blocked")) return "red";
  if (joined.includes("done") || joined.includes("complete")) return "green";
  if (joined.includes("active") || joined.includes("running")) return "blue";
  if (joined.includes("pending") || joined.includes("wait") || joined.includes("collecting")) return "amber";
  return "purple";
}

function convertMermaidGantt(body: string): string | null {
  const lines = decodeHtmlEntities(body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || lines[0]?.toLowerCase() !== "gantt") return null;

  let title = "Gantt";
  let currentSection = "";
  const rows: Array<{ label: string; sub?: string; blocks: Array<{ start: number; end: number; label: string; tone: "blue" | "green" | "amber" | "red" | "purple" }> }> = [];

  for (const line of lines.slice(1)) {
    const titleMatch = /^title\s+(.+)$/i.exec(line);
    if (titleMatch?.[1]) {
      title = titleMatch[1].trim();
      continue;
    }

    const sectionMatch = /^section\s+(.+)$/i.exec(line);
    if (sectionMatch?.[1]) {
      currentSection = sectionMatch[1].trim();
      continue;
    }

    if (/^(dateFormat|axisFormat|excludes|todayMarker)\b/i.test(line)) continue;

    const taskMatch = /^(.+?)\s*:\s*(.+)$/.exec(line);
    if (!taskMatch?.[1] || !taskMatch[2]) continue;

    const taskLabel = taskMatch[1].trim();
    const tokens = taskMatch[2].split(",").map((part) => part.trim()).filter(Boolean);
    const times = tokens.map(parseMermaidHour).filter((value): value is number => value !== null);
    if (times.length === 0) continue;

    const start = times[0];
    const duration = tokens.map(parseMermaidDuration).find((value): value is number => value !== null);
    const end = Math.max(start + 0.25, times[1] ?? (duration ? start + duration : start + 1));
    const blockLabel = tokens.filter((token) => parseMermaidHour(token) === null && parseMermaidDuration(token) === null).join(" · ") || currentSection || taskLabel;

    rows.push({
      label: taskLabel,
      sub: currentSection || undefined,
      blocks: [
        {
          start,
          end: Math.min(end, 24),
          label: blockLabel,
          tone: mermaidTone(tokens),
        },
      ],
    });
  }

  if (rows.length === 0) return null;

  const starts = rows.flatMap((row) => row.blocks.map((block) => block.start));
  const ends = rows.flatMap((row) => row.blocks.map((block) => block.end));
  const minHour = Math.max(0, Math.floor(Math.min(...starts)));
  const maxHour = Math.min(24, Math.ceil(Math.max(...ends)));
  const hours = Array.from({ length: Math.max(1, maxHour - minHour + 1) }, (_, index) => minHour + index);
  const now = new Date();
  const nowHour = now.getHours() + now.getMinutes() / 60;

  return renderFence({
    type: "gantt",
    id: `gantt-${slugify(title)}-${currentHHmm()}`,
    title,
    hours,
    nowHour: nowHour >= minHour && nowHour <= maxHour ? nowHour : undefined,
    rows,
  });
}

function normalizeMermaidGanttBlocks(text: string): string {
  if (!/`{3,}\s*(?:mermaid|gantt)?[\s\r\n]+gantt\b/i.test(text)) return text;
  return text
    .replace(/`{3,}\s*(?:mermaid|gantt)\s*\n([\s\S]*?)`{3,}/gi, (fence, body: string) => convertMermaidGantt(body) ?? fence)
    .replace(/`{3,}\s*\n(\s*gantt[\s\S]*?)`{3,}/gi, (fence, body: string) => convertMermaidGantt(body) ?? fence);
}

function normalizeYamlChartFences(text: string): string {
  if (!/`{3,}\s*(?:ya?ml|chart)?\s*\n\s*type\s*:\s*(?:bar|pie|donut|doughnut|line|area)\b/i.test(text)) {
    return text;
  }
  return text.replace(/`{3,}\s*(?:ya?ml|chart)?\s*\n([\s\S]*?)`{3,}/gi, (fence, body: string) => convertYamlChartBlock(body) ?? fence);
}

function convertChartCodeFence(body: string): string | null {
  const decoded = decodeHtmlEntities(body).trim();
  if (!decoded) return null;

  if (decoded.includes(":::render")) {
    return decoded;
  }

  const yamlChart = convertYamlChartBlock(decoded);
  if (yamlChart) return yamlChart;

  const gantt = convertMermaidGantt(decoded);
  if (gantt) return gantt;

  const parsed = parseLooseChartObject(decoded);
  if (isRecord(parsed) && typeof parsed.type === "string") {
    const convertedChart = convertChartJsBlock(parsed);
    if (convertedChart) return convertedChart;
    if (knownRenderTypes.has(parsed.type)) return renderFence(parsed);
  }

  return null;
}

function normalizeChartCodeFences(text: string): string {
  if (!/`{3,}\s*(?:chart|render|json|ya?ml|mermaid|gantt)?\s*\n/i.test(text)) return text;

  return text.replace(
    /`{3,}\s*(?:chart|render|json|ya?ml|mermaid|gantt)?\s*\n([\s\S]*?)`{3,}/gi,
    (fence, body: string) => convertChartCodeFence(body) ?? fence,
  );
}

function unwrapRenderFenceWrappers(text: string): string {
  let output = text;

  for (let index = 0; index < 6; index += 1) {
    const next = output
      .replace(
        /(^|\n)[ \t]*`{3,}[ \t]*(?:chart|render|json|ya?ml)?[ \t]*\r?\n(?=[ \t]*:::render\b)/gi,
        "$1",
      )
      .replace(/(:::[ \t]*)\r?\n[ \t]*`{3,}[ \t]*(?=\r?\n|$)/g, "$1\n");

    if (next === output) break;
    output = next;
  }

  return output;
}

function convertChartJsBlock(chart: unknown): string | null {
  if (!isRecord(chart) || typeof chart.type !== "string") return null;
  const chartType = chart.type.toLowerCase();
  const data = isRecord(chart.data) ? chart.data : {};
  const labels = asLabelArray(data.labels);
  const datasets = asRecordArray(data.datasets);
  if (labels.length === 0 || datasets.length === 0) return null;

  if (chartType === "doughnut" || chartType === "donut" || chartType === "pie") {
    const dataset = datasets[0];
    const values = asNumberArray(dataset.data);
    if (values.length === 0) return null;
    const title = chartJsTitle(chart, "Donut chart");
    const total = values.reduce((sum, value) => sum + value, 0);
    return renderFence({
      type: "donut_chart",
      id: `donut-${slugify(title)}-${currentHHmm()}`,
      title,
      centerLabel: `${total}`,
      showLegend: true,
      data: labels.slice(0, values.length).map((label, index) => ({
        label,
        value: values[index],
        color: chartColor(dataset.backgroundColor, index),
      })),
    });
  }

  if (chartType === "bar") {
    const firstDataset = datasets[0];
    const firstValues = asNumberArray(firstDataset.data);
    if (firstValues.length === 0) return null;
    const title = chartJsTitle(chart, "Bar chart");
    const firstLabel = typeof firstDataset.label === "string" ? firstDataset.label : undefined;
    const blocks = [
      renderFence({
        type: "bar_chart",
        id: `bar-${slugify(title)}-${currentHHmm()}`,
        title,
        unit: firstLabel,
        data: labels.slice(0, firstValues.length).map((label, index) => ({
          label,
          value: firstValues[index],
          color: chartColor(firstDataset.backgroundColor, index),
        })),
      }),
    ];

    if (datasets.length > 1) {
      const columns = [
        { key: "label", header: "Hạng mục" },
        ...datasets.map((dataset, index) => ({
          key: tableKey(typeof dataset.label === "string" ? dataset.label : `Chỉ số ${index + 1}`, index),
          header: typeof dataset.label === "string" ? dataset.label : `Chỉ số ${index + 1}`,
          align: "right",
          format: "number",
        })),
      ];
      const rows = labels.map((label, labelIndex) => {
        const row: Record<string, unknown> = { label };
        datasets.forEach((dataset, datasetIndex) => {
          const key = columns[datasetIndex + 1]?.key;
          if (!key) return;
          row[key] = asNumberArray(dataset.data)[labelIndex] ?? null;
        });
        return row;
      });
      blocks.push(
        renderFence({
          type: "table",
          id: `table-${slugify(title)}-${currentHHmm()}`,
          title: `${title} - chi tiết`,
          columns,
          rows,
        }),
      );
    }

    return blocks.join("\n\n");
  }

  if (chartType === "line" || chartType === "area") {
    const title = chartJsTitle(chart, "Line chart");
    const series = datasets
      .map((dataset, index) => {
        const values = asNumberArray(dataset.data);
        if (values.length === 0) return null;
        return {
          name: typeof dataset.label === "string" ? dataset.label : `Series ${index + 1}`,
          color: chartColor(dataset.borderColor, 0) ?? chartColor(dataset.backgroundColor, 0),
          data: labels.slice(0, values.length).map((label, valueIndex) => ({
            x: label,
            y: values[valueIndex],
          })),
        };
      })
      .filter((item): item is { name: string; color: string | undefined; data: Array<{ x: string; y: number }> } => item !== null);
    if (series.length === 0) return null;
    return renderFence({
      type: chartType === "area" ? "area_chart" : "line_chart",
      id: `${chartType === "area" ? "area" : "line"}-${slugify(title)}-${currentHHmm()}`,
      title,
      series,
    });
  }

  return null;
}

function findJsonObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function isInsideRenderFence(text: string, index: number): boolean {
  const lastOpen = text.lastIndexOf(":::render", index);
  if (lastOpen < 0) return false;
  const lastFenceToken = text.lastIndexOf(":::", index);
  return lastFenceToken === lastOpen;
}

function normalizeChartJsRenderBlocks(text: string): string {
  if (!/"type"\s*:\s*"(?:bar|doughnut|donut|pie|line)"/i.test(text)) {
    return text;
  }

  let output = "";
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf("{", cursor);
    if (start < 0) {
      output += text.slice(cursor);
      break;
    }

    output += text.slice(cursor, start);
    const end = findJsonObjectEnd(text, start);
    if (end < 0) {
      output += text.slice(start);
      break;
    }

    const candidate = text.slice(start, end + 1);
    if (isInsideRenderFence(text, start)) {
      output += candidate;
      cursor = end + 1;
      continue;
    }

    try {
      const converted = convertChartJsBlock(JSON.parse(candidate) as unknown);
      output += converted ?? candidate;
    } catch {
      output += candidate;
    }

    cursor = end + 1;
  }

  return output;
}

export function normalizeLooseRenderBlocks(text: string): string {
  const normalized = normalizeChartCodeFences(
    normalizeYamlChartFences(
      normalizeMermaidGanttBlocks(normalizeXmlChartTags(normalizeChartJsRenderBlocks(unwrapRenderFenceWrappers(text)))),
    ),
  );
  const unwrapped = unwrapRenderFenceWrappers(normalized);
  if (!/\bdonut\b/i.test(unwrapped)) {
    return unwrapped;
  }

  const lines = unwrapped.split(/\r?\n/);
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().toLowerCase() !== "donut") {
      output.push(line);
      continue;
    }

    let previousIndex = output.length - 1;
    while (previousIndex >= 0 && output[previousIndex].trim() === "") previousIndex -= 1;
    const previousLine = previousIndex >= 0 ? output[previousIndex].trim() : "";
    const headingMatch = /^Render Block:\s*(.+?)(?:\s*\((?:Donut Chart|donut_chart)\))?\s*$/i.exec(previousLine);

    let title = headingMatch?.[1]?.trim() ?? "Donut chart";
    const data: Array<{ label: string; value: number }> = [];
    let cursor = index + 1;

    for (; cursor < lines.length; cursor += 1) {
      const current = lines[cursor].trim();
      if (!current) break;

      const titleMatch = /^title\s+(.+)$/i.exec(current);
      if (titleMatch?.[1]) {
        title = titleMatch[1].trim();
        continue;
      }

      const valueMatch = /^"([^"]+)"\s*:\s*(-?\d+(?:[.,]\d+)?)$/.exec(current);
      if (valueMatch?.[1] && valueMatch[2]) {
        data.push({
          label: valueMatch[1],
          value: Number(valueMatch[2].replace(",", ".")),
        });
        continue;
      }

      break;
    }

    if (data.length === 0) {
      output.push(line);
      continue;
    }

    if (headingMatch && previousIndex >= 0) {
      output.splice(previousIndex, output.length - previousIndex);
    }

    const total = data.reduce((sum, item) => sum + item.value, 0);
    const block = {
      type: "donut_chart",
      id: `donut-${slugify(title)}-${currentHHmm()}`,
      title,
      centerLabel: `${total}`,
      showLegend: true,
      data,
    };

    output.push(":::render", JSON.stringify(block), ":::");
    index = cursor - 1;
  }

  return output.join("\n");
}

function normalizeRenderBlockData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  if (data.type === "pie_chart") return { ...data, type: "donut_chart" };
  return data;
}

function findPendingChartTagStart(text: string): number {
  const pattern = /(?:<|&lt;)chart\b/gi;
  let match: RegExpExecArray | null;
  let pendingStart = -1;

  while ((match = pattern.exec(text)) !== null) {
    const rest = text.slice(match.index);
    const closesSelf = /(?:\/>|\/&gt;)/i.test(rest);
    const closesPair = /(?:<|&lt;)\/chart(?:>|&gt;)/i.test(rest);
    if (!closesSelf && !closesPair) pendingStart = match.index;
  }

  return pendingStart;
}

function hasClosingCodeFence(text: string, start: number): boolean {
  return /`{3,}/.test(text.slice(start));
}

function findPendingMermaidGanttStart(text: string): number {
  const pattern = /`{3,}\s*(?:mermaid|gantt)?\s*\n\s*gantt\b/gi;
  let match: RegExpExecArray | null;
  let pendingStart = -1;

  while ((match = pattern.exec(text)) !== null) {
    if (!hasClosingCodeFence(text, match.index + match[0].length)) pendingStart = match.index;
  }

  return pendingStart;
}

function findPendingChartJsonStart(text: string): number {
  const pattern = /{\s*"type"\s*:\s*"(?:bar|doughnut|donut|pie|line)"/gi;
  let match: RegExpExecArray | null;
  let pendingStart = -1;

  while ((match = pattern.exec(text)) !== null) {
    if (findJsonObjectEnd(text, match.index) < 0) pendingStart = match.index;
  }

  return pendingStart;
}

function findPendingYamlChartFenceStart(text: string): number {
  const pattern = /`{3,}\s*(?:ya?ml|chart)?\s*\n\s*type\s*:\s*(?:bar|pie|donut|doughnut|line|area)\b/gi;
  let match: RegExpExecArray | null;
  let pendingStart = -1;

  while ((match = pattern.exec(text)) !== null) {
    if (!hasClosingCodeFence(text, match.index + match[0].length)) pendingStart = match.index;
  }

  return pendingStart;
}

function findPendingGenericChartFenceStart(text: string): number {
  const pattern = /`{3,}\s*(?:chart|render)\b/gi;
  let match: RegExpExecArray | null;
  let pendingStart = -1;

  while ((match = pattern.exec(text)) !== null) {
    if (!hasClosingCodeFence(text, match.index + match[0].length)) pendingStart = match.index;
  }

  return pendingStart;
}

function findPendingRenderStart(text: string): number {
  const starts = [
    text.indexOf(":::render"),
    findPendingChartTagStart(text),
    findPendingMermaidGanttStart(text),
    findPendingChartJsonStart(text),
    findPendingYamlChartFenceStart(text),
    findPendingGenericChartFenceStart(text),
  ].filter((index) => index >= 0);

  return starts.length > 0 ? Math.min(...starts) : -1;
}

export function parseStream(text: string): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  if (!text) return chunks;
  const normalizedText = normalizeLooseRenderBlocks(text);

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  renderFencePattern.lastIndex = 0;

  while ((match = renderFencePattern.exec(normalizedText)) !== null) {
    if (match.index > lastIndex) {
      const markdown = normalizedText.slice(lastIndex, match.index).trim();
      if (markdown) chunks.push({ kind: "md", body: markdown });
    }

    try {
      chunks.push({ kind: "block", data: normalizeRenderBlockData(JSON.parse(match[1]?.trim() ?? "") as unknown) });
    } catch {
      chunks.push({ kind: "md", body: "_(invalid render block)_" });
    }

    lastIndex = renderFencePattern.lastIndex;
  }

  const tail = normalizedText.slice(lastIndex);
  const pendingRenderStart = findPendingRenderStart(tail);
  if (pendingRenderStart >= 0) {
    const before = tail.slice(0, pendingRenderStart).trim();
    if (before) chunks.push({ kind: "md", body: before });
    chunks.push({ kind: "block-loading" });
    return chunks;
  }

  const trailingMarkdown = tail.trim();
  if (trailingMarkdown) chunks.push({ kind: "md", body: trailingMarkdown });
  return chunks;
}
