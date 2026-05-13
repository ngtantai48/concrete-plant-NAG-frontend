"use client";

import React, { useEffect, useRef, useState } from "react";
import { ResponsiveContainer } from "recharts";

type SafeResponsiveChartProps = {
  className?: string;
  minHeight?: number;
  children: React.ReactNode;
};

export default function SafeResponsiveChart({
  className,
  minHeight = 120,
  children,
}: SafeResponsiveChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = (width: number, height: number) => {
      setSize({
        width: Math.max(0, width),
        height: Math.max(0, height),
      });
    };

    updateSize(node.clientWidth, node.clientHeight);

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={className} style={{ minWidth: 0, minHeight }}>
      {size.width > 0 && size.height > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
