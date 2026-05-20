"use client";

import { Download, ExternalLink, FileText } from "lucide-react";

import type { FileBlock } from "@/components/renderer/types";

import { assetHref, formatBytes } from "./asset-url";

export function FileBlockComponent({ data }: { data: FileBlock }) {
  const href = assetHref(data);
  const downloadHref = assetHref(data, { download: true });
  const filename = data.filename ?? data.title ?? "AI artifact";
  const meta = [formatBytes(data.sizeBytes), data.mimeType].filter(Boolean).join(" · ");

  return (
    <section
      className="rounded-lg border border-black/10 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-zinc-950"
      data-testid="render-block-file"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[rgba(0,122,255,0.10)] text-[#0A66E0] dark:bg-[rgba(0,122,255,0.16)] dark:text-[#6DB4FF]">
          <FileText size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-bold leading-5 text-zinc-950 dark:text-zinc-50">
            {data.title ?? filename}
          </h3>
          <p className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
            {filename}
          </p>
          {(data.description || meta) && (
            <p className="mt-1 text-[11.5px] leading-4 text-zinc-500 dark:text-zinc-400">
              {data.description ?? meta}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {href && (
            <a
              aria-label="Mở file"
              className="grid size-8 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/45 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              href={href}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={15} />
            </a>
          )}
          {downloadHref && (
            <a
              aria-label="Tải file"
              className="grid size-8 place-items-center rounded-md bg-[#007AFF] text-white transition hover:bg-[#0A66E0] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/45"
              download={filename}
              href={downloadHref}
            >
              <Download size={15} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
