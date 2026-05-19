import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const tsModuleCache = new Map();

function loadTsModule(filePath) {
  const resolvedPath = resolve(filePath);
  const cached = tsModuleCache.get(resolvedPath);
  if (cached) return cached.exports;

  const source = readFileSync(resolvedPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: resolvedPath,
  });
  const module = { exports: {} };
  tsModuleCache.set(resolvedPath, module);
  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      const tsPath = specifier.endsWith(".ts") ? specifier : `${specifier}.ts`;
      return loadTsModule(resolve(dirname(resolvedPath), tsPath));
    }
    return require(specifier);
  };
  const wrapped = new Function("module", "exports", "require", outputText);
  wrapped(module, module.exports, localRequire);
  return module.exports;
}

const { parseStream } = loadTsModule("src/components/renderer/parseStream.ts");
const { renderBlockDataSchema } = loadTsModule("src/components/renderer/types.ts");

const canonicalBlocks = [
  {
    type: "kpi_grid",
    id: "kpi-contract",
    title: "Contract KPI",
    items: [{ label: "Total", value: 17, unit: "orders", tone: "blue" }],
  },
  {
    type: "line_chart",
    id: "line-contract",
    title: "Contract line",
    series: [{ name: "Orders", data: [{ x: "01:00", y: 2 }] }],
  },
  {
    type: "bar_chart",
    id: "bar-contract",
    title: "Contract bar",
    data: [{ label: "X09", value: 2, color: "#007AFF" }],
  },
  {
    type: "donut_chart",
    id: "donut-contract",
    title: "Contract donut",
    data: [{ label: "Moving", value: 14, color: "#007AFF" }],
  },
  {
    type: "area_chart",
    id: "area-contract",
    title: "Contract area",
    series: [{ name: "Orders", data: [{ x: "01:00", y: 2 }] }],
  },
  {
    type: "gantt",
    id: "gantt-contract",
    title: "Contract gantt",
    hours: [1, 2, 3],
    rows: [
      {
        label: "X09",
        blocks: [{ start: 1, end: 2, label: "Moving", tone: "blue" }],
      },
    ],
  },
  {
    type: "timeline",
    id: "timeline-contract",
    title: "Contract timeline",
    events: [{ time: "01:00", title: "Order started" }],
  },
  {
    type: "table",
    id: "table-contract",
    title: "Contract table",
    columns: [{ key: "vehicle", header: "Vehicle" }],
    rows: [{ vehicle: "X09" }],
  },
  {
    type: "map_view",
    id: "map-contract",
    title: "Contract map",
    center: { lat: 10.8, lng: 106.7 },
    markers: [{ id: "x09", lat: 10.8, lng: 106.7, kind: "vehicle", label: "X09" }],
  },
  {
    type: "image",
    id: "image-contract",
    title: "Contract image",
    url: "/api/ai-artifacts?path=sample.png",
    filename: "sample.png",
    mimeType: "image/png",
  },
  {
    type: "file",
    id: "file-contract",
    title: "Contract file",
    url: "/api/ai-artifacts?path=report.xlsx",
    filename: "report.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 1024,
  },
  {
    type: "alert",
    id: "alert-contract",
    level: "warn",
    title: "Contract alert",
    body: "Needs attention",
  },
  {
    type: "action_proposal",
    id: "action-contract",
    intent: "send_alert",
    summary: "Notify dispatch",
    payload: { vehicle: "X09" },
  },
  {
    type: "markdown",
    id: "markdown-contract",
    body: "**Summary**",
  },
  {
    type: "source_chips",
    id: "sources-contract",
    items: [{ id: 1, tool: "getProductionReport", label: "Report", count: 17 }],
  },
  {
    type: "followups",
    id: "followups-contract",
    items: ["Show active orders"],
  },
];

function renderFence(block) {
  return `:::render\n${JSON.stringify(block)}\n:::`;
}

function blockChunks(text) {
  return parseStream(text).filter((chunk) => chunk.kind === "block");
}

function markdownChunks(text) {
  return parseStream(text).filter((chunk) => chunk.kind === "md");
}

function assertValidBlocks(chunks) {
  assert.ok(chunks.length > 0, "expected at least one block chunk");
  for (const chunk of chunks) {
    const parsed = renderBlockDataSchema.safeParse(chunk.data);
    assert.equal(
      parsed.success,
      true,
      JSON.stringify(parsed.success ? null : parsed.error.issues, null, 2)
    );
  }
}

function assertNoRawRenderLeak(text, forbidden = []) {
  const markdown = markdownChunks(text)
    .map((chunk) => chunk.body)
    .join("\n");
  for (const token of forbidden) {
    assert.equal(markdown.includes(token), false, `raw token leaked into markdown: ${token}`);
  }
}

test("canonical :::render blocks cover all render types", () => {
  const text = canonicalBlocks.map(renderFence).join("\n\n");
  const chunks = blockChunks(text);
  assert.deepEqual(
    chunks.map((chunk) => chunk.data.type),
    canonicalBlocks.map((block) => block.type)
  );
  assertValidBlocks(chunks);
});

test("json-first multi-block object normalizes to canonical blocks", () => {
  const payload = {
    kpi_grid: {
      title: "Daily overview",
      data: [
        { label: "Total orders", value: "17", unit: "orders", color: "#007AFF" },
        { label: "Completed", value: "2", unit: "orders", color: "#34C759" },
      ],
    },
    donut_chart: {
      title: "Order status split",
      data: [
        { label: "Moving", value: 14, color: "#007AFF" },
        { label: "Completed", value: 2, color: "#34C759" },
      ],
    },
    bar_chart: {
      title: "Top vehicles",
      data: [
        { label: "X09", value: 2, color: "#007AFF" },
        { label: "X08", value: 2, color: "#007AFF" },
      ],
    },
    table: {
      title: "Vehicle detail",
      headers: ["Vehicle", "Plate", "Orders", "Distance km"],
      data: [["X09", "73A-32772", 2, 18]],
    },
  };
  const text = `Top vehicles today\n${JSON.stringify(payload, null, 2)}`;
  const chunks = blockChunks(text);
  assert.deepEqual(
    chunks.map((chunk) => chunk.data.type),
    ["kpi_grid", "donut_chart", "bar_chart", "table"]
  );
  assertValidBlocks(chunks);
  assertNoRawRenderLeak(text, ["kpi_grid", "donut_chart", "bar_chart"]);
});

test("single json type block normalizes to canonical chart", () => {
  const text = JSON.stringify({
    type: "bar_chart",
    title: "Top vehicles",
    data: [{ label: "X09", value: 2 }],
  });
  const chunks = blockChunks(text);
  assert.deepEqual(
    chunks.map((chunk) => chunk.data.type),
    ["bar_chart"]
  );
  assertValidBlocks(chunks);
});

test("chart.js bar and doughnut json normalize to render chart blocks", () => {
  const bar = JSON.stringify({
    type: "bar",
    data: {
      labels: ["X09", "X08"],
      datasets: [{ label: "Orders", data: [2, 2], backgroundColor: "#007AFF" }],
    },
    options: { plugins: { title: { text: "Top vehicles" } } },
  });
  const doughnut = JSON.stringify({
    type: "doughnut",
    data: {
      labels: ["Moving", "Completed"],
      datasets: [{ data: [14, 2], backgroundColor: ["#007AFF", "#34C759"] }],
    },
    options: { plugins: { title: { text: "Order status" } } },
  });
  const chunks = blockChunks(`${bar}\n\n${doughnut}`);
  assert.deepEqual(
    chunks.map((chunk) => chunk.data.type),
    ["bar_chart", "donut_chart"]
  );
  assertValidBlocks(chunks);
});

test("table headers/data json normalizes to columns/rows", () => {
  const text = JSON.stringify({
    type: "table",
    title: "Vehicle detail",
    headers: ["Vehicle", "Plate", "Orders"],
    data: [["X09", "73A-32772", 2]],
  });
  const [chunk] = blockChunks(text);
  assert.equal(chunk.data.type, "table");
  assert.deepEqual(
    chunk.data.columns.map((column) => column.key),
    ["vehicle", "plate", "orders"]
  );
  assert.deepEqual(chunk.data.rows, [{ vehicle: "X09", plate: "73A-32772", orders: 2 }]);
  assertValidBlocks([chunk]);
});

test("executeCode image and file artifacts normalize backend aliases", () => {
  const chunks = blockChunks(
    [
      JSON.stringify({
        type: "image",
        id: "nag-artifact-0",
        url: "/static/nag/artifacts/chart.png",
        title: "Chart",
        alt: "Chart preview",
        width: 1200,
        height: 700,
      }),
      JSON.stringify({
        type: "file",
        id: "nag-artifact-1",
        url: "/static/nag/artifacts/report.pdf",
        name: "bao-cao.pdf",
        title: "Báo cáo",
        mime: "application/pdf",
        size: 1378,
      }),
    ].join("\n\n")
  );

  assert.deepEqual(
    chunks.map((chunk) => chunk.data.type),
    ["image", "file"]
  );
  assert.equal(chunks[1].data.filename, "bao-cao.pdf");
  assert.equal(chunks[1].data.mimeType, "application/pdf");
  assert.equal(chunks[1].data.sizeBytes, 1378);
  assertValidBlocks(chunks);
});

test("gantt matrix json normalizes to hours and rows", () => {
  const text = JSON.stringify({
    type: "gantt",
    title: "Vehicle activity (01:00 - 05:00)",
    data: {
      labels: ["Vehicle", "01:00", "02:00", "03:00", "04:00", "05:00"],
      data: [
        ["X09", "Moving", "Moving", "", "Completed", ""],
        ["X08", "", "Waiting", "Moving", "Moving", "Completed"],
      ],
    },
  });
  const [chunk] = blockChunks(text);
  assert.equal(chunk.data.type, "gantt");
  assert.deepEqual(chunk.data.hours, [1, 2, 3, 4, 5]);
  assert.equal(chunk.data.rows.length, 2);
  assert.equal(chunk.data.rows[0].blocks[0].start, 1);
  assert.equal(chunk.data.rows[0].blocks[0].end, 3);
  assertValidBlocks([chunk]);
});

test("xml, template, yaml and mermaid loose formats do not leak when recoverable", () => {
  const text = [
    '<chart type="donut_chart" title="Status" data="{\'Moving\': 14, \'Completed\': 2}" />',
    '{{bar_chart|labels=["X09","X08"]|values=[2,2]|title=Top vehicles}}',
    "```chart\ntype: bar\ntitle: Orders\nlabels: ['X09', 'X08']\ndatasets:\n  - label: 'Orders'\n    data: [2, 2]\n```",
    "```mermaid\ngantt\ntitle Vehicle activity\nsection X09\nMoving : active, 01:00, 2h\n```",
  ].join("\n\n");
  const chunks = blockChunks(text);
  assert.deepEqual(
    chunks.map((chunk) => chunk.data.type),
    ["donut_chart", "bar_chart", "bar_chart", "gantt"]
  );
  assertValidBlocks(chunks);
  assertNoRawRenderLeak(text, ["<chart", "{{bar_chart", "```chart", "```mermaid"]);
});

test("partial render json becomes loading skeleton instead of raw markdown", () => {
  const chunks = parseStream(
    'Summary\n{"kpi_grid":{"title":"Daily overview","data":[{"label":"Total"'
  );
  assert.equal(chunks.at(-1).kind, "block-loading");
  assert.equal(
    chunks.some((chunk) => chunk.kind === "md" && chunk.body.includes("kpi_grid")),
    false
  );
});

test("partial chart fences become loading skeleton instead of raw markdown", () => {
  const chunks = parseStream(
    "Fleet summary\n```chart\ntype: bar\ntitle: Top vehicles\nlabels: ['X09'"
  );
  assert.equal(chunks.at(-1).kind, "block-loading");
  assert.equal(
    chunks.some((chunk) => chunk.kind === "md" && chunk.body.includes("```chart")),
    false
  );
});

test("completed stream suppresses dangling render skeleton", () => {
  const chunks = parseStream("Summary\n```chart\ntype: bar\ntitle: Top vehicles", {
    showPendingLoading: false,
  });
  assert.equal(
    chunks.some((chunk) => chunk.kind === "block-loading"),
    false
  );
  assert.equal(
    chunks.some((chunk) => chunk.kind === "md" && chunk.body.includes("```chart")),
    false
  );
});

test("short no-data fallback after rendered blocks is suppressed", () => {
  const block = renderFence({
    type: "table",
    id: "vehicle-detail",
    title: "Vehicle detail",
    columns: [{ key: "vehicle", header: "Vehicle" }],
    rows: [{ vehicle: "X09" }],
  });
  const chunks = parseStream(
    `${block}\n\nTôi không tìm thấy thông tin này trong dữ liệu Nguyên Anh Group.`
  );
  assert.equal(
    chunks.some((chunk) => chunk.kind === "md" && chunk.body.includes("không tìm thấy")),
    false
  );
  assert.equal(chunks.filter((chunk) => chunk.kind === "block").length, 1);
});

test("invalid render fence is contained and does not crash", () => {
  const chunks = parseStream(":::render\n{ invalid json\n:::");
  assert.deepEqual(chunks, [{ kind: "md", body: "_(invalid render block)_" }]);
});
