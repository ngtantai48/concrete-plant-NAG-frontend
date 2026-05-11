"use client";

import { AlertTriangle } from "lucide-react";
import type { ZodError } from "zod";

import { isRecord, stringifyValue } from "@/components/renderer/tokens";

export function UnknownBlock({ data, error }: { data: unknown; error?: ZodError }) {
  const type = isRecord(data) && typeof data.type === "string" ? data.type : "unknown";
  const reason = error?.issues[0]?.message ?? "Render block khong khop schema da khai bao.";

  return (
    <div
      className="rounded-lg border border-[rgba(255,159,10,0.32)] bg-[rgba(255,159,10,0.10)] p-3 text-[12px] text-[#B86E00] dark:border-[rgba(255,196,93,0.34)] dark:bg-[rgba(255,159,10,0.16)] dark:text-[#FFC45D]"
      data-testid={`render-block-${type}`}
      role="alert"
    >
      <div className="flex items-center gap-2 font-bold">
        <AlertTriangle size={14} />
        Unknown render block: <code className="font-mono">{type}</code>
      </div>
      <p className="mt-1 leading-5">{reason}</p>
      <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-white/55 p-2 font-mono text-[10.5px] text-zinc-700 dark:bg-black/20 dark:text-zinc-200">
        {stringifyValue(data)}
      </pre>
    </div>
  );
}

export function BlockSkeleton() {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-black/10 bg-white p-4 shadow-[0_10px_28px_-22px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-zinc-950"
      data-testid="render-block-loading"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(0,122,255,0.10)_42%,transparent_70%)] blur-xl" />
      <div className="relative mb-3 flex items-center gap-2 text-[12.5px] font-bold text-[#0A66E0] dark:text-[#6DB4FF]">
        <span className="size-3 animate-spin rounded-full border-2 border-[#007AFF]/25 border-t-[#007AFF]" />
        Đang render...
      </div>
      <div className="relative rounded-lg border border-black/[0.06] bg-zinc-50/85 p-3 blur-[0.6px] dark:border-white/[0.08] dark:bg-white/[0.04]">
        <div className="mb-3 flex items-end gap-2">
          <div className="h-2 w-20 rounded bg-zinc-300/80 dark:bg-white/20" />
          <div className="h-2 w-12 rounded bg-zinc-200 dark:bg-white/10" />
        </div>
        <div className="flex h-24 items-end gap-2">
          {[52, 78, 42, 88, 64, 72, 48].map((height, index) => (
            <div
              className="flex-1 rounded-t-md bg-[linear-gradient(180deg,rgba(0,122,255,0.26),rgba(0,122,255,0.08))]"
              key={index}
              style={{ height }}
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <div className="h-2 rounded bg-zinc-200 dark:bg-white/10" />
          <div className="h-2 rounded bg-zinc-200 dark:bg-white/10" />
          <div className="h-2 rounded bg-zinc-200 dark:bg-white/10" />
          <div className="h-2 rounded bg-zinc-200 dark:bg-white/10" />
        </div>
      </div>
    </div>
  );
}
