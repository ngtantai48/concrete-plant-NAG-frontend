"use client";

import { MarkdownView } from "@/components/renderer/MarkdownView";
import type { MarkdownBlock } from "@/components/renderer/types";

export function MarkdownBlockComponent({ data }: { data: MarkdownBlock }) {
  return (
    <div data-testid="render-block-markdown">
      <MarkdownView body={data.body} />
    </div>
  );
}

