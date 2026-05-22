"use client";

import { useEffect, useId, useRef, useState } from "react";

// Mermaid runtime nặng (~700KB), lazy-import qua dynamic chỉ load khi user
// thực sự gặp fence ```mermaid``` trong câu trả lời.
//
// Tại sao tách Mermaid riêng:
// - Backend (LLM) sinh chart phức tạp/diagram/flow/pie/timeline bằng cú pháp text
//   thay vì JSON schema chi tiết → giảm lỗi schema drift.
// - 1 file `MermaidBlock` cover tất cả: flowchart, pie, gantt, sequence, timeline,
//   mindmap, quadrantChart, sankey, xychart-beta (bar/line).
// - Re-render khi `chart` đổi (streaming sinh dần) hoặc theme đổi.

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string; bindFunctions?: (el: Element) => void }>;
  parse: (text: string, opts?: { suppressErrors?: boolean }) => Promise<boolean | null>;
};

let mermaidPromise: Promise<MermaidApi> | null = null;
let initialized = false;

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const api = (mod.default ?? mod) as unknown as MermaidApi;
      if (!initialized) {
        api.initialize({
          startOnLoad: false,
          theme: detectIsDark() ? "dark" : "default",
          securityLevel: "strict",
          fontFamily: "var(--font-chat-sans), system-ui, sans-serif",
          flowchart: { htmlLabels: true, curve: "basis" },
          gantt: { useWidth: 800 },
        });
        initialized = true;
      }
      return api;
    });
  }
  return mermaidPromise;
}

function detectIsDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

// Mermaid không nên chạy với code chưa hoàn chỉnh (streaming) — sẽ throw và spam
// console. Heuristic đơn giản: code phải có >=1 dòng non-empty và phải bắt đầu bằng
// 1 trong các keyword được Mermaid hỗ trợ.
const MERMAID_KEYWORDS = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "quadrantChart",
  "requirementDiagram",
  "gitGraph",
  "mindmap",
  "timeline",
  "sankey-beta",
  "xychart-beta",
  "block-beta",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
];

function looksLikeCompleteMermaid(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  const firstWord = trimmed.split(/\s|\n/, 1)[0] ?? "";
  return MERMAID_KEYWORDS.some((kw) => firstWord === kw || trimmed.startsWith(kw));
}

export function MermaidBlock({ chart, streaming = false }: { chart: string; streaming?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  // Mermaid yêu cầu id hợp lệ CSS — useId trả về ":r0:" có dấu : nên cần sanitize.
  const safeId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Trong lúc streaming nếu code chưa đủ keyword mở đầu → giữ skeleton, đừng render.
    if (streaming && !looksLikeCompleteMermaid(chart)) {
      setSvg(null);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    loadMermaid()
      .then(async (api) => {
        // Validate trước, tránh throw từ render() gây side-effect (Mermaid chèn DOM tạm).
        const valid = await api.parse(chart, { suppressErrors: true }).catch(() => false);
        if (cancelled) return;
        if (!valid) {
          setError("Mermaid syntax không hợp lệ");
          setSvg(null);
          return;
        }
        const { svg: rendered, bindFunctions } = await api.render(safeId, chart);
        if (cancelled) return;
        setSvg(rendered);
        setError(null);
        if (bindFunctions && containerRef.current) {
          // Bind click/hover handlers (sequence, flowchart link...).
          requestAnimationFrame(() => {
            if (containerRef.current) bindFunctions(containerRef.current);
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setSvg(null);
      });

    return () => {
      cancelled = true;
    };
  }, [chart, safeId, streaming]);

  if (error) {
    return (
      <div
        className="my-4 overflow-hidden rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-[12px] text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200"
        data-testid="mermaid-block-error"
      >
        <div className="mb-2 font-semibold">Không vẽ được sơ đồ Mermaid</div>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-5 opacity-80">
          {chart}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        className="my-4 flex h-32 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-[12px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400"
        data-testid="mermaid-block-loading"
      >
        <span className="inline-flex items-center gap-2">
          <span className="size-3 animate-spin rounded-full border-2 border-zinc-300 border-t-[#007AFF]" />
          Đang dựng sơ đồ…
        </span>
      </div>
    );
  }

  return (
    <div
      className="my-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 [&>svg]:max-w-full [&>svg]:h-auto"
      data-testid="mermaid-block"
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
