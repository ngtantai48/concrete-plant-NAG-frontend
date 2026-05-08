"use client";

import { RenderBlock } from "./RenderBlock";
import { MarkdownView } from "./MarkdownView";
import { BlockSkeleton } from "./blocks/UnknownBlock";
import { parseStream } from "./parseStream";

export function StreamView({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const chunks = parseStream(text || "");

  return (
    <div aria-live="polite" className="flex flex-col gap-3">
      {chunks.map((chunk, index) => {
        if (chunk.kind === "md") {
          return <MarkdownView body={chunk.body} key={`md-${index}`} />;
        }
        if (chunk.kind === "block") {
          return (
            <div className="animate-[fade-up_0.28s_cubic-bezier(0.16,1,0.3,1)_both]" key={`block-${index}`}>
              <RenderBlock data={chunk.data} />
            </div>
          );
        }
        return <BlockSkeleton key={`loading-${index}`} />;
      })}
      {streaming && (
        <div className="inline-flex items-center gap-2 text-[12px] italic text-zinc-400">
          <span className="h-3.5 w-1.5 animate-pulse rounded-full bg-[#007AFF]" />
          <span>đang gõ...</span>
        </div>
      )}
    </div>
  );
}

