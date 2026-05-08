"use client";

import type { SourceChipsBlock } from "@/components/renderer/types";

export function SourceChipsBlockComponent({ data }: { data: SourceChipsBlock }) {
  return (
    <section data-testid="render-block-source_chips">
      <h3 className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-zinc-400">
        Nguồn dữ liệu ({data.items.length})
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {data.items.map((item, index) => (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white py-1 pl-1 pr-2.5 text-[11.5px] shadow-[0_1px_1px_rgba(15,23,42,0.03)] dark:border-white/10 dark:bg-zinc-950"
            key={`${item.tool}-${item.id}-${index}`}
          >
            <span className="grid size-[18px] place-items-center rounded bg-[rgba(0,122,255,0.12)] font-mono text-[10px] font-bold text-[#0A66E0] dark:text-[#6DB4FF]">
              {item.id}
            </span>
            <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
              {item.tool || item.label}
            </span>
            {item.count !== undefined && (
              <span className="font-mono text-[10.5px] text-zinc-400">{item.count}</span>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}

