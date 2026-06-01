"use client";

import dynamic from "next/dynamic";

import { ChartFrame } from "@/components/charts";
import type { MapViewBlock } from "@/components/renderer/types";

const LeafletMapView = dynamic(
  () => import("./LeafletMapView").then((module) => module.LeafletMapView),
  {
    loading: () => (
      <div className="mt-1 grid h-[260px] place-items-center rounded-md border border-black/[0.07] bg-zinc-50 text-[12px] font-semibold text-zinc-400 dark:border-white/10 dark:bg-white/[0.04]">
        Đang tải bản đồ...
      </div>
    ),
    ssr: false,
  }
);

export function MapViewBlockComponent({ data }: { data: MapViewBlock }) {
  return (
    <div data-testid="render-block-map_view">
      <ChartFrame subtitle={data.subtitle} title={data.title}>
        <LeafletMapView data={data} />
      </ChartFrame>
    </div>
  );
}
