"use client";

import { ChartFrame } from "@/components/charts";
import { colorToHex, toneMeta } from "@/components/renderer/tokens";
import type { MapViewBlock } from "@/components/renderer/types";

function markerPosition(index: number, lat: number, lng: number, center: MapViewBlock["center"]) {
  const x = 50 + (lng - center.lng) * 220 + ((index * 13) % 18) - 9;
  const y = 50 - (lat - center.lat) * 220 + ((index * 17) % 16) - 8;
  return {
    x: Math.max(8, Math.min(92, x)),
    y: Math.max(12, Math.min(88, y)),
  };
}

export function MapViewBlockComponent({ data }: { data: MapViewBlock }) {
  return (
    <div data-testid="render-block-map_view">
      <ChartFrame subtitle={data.subtitle} title={data.title}>
        <div className="relative mt-1 h-[220px] overflow-hidden rounded-lg border border-black/[0.07] bg-[linear-gradient(135deg,#E8EEF6,#DEE6F1)] dark:border-white/10 dark:bg-[linear-gradient(135deg,#172033,#111827)]">
          <svg
            aria-label="Map view"
            className="absolute inset-0 size-full"
            preserveAspectRatio="none"
            role="img"
            viewBox="0 0 400 220"
          >
            <path d="M 0 140 Q 120 100 220 120 T 400 100" fill="none" opacity="0.9" stroke="white" strokeWidth="14" />
            <path d="M 50 200 Q 150 160 250 180 T 400 160" fill="none" opacity="0.7" stroke="white" strokeWidth="8" />
            <path d="M 20 58 Q 150 30 250 76 T 400 52" fill="none" opacity="0.42" stroke="#9DC0E0" strokeWidth="18" />
            {data.routes?.map((route) => (
              <polyline
                fill="none"
                key={route.id}
                points={route.points
                  .map(([lat, lng], index) => {
                    const pos = markerPosition(index, lat, lng, data.center);
                    return `${pos.x * 4},${pos.y * 2.2}`;
                  })
                  .join(" ")}
                stroke={colorToHex(route.color ?? "blue")}
                strokeDasharray="6 5"
                strokeWidth="2"
              />
            ))}
          </svg>
          {data.markers.map((marker, index) => {
            const pos = markerPosition(index, marker.lat, marker.lng, data.center);
            const tone = toneMeta(marker.tone ?? (marker.kind === "alert" ? "amber" : marker.kind === "vehicle" ? "green" : "blue"));
            return (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2"
                key={marker.id}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <span className="relative flex size-5 items-center justify-center">
                  <span className={`${tone.soft} absolute inset-0 rounded-full`} />
                  <span className="relative size-2.5 rounded-full border border-white" style={{ backgroundColor: tone.hex }} />
                </span>
                {marker.label && (
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-zinc-700 shadow-sm dark:bg-zinc-950/95 dark:text-zinc-200">
                    {marker.label}
                  </span>
                )}
              </div>
            );
          })}
          <div className="absolute bottom-2 right-2 rounded-md bg-white/95 px-2 py-1 font-mono text-[10.5px] text-zinc-500 shadow-sm dark:bg-zinc-950/95 dark:text-zinc-400">
            {data.markers.length} marker · z{data.zoom ?? 12}
          </div>
        </div>
      </ChartFrame>
    </div>
  );
}

