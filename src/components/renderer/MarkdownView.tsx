"use client";

import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

function extractCodeChildren(children: ReactNode): ReactNode {
  if (Array.isArray(children)) return children.map((child) => extractCodeChildren(child));
  if (isValidElement<{ children?: ReactNode }>(children)) return children.props.children ?? null;
  return children;
}

const markdownComponents = {
  table({ children }) {
    return (
      <div className="my-3 w-full overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-950">
        <table className="w-full min-w-max border-collapse text-left text-[12.5px] leading-5">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-zinc-50 text-zinc-950 dark:bg-white/[0.06] dark:text-zinc-100">{children}</thead>;
  },
  th({ children }) {
    return (
      <th className="whitespace-nowrap border-b border-black/10 px-3 py-2 align-bottom font-bold dark:border-white/10">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="whitespace-nowrap border-b border-black/[0.06] px-3 py-2 align-top last:border-b-0 dark:border-white/[0.08]">
        {children}
      </td>
    );
  },
  pre({ children }) {
    return (
      <pre className="my-3 max-w-full overflow-x-auto rounded-xl border border-black/10 bg-zinc-950 p-3 text-[12px] leading-5 text-zinc-50 dark:border-white/10">
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
            : "rounded bg-zinc-100 px-1.5 py-0.5 text-[0.92em] font-medium text-zinc-800 dark:bg-white/10 dark:text-zinc-100",
        )}
      >
        {children}
      </code>
    );
  },
} satisfies Components;

export function MarkdownView({ body, className }: { body: string; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-none overflow-hidden text-[14.5px] leading-7 text-zinc-800 dark:text-zinc-200 [&_a]:text-[#0A66E0] [&_a]:no-underline dark:[&_a]:text-[#6DB4FF] [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-zinc-950 dark:[&_h1]:text-zinc-50 [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-zinc-950 dark:[&_h2]:text-zinc-50 [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-[14.5px] [&_h3]:font-bold [&_h3]:text-zinc-950 dark:[&_h3]:text-zinc-50 [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:pl-5 [&_p]:my-0 [&_p+p]:mt-2.5 [&_strong]:text-zinc-950 dark:[&_strong]:text-zinc-50 [&_ul]:my-1 [&_ul]:pl-5",
        className,
      )}
    >
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
