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
    return <p className="my-3 first:mt-0 last:mb-0">{children}</p>;
  },
  h1({ children }) {
    return (
      <h1 className="mb-3 mt-6 first:mt-0 text-[1.75em] font-bold leading-[1.3] tracking-tight">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="mb-3 mt-6 first:mt-0 text-[1.4em] font-bold leading-[1.35] tracking-tight">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="mb-2 mt-5 first:mt-0 text-[1.15em] font-semibold leading-[1.4]">
        {children}
      </h3>
    );
  },
  h4({ children }) {
    return <h4 className="mb-2 mt-4 first:mt-0 text-[1em] font-semibold">{children}</h4>;
  },
  ul({ children }) {
    return <ul className="my-3 ml-0 list-disc space-y-2 pl-6">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-3 ml-0 list-decimal space-y-2 pl-6">{children}</ol>;
  },
  li({ children }) {
    return (
      <li className="pl-1 marker:text-zinc-400 dark:marker:text-zinc-500 [&>p]:my-1">
        {children}
      </li>
    );
  },
  strong({ children }) {
    return <strong className="font-semibold text-zinc-950 dark:text-zinc-50">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic">{children}</em>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-4 border-l-2 border-zinc-300 pl-4 italic text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-6 border-zinc-200 dark:border-zinc-800" />;
  },
  table({ children }) {
    return (
      <div className="my-4 w-full overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full min-w-max border-collapse text-left text-[0.875em] leading-6">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead className="bg-zinc-50 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-100">
        {children}
      </thead>
    );
  },
  th({ children }) {
    return (
      <th className="whitespace-nowrap border-b border-zinc-200 px-3 py-2 align-bottom text-[0.78em] font-semibold uppercase tracking-[0.04em] text-zinc-500 dark:border-zinc-800">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="border-b border-zinc-100 px-3 py-2 align-top last:border-b-0 dark:border-zinc-800/60">
        {children}
      </td>
    );
  },
  pre({ children }) {
    return (
      <pre className="my-4 max-w-full overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-[0.85em] leading-6 text-zinc-50 dark:border-zinc-800">
        <code
          className="font-mono"
          style={{ fontFamily: "var(--font-chat-mono)" }}
        >
          {extractCodeChildren(children)}
        </code>
      </pre>
    );
  },
  code({ className, children }) {
    const isBlock = typeof className === "string" && className.includes("language-");
    return (
      <code
        className={cn(
          isBlock
            ? "bg-transparent p-0 text-inherit"
            : "rounded bg-zinc-100 px-1.5 py-0.5 text-[0.875em] font-medium text-rose-700 dark:bg-zinc-800 dark:text-rose-300"
        )}
        style={{ fontFamily: "var(--font-chat-mono)" }}
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
        "renderer-markdown prose prose-zinc dark:prose-invert max-w-none",
        "text-[15px] leading-[1.75] text-zinc-800 dark:text-zinc-200",
        "prose-headings:text-zinc-950 dark:prose-headings:text-zinc-50",
        "prose-a:font-medium prose-a:text-[#0A66E0] prose-a:no-underline hover:prose-a:underline dark:prose-a:text-[#6DB4FF]",
        "prose-img:rounded-lg",
        streaming && "renderer-markdown-streaming",
        className
      )}
      style={{ fontFamily: "var(--font-chat-sans)" }}
    >
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {preparedBody}
      </ReactMarkdown>
    </div>
  );
}
