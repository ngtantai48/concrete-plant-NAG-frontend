"use client";

import React from "react";

export interface ToolProcessTreeProps {
  steps: string[];
  isActive?: boolean;
}

export default function ToolProcessTree({ steps, isActive }: ToolProcessTreeProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <div style={{ fontSize: 12.5 }}>
      <div className="space-y-0">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const isRunning = isLast && isActive;
          const label = step.replace(/^Bước\s+\d+\/\d+:\s*/i, "");
          const ringColor = isRunning ? "#FFCC00" : "#007AFF";
          const fillColor = isRunning ? "rgba(255,204,0,0.18)" : "rgba(0,122,255,0.15)";
          const dotColor = isRunning ? "#FFCC00" : "#007AFF";

          return (
            <div key={idx} className="relative pl-5 py-[3px]">
              {idx < steps.length - 1 && (
                <div
                  className="absolute"
                  style={{
                    left: 6,
                    top: 14,
                    bottom: 0,
                    width: 1,
                    background: "rgba(60,60,67,0.18)",
                  }}
                />
              )}
              <div
                className="absolute flex items-center justify-center"
                style={{
                  left: 0,
                  top: 5,
                  width: 13,
                  height: 13,
                  borderRadius: 999,
                  border: `1.5px solid ${ringColor}`,
                  background: fillColor,
                }}
              >
                <div
                  className={isRunning ? "animate-pulse" : ""}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 999,
                    background: dotColor,
                  }}
                />
              </div>
              <div className="flex items-center min-h-[20px]">
                <span style={{ color: "#1C1C1E", letterSpacing: -0.1 }}>{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
