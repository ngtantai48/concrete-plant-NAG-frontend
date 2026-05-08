"use client";

import type { FollowupsBlock } from "@/components/renderer/types";

export function FollowupsBlockComponent({ data }: { data: FollowupsBlock }) {
  return (
    <section data-testid="render-block-followups">
      <h3 className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-zinc-400">
        Hỏi tiếp
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {data.items.map((item) => (
          <button
            className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#0A66E0] transition hover:bg-[rgba(0,122,255,0.06)] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/45 dark:border-white/10 dark:bg-zinc-950 dark:text-[#6DB4FF] dark:hover:bg-white/10"
            key={item}
            onClick={() => {
              window.dispatchEvent(new CustomEvent("render:followup", { detail: { text: item } }));
            }}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

