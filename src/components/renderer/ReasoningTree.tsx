"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { RenderIcon } from "./icons";
import { stringifyValue, toneMeta } from "./tokens";
import type { ReasoningStep } from "./types";

export function ReasoningTree({ steps, totalMs }: { steps: ReasoningStep[]; totalMs?: number }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  const running = steps.find((step) => step.status === "running");
  const allDone = steps.every((step) => step.status === "done");

  return (
    <section className="rounded-lg border border-[rgba(0,122,255,0.18)] bg-[rgba(0,122,255,0.045)] dark:border-[rgba(109,180,255,0.22)] dark:bg-[rgba(0,122,255,0.10)]">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-[#007AFF]/45"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span
          className={cn(
            "grid size-[18px] place-items-center rounded-md",
            allDone
              ? "bg-[rgba(52,199,89,0.18)] text-[#1F8E47] dark:text-[#63DB82]"
              : "bg-[rgba(0,122,255,0.18)] text-[#0A66E0] dark:text-[#6DB4FF]",
          )}
        >
          <RenderIcon name={allDone ? "check" : "loader"} size={11} strokeWidth={allDone ? 3 : 2.4} />
        </span>
        <span className="min-w-0 flex-1 text-[12.5px] font-bold text-zinc-900 dark:text-zinc-100">
          {running ? (
            <>
              Đang chạy <code className="font-mono text-[#7B33B0] dark:text-[#D996F0]">{running.tool}</code>...
            </>
          ) : (
            <>
              AI đã thực hiện <strong>{steps.length} bước</strong>
            </>
          )}
        </span>
        {totalMs !== undefined && (
          <span className="font-mono text-[10.5px] text-zinc-400">{(totalMs / 1000).toFixed(2)}s</span>
        )}
        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          {open ? "Thu gọn" : "Mở rộng"}
          <RenderIcon name={open ? "chevronDown" : "chevronRight"} size={11} />
        </span>
      </button>

      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        {steps.map((step) => {
          const meta = toneMeta(step.status === "done" ? "good" : step.status === "error" ? "bad" : "info");
          return (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white py-1 pl-1.5 pr-2.5 text-[11.5px] dark:border-white/10 dark:bg-zinc-950"
              key={step.id}
            >
              <span className={cn("grid size-[14px] place-items-center rounded-full border", meta.border, meta.soft)}>
                {step.status === "done" && <RenderIcon className={meta.text} name="check" size={8} strokeWidth={3} />}
                {step.status === "running" && <span className="size-1.5 animate-pulse rounded-full bg-[#007AFF]" />}
                {step.status === "error" && <RenderIcon className={meta.text} name="x" size={8} strokeWidth={3} />}
              </span>
              <code className="font-mono text-[11px] font-bold text-[#7B33B0] dark:text-[#D996F0]">
                {step.tool}
              </code>
              {step.resultSummary && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className={cn("font-semibold", meta.text)}>{step.resultSummary}</span>
                </>
              )}
              {step.durationMs !== undefined && (
                <span className="font-mono text-[10.5px] text-zinc-400">{step.durationMs}ms</span>
              )}
            </span>
          );
        })}
      </div>

      {open && (
        <div className="border-t border-[rgba(0,122,255,0.18)] px-3 py-2 text-[11.5px] leading-6 text-zinc-600 dark:text-zinc-300">
          {steps.map((step) => (
            <div key={`${step.id}-detail`}>
              <code className="font-mono text-[#7B33B0] dark:text-[#D996F0]">{step.tool}</code>
              {step.input !== undefined && (
                <code className="ml-1 font-mono text-zinc-400">
                  ({stringifyValue(step.input).slice(0, 120)})
                </code>
              )}
              {step.error && <span className="ml-1 text-[#C8281D] dark:text-[#FF7C73]">- {step.error}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

