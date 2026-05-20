"use client";

import { Sparkles } from "lucide-react";

import type { ActionProposalBlock } from "@/components/renderer/types";

export function ActionProposalBlockComponent({ data }: { data: ActionProposalBlock }) {
  return (
    <section
      className="rounded-lg border border-dashed border-[#007AFF] bg-white p-3.5 shadow-[0_1px_2px_rgba(0,122,255,0.08)] dark:bg-zinc-950"
      data-testid="render-block-action_proposal"
    >
      <div className="flex items-start gap-2.5">
        <div className="grid size-7 shrink-0 place-items-center rounded-md bg-[rgba(0,122,255,0.12)] text-[#0A66E0] dark:text-[#6DB4FF]">
          <Sparkles size={15} strokeWidth={2.4} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-[#0A66E0] dark:text-[#6DB4FF]">
            Đề xuất hành động
          </div>
          <h3 className="mt-0.5 text-[13.5px] font-bold leading-5 text-zinc-950 dark:text-zinc-50">
            {data.summary}
          </h3>
        </div>
      </div>
      {data.details && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-zinc-50 px-2.5 py-2 text-[12px] dark:bg-white/[0.06]">
          {data.details.map((detail) => (
            <div className="contents" key={`${detail.label}-${detail.value}`}>
              <dt className="text-zinc-500 dark:text-zinc-400">{detail.label}</dt>
              <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          className="rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-zinc-600 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/45 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("render:action", { detail: { intent: "cancel", id: data.id } }),
            );
          }}
          type="button"
        >
          {data.cancelLabel ?? "Hủy"}
        </button>
        <button
          className="rounded-md bg-[linear-gradient(180deg,#2C99FF_0%,#007AFF_100%)] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-[0_1px_3px_rgba(0,122,255,0.30)] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/45"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("render:action", {
                detail: { intent: data.intent, payload: data.payload, id: data.id },
              }),
            );
          }}
          type="button"
        >
          {data.confirmLabel ?? "Xác nhận"} →
        </button>
      </div>
    </section>
  );
}

