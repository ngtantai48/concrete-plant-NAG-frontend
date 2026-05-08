"use client";

import { cn } from "@/lib/utils";
import { RenderIcon } from "@/components/renderer/icons";
import { MarkdownView } from "@/components/renderer/MarkdownView";
import { toneMeta } from "@/components/renderer/tokens";
import type { AlertBlock } from "@/components/renderer/types";

export function AlertBlockComponent({ data }: { data: AlertBlock }) {
  const meta = toneMeta(data.level);
  const icon = data.level === "info" ? "info" : "alert";

  return (
    <section
      className={cn("flex gap-2.5 rounded-lg border p-3", meta.soft, meta.border)}
      data-testid="render-block-alert"
      role="status"
    >
      <div className="grid size-7 shrink-0 place-items-center rounded-md bg-white/65 dark:bg-white/10">
        <RenderIcon className={meta.text} name={icon} size={15} strokeWidth={2.3} />
      </div>
      <div className="min-w-0 flex-1 text-[13px] leading-6 text-zinc-800 dark:text-zinc-200">
        <h3 className={cn("font-bold", meta.text)}>{data.title}</h3>
        {data.body && <MarkdownView body={data.body} className="mt-1 text-[13px] leading-6" />}
        {data.items && (
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {data.items.map((item) => (
              <li key={item}>
                <MarkdownView body={item} className="text-[13px] leading-6 [&_p]:inline" />
              </li>
            ))}
          </ul>
        )}
      </div>
      {data.action && (
        <button
          aria-label={data.action.label}
          className={cn(
            "self-center rounded-md px-3 py-1.5 text-[12px] font-bold transition focus:outline-none focus:ring-2 focus:ring-[#007AFF]/45",
            meta.solid,
          )}
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("render:action", {
                detail: { intent: data.action?.intent, payload: data.action?.payload },
              }),
            );
          }}
          type="button"
        >
          {data.action.label} →
        </button>
      )}
    </section>
  );
}

