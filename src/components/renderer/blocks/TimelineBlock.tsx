"use client";

import { cn } from "@/lib/utils";
import { RenderIcon } from "@/components/renderer/icons";
import { toneMeta } from "@/components/renderer/tokens";
import type { TimelineBlock } from "@/components/renderer/types";

export function TimelineBlockComponent({ data }: { data: TimelineBlock }) {
  return (
    <section className="space-y-2 px-0.5 py-1" data-testid="render-block-timeline">
      {data.events.map((event, index) => {
        const meta = toneMeta(event.tone);
        return (
          <div className="grid grid-cols-[58px_16px_1fr] gap-2.5" key={`${event.time}-${event.title}`}>
            <time className="pt-1 font-mono text-[11px] text-zinc-400">{event.time}</time>
            <div className="relative pt-1.5">
              <span className={cn("block size-2.5 rounded-full border-2 border-white dark:border-zinc-950", meta.solid)} />
              {index < data.events.length - 1 && (
                <span className="absolute left-[4px] top-5 h-[calc(100%+10px)] w-px bg-black/10 dark:bg-white/10" />
              )}
            </div>
            <div className="min-w-0 pb-1">
              <div className="flex items-center gap-1.5">
                {event.icon && <RenderIcon className={meta.text} name={event.icon} size={13} />}
                <h3 className="truncate text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
                  {event.title}
                </h3>
              </div>
              {event.description && (
                <p className="mt-0.5 text-[12px] leading-5 text-zinc-500 dark:text-zinc-400">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

