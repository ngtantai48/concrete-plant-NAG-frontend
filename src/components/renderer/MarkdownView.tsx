"use client";

import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

const renderCodeFenceLanguages = new Set([
  "chart",
  "render",
  "yaml",
  "yml",
  "json",
  "mermaid",
  "gantt",
]);

const renderPayloadPattern =
  /(?:^|\n)\s*(?::::render\b|gantt\b|type\s*:\s*(?:bar|bar_chart|pie|pie_chart|donut|donut_chart|doughnut|line|line_chart|area|area_chart|gantt)\b|{\s*["']?type["']?\s*:\s*["'](?:bar|bar_chart|pie|pie_chart|donut|donut_chart|doughnut|line|line_chart|area|area_chart|gantt|kpi_grid|timeline|table|map_view|image|file|alert|action_proposal|source_chips|followups)["']|{\s*["'](?:kpi_grid|line_chart|bar_chart|donut_chart|area_chart|gantt|timeline|table|map_view|image|file|alert|action_proposal|source_chips|followups)["']\s*:|<chart\b|\{\{\s*(?:chart|bar|bar_chart|donut|donut_chart|pie|pie_chart|doughnut|line|line_chart|area|area_chart|table)\b)/i;

function extractCodeChildren(children: ReactNode): ReactNode {
  if (Array.isArray(children)) return children.map((child) => extractCodeChildren(child));
  if (isValidElement<{ children?: ReactNode }>(children)) return children.props.children ?? null;
  return children;
}

function normalizeCodeFenceLanguage(openingLine: string): string {
  return (
    openingLine
      .replace(/^\s*`{3,}/, "")
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase() ?? ""
  );
}

function stripKnownRenderFences(value: string): string {
  return value.replace(
    /(^|\n)([ \t]*`{3,}[ \t]*([a-zA-Z_-]+)?[^\n]*\n([\s\S]*?)\n?[ \t]*`{3,})/g,
    (match: string, prefix: string, fence: string, language: string | undefined, body: string) => {
      const normalizedLanguage = (language ?? "").toLowerCase();
      const looksLikeRender =
        renderCodeFenceLanguages.has(normalizedLanguage) || renderPayloadPattern.test(body);
      return looksLikeRender ? prefix : match;
    }
  );
}

function trimDanglingRenderSyntax(value: string): string {
  const candidates = [
    value.lastIndexOf(":::render"),
    value.search(/(?:<|&lt;)chart\b(?![\s\S]*(?:\/>|\/&gt;|(?:<|&lt;)\/chart(?:>|&gt;)))/i),
    value.search(
      /\{\{\s*(?:chart|bar|bar_chart|donut|donut_chart|pie|pie_chart|doughnut|line|line_chart|area|area_chart|table)\b(?![\s\S]*\}\})/i
    ),
  ].filter((index) => index >= 0);

  if (candidates.length === 0) return value;
  return value.slice(0, Math.min(...candidates)).trimEnd();
}

function stabilizeOpenCodeFence(value: string): string {
  const fences = Array.from(value.matchAll(/(^|\n)([ \t]*`{3,}[^\n]*)/g));
  if (fences.length % 2 === 0) return value;

  const lastFence = fences[fences.length - 1];
  const start = lastFence?.index ?? -1;
  const openingLine = lastFence?.[2] ?? "";
  if (start < 0) return value;

  const language = normalizeCodeFenceLanguage(openingLine);
  const body = value.slice(start + openingLine.length);
  if (renderCodeFenceLanguages.has(language) || renderPayloadPattern.test(body)) {
    return value.slice(0, start).trimEnd();
  }

  return `${value}\n\`\`\``;
}

function stabilizeTrailingTable(value: string): string {
  const lines = value.split(/\r?\n/);
  let lastIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.trim()) {
      lastIndex = index;
      break;
    }
  }
  if (lastIndex < 1) return value;

  const lastLine = lines[lastIndex] ?? "";
  const previousLine = lines[lastIndex - 1] ?? "";
  const isLikelyTableLine = lastLine.includes("|") && previousLine.includes("|");
  const hasDelimiterNearby = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(
    previousLine
  );
  if (!isLikelyTableLine || hasDelimiterNearby || lastLine.trim().endsWith("|")) return value;

  lines.splice(lastIndex, 1);
  return lines.join("\n").trimEnd();
}

export function prepareMarkdownForRender(body: string, streaming = false): string {
  const withoutRenderNoise = trimDanglingRenderSyntax(stripKnownRenderFences(body)).trim();
  if (!streaming || !withoutRenderNoise) return withoutRenderNoise;
  return stabilizeTrailingTable(stabilizeOpenCodeFence(withoutRenderNoise)).trim();
}

const markdownComponents = {
  p({ children }) {
    return (
      <p className="my-1 text-[13px] leading-5 text-zinc-700 dark:text-zinc-250">{children}</p>
    );
  },
  h1({ children }) {
    return (
      <h1 className="mb-1.5 mt-2.5 text-[15px] font-extrabold leading-5 text-zinc-950 dark:text-zinc-50">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="mb-1.5 mt-2.5 text-[14px] font-extrabold leading-5 text-zinc-950 dark:text-zinc-50">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="mb-1 mt-2 text-[13px] font-extrabold leading-5 text-zinc-950 dark:text-zinc-50">
        {children}
      </h3>
    );
  },
  ul({ children }) {
    return <ul className="my-1.5 ml-0 space-y-1 pl-4 text-[13px] leading-5">{children}</ul>;
  },
  ol({ children }) {
    return (
      <ol className="my-1.5 ml-0 list-decimal space-y-1 pl-5 text-[13px] leading-5">{children}</ol>
    );
  },
  li({ children }) {
    return (
      <li className="pl-0.5 text-zinc-700 marker:text-zinc-400 dark:text-zinc-250 dark:marker:text-zinc-500">
        {children}
      </li>
    );
  },
  strong({ children }) {
    return <strong className="font-extrabold text-zinc-950 dark:text-zinc-50">{children}</strong>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-[#007AFF]/35 pl-3 text-[13px] leading-5 text-zinc-600 dark:text-zinc-300">
        {children}
      </blockquote>
    );
  },
  table({ children }) {
    return (
      <div className="my-2 w-full overflow-x-auto rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-950">
        <table className="w-full min-w-max border-collapse text-left text-[12px] leading-5">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead className="bg-zinc-50 text-zinc-950 dark:bg-white/[0.06] dark:text-zinc-100">
        {children}
      </thead>
    );
  },
  th({ children }) {
    return (
      <th className="whitespace-nowrap border-b border-black/10 px-2.5 py-1.5 align-bottom text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-zinc-500 dark:border-white/10">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="whitespace-nowrap border-b border-black/[0.06] px-2.5 py-1.5 align-top last:border-b-0 dark:border-white/[0.08]">
        {children}
      </td>
    );
  },
  pre({ children }) {
    return (
      <pre className="my-3 max-w-full overflow-x-auto rounded-md border border-black/10 bg-zinc-950 p-3 text-[12px] leading-5 text-zinc-50 dark:border-white/10">
        <code className="font-mono">{extractCodeChildren(children)}</code>
      </pre>
    );
  },
  code({ className, children }) {
    const isBlock = typeof className === "string" && className.includes("language-");
    return (
      <code
        className={cn(
          "font-mono",
          isBlock
            ? "bg-transparent p-0 text-inherit"
            : "rounded bg-zinc-100 px-1.5 py-0.5 text-[0.92em] font-medium text-zinc-800 dark:bg-white/10 dark:text-zinc-100"
        )}
      >
        {children}
      </code>
    );
  },
} satisfies Components;

export function MarkdownView({
  body,
  className,
  streaming = false,
}: {
  body: string;
  className?: string;
  streaming?: boolean;
}) {
  const preparedBody = prepareMarkdownForRender(body, streaming);
  if (!preparedBody) return null;

  return (
    <div
      className={cn(
        "renderer-markdown max-w-none overflow-hidden text-[13px] leading-5 text-zinc-700 dark:text-zinc-250 [&_a]:font-semibold [&_a]:text-[#0A66E0] [&_a]:no-underline dark:[&_a]:text-[#6DB4FF] [&_li>p]:my-0 [&_ul]:list-disc",
        streaming && "renderer-markdown-streaming",
        className
      )}
    >
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {preparedBody}
      </ReactMarkdown>
    </div>
  );
}
