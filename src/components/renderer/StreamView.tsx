"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { RenderBlock } from "./RenderBlock";
import { MarkdownView } from "./MarkdownView";
import { BlockSkeleton } from "./blocks/UnknownBlock";
import { parseStream } from "./parseStream";

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}

function useSmoothStreamText(targetText: string, streaming: boolean): string {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [visibleText, setVisibleText] = useState(targetText);
  const visibleRef = useRef(targetText);
  const targetRef = useRef(targetText);

  useEffect(() => {
    targetRef.current = targetText;

    if (!streaming || prefersReducedMotion) {
      visibleRef.current = targetText;
      setVisibleText(targetText);
      return undefined;
    }

    if (!targetText.startsWith(visibleRef.current)) {
      visibleRef.current = targetText;
      setVisibleText(targetText);
      return undefined;
    }

    let cancelled = false;
    let timer: number | undefined;

    const tick = () => {
      if (cancelled) return;

      const current = visibleRef.current;
      const target = targetRef.current;
      if (current === target) return;

      if (!target.startsWith(current)) {
        visibleRef.current = target;
        setVisibleText(target);
        return;
      }

      const lag = target.length - current.length;
      const step = lag > 1800 ? 220 : lag > 700 ? 96 : lag > 220 ? 42 : 14;
      const next = target.slice(0, current.length + step);
      visibleRef.current = next;
      setVisibleText(next);
      timer = window.setTimeout(tick, lag > 700 ? 8 : 18);
    };

    timer = window.setTimeout(tick, 8);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [prefersReducedMotion, streaming, targetText]);

  return visibleText;
}

export function StreamView({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const visibleText = useSmoothStreamText(text || "", streaming);
  const chunks = useMemo(
    () => parseStream(visibleText, { showPendingLoading: streaming }),
    [streaming, visibleText]
  );

  return (
    <div aria-live="polite" className="flex flex-col gap-2.5">
      {chunks.map((chunk, index) => {
        if (chunk.kind === "md") {
          return <MarkdownView body={chunk.body} key={`md-${index}`} streaming={streaming} />;
        }
        if (chunk.kind === "block") {
          const data = chunk.data as { id?: unknown } | null | undefined;
          const blockId = typeof data?.id === "string" ? data.id : undefined;
          return (
            <div
              className="animate-[fade-up_0.28s_cubic-bezier(0.16,1,0.3,1)_both] scroll-mt-24 transition-shadow duration-300"
              data-block-id={blockId}
              id={blockId ? `pinned-block-${blockId}` : undefined}
              key={`block-${index}`}
            >
              <RenderBlock data={chunk.data} />
            </div>
          );
        }
        return <BlockSkeleton key={`loading-${index}`} />;
      })}
      {streaming && (
        <div className="inline-flex items-center gap-2 text-[12px] italic text-zinc-400">
          <span className="renderer-stream-caret h-3.5 w-1.5 rounded-full bg-[#007AFF]" />
          <span>đang gõ...</span>
        </div>
      )}
    </div>
  );
}
