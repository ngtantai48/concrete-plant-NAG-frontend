"use client";

import { BarChart3 } from "lucide-react";

import { ChartFrame } from "@/components/charts";
import type { ChartBlock } from "@/components/renderer/types";

import { assetHref, formatBytes } from "./asset-url";

// Generic chart renderer — backend pre-renders chart thành PNG/SVG (S3 hoặc local
// artifact) rồi gửi `{type:"chart", url, title}`. FE chỉ việc hiển thị ảnh trong
// ChartFrame. Tránh phải đồng bộ schema chi tiết cho từng kiểu chart (line/bar/donut).
export function ChartBlockComponent({ data }: { data: ChartBlock }) {
  const src = assetHref(data);
  const alt = data.alt ?? data.title ?? data.filename ?? "AI generated chart";
  const meta = [data.filename, formatBytes(data.sizeBytes), data.mimeType]
    .filter(Boolean)
    .join(" · ");

  return (
    <div data-testid="render-block-chart">
      <ChartFrame subtitle={data.subtitle ?? meta} title={data.title}>
        {src ? (
          <figure className="space-y-2">
            <img
              alt={alt}
              className="max-h-[480px] w-full rounded-md border border-black/10 object-contain dark:border-white/10"
              height={data.height}
              src={src}
              width={data.width}
            />
            {data.caption && (
              <figcaption className="text-[11.5px] leading-4 text-zinc-500 dark:text-zinc-400">
                {data.caption}
              </figcaption>
            )}
          </figure>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-black/15 p-3 text-[12px] text-zinc-500 dark:border-white/15 dark:text-zinc-400">
            <BarChart3 size={15} />
            Không tìm thấy nguồn biểu đồ.
          </div>
        )}
      </ChartFrame>
    </div>
  );
}
