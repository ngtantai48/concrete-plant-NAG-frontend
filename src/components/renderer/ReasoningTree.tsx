"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";
import { RenderIcon } from "./icons";
import { stringifyValue, toneMeta } from "./tokens";
import type { ReasoningStep } from "./types";

function getStepLabel(step: ReasoningStep) {
  const summary = step.resultSummary?.trim();
  if (summary) return summary;
  if (step.status === "running") return "Đang xử lý";
  if (step.status === "error") return "Có lỗi khi xử lý";
  return "Đã hoàn tất";
}

function shouldShowInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input !== undefined;
  const keys = Object.keys(input);
  if (keys.length === 0) return false;
  if (keys.length === 1 && (keys[0] === "status" || keys[0] === "tool")) return false;

  if ("args" in input) {
    const args = (input as { args?: unknown }).args;
    return (
      !!args && typeof args === "object" && !Array.isArray(args) && Object.keys(args).length > 0
    );
  }

  return true;
}

export function ReasoningTree({ steps, totalMs }: { steps: ReasoningStep[]; totalMs?: number }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  if (steps.length === 0) return null;

  const running = steps.some((step) => step.status === "running");
  const allDone = steps.every((step) => step.status === "done");
  const errored = steps.some((step) => step.status === "error");
  const completedSteps = steps.filter((step) => step.status === "done").length;
  const stepCount = running ? Math.max(completedSteps, steps.length) : steps.length;

  return (
    <section className="rounded-md border border-[rgba(0,122,255,0.18)] bg-[rgba(0,122,255,0.045)] dark:border-[rgba(109,180,255,0.22)] dark:bg-[rgba(0,122,255,0.10)]">
      <button
        aria-controls={detailsId}
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
              : errored
                ? "bg-[rgba(255,59,48,0.14)] text-[#C8281D] dark:text-[#FF7C73]"
                : "bg-[rgba(0,122,255,0.18)] text-[#0A66E0] dark:text-[#6DB4FF]",
          )}
        >
          <RenderIcon
            className={running ? "animate-spin" : undefined}
            name={allDone ? "check" : running ? "loader" : errored ? "alert" : "info"}
            size={11}
            strokeWidth={allDone ? 3 : 2.4}
          />
        </span>
        <span className="min-w-0 flex-1 text-[12.5px] font-bold text-zinc-900 dark:text-zinc-100">
          AI đã thực hiện <strong>{stepCount} bước</strong>
          {running && <span className="ml-1 text-zinc-500 dark:text-zinc-400">· đang xử lý</span>}
        </span>
        {totalMs !== undefined && (
          <span className="font-mono text-[10.5px] text-zinc-400">
            {(totalMs / 1000).toFixed(2)}s
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          {open ? "Thu gọn" : "Chi tiết"}
          <RenderIcon name={open ? "chevronDown" : "chevronRight"} size={11} />
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3" id={detailsId}>
          <div className="relative space-y-1 pl-1">
            {steps.length > 1 && (
              <span className="absolute bottom-3 left-[12px] top-3 w-px bg-[rgba(0,122,255,0.20)] dark:bg-[rgba(109,180,255,0.22)]" />
            )}
            {steps.map((step) => {
              const meta = toneMeta(
                step.status === "done" ? "good" : step.status === "error" ? "bad" : "info",
              );
              const label = getStepLabel(step);
              return (
                <div className="relative flex items-start gap-2 py-1" key={step.id}>
                  <span
                    className={cn(
                      "z-10 mt-0.5 grid size-[17px] shrink-0 place-items-center rounded-full border-2 bg-white dark:bg-zinc-950",
                      meta.border,
                    )}
                  >
                    {step.status === "done" && (
                      <RenderIcon className={meta.text} name="check" size={8} strokeWidth={3} />
                    )}
                    {step.status === "running" && (
                      <span className="size-1.5 animate-pulse rounded-full bg-[#007AFF]" />
                    )}
                    {step.status === "error" && (
                      <RenderIcon className={meta.text} name="x" size={8} strokeWidth={3} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 rounded-md border border-black/[0.07] bg-white px-2.5 py-1.5 text-[11.5px] shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-white/10 dark:bg-zinc-950">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-semibold text-zinc-800 dark:text-zinc-100">
                        {label}
                      </span>
                      {step.durationMs !== undefined && (
                        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-zinc-400">
                          {step.durationMs}ms
                        </span>
                      )}
                    </div>
                    {shouldShowInput(step.input) && (
                      <code className="mt-1 block truncate font-mono text-[10.5px] text-zinc-400">
                        {stringifyValue(step.input).slice(0, 120)}
                      </code>
                    )}
                    {step.error && (
                      <div className="mt-1 text-[#C8281D] dark:text-[#FF7C73]">{step.error}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
