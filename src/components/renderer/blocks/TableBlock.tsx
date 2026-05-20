"use client";

import { ChartFrame } from "@/components/charts";
import { cn } from "@/lib/utils";
import { stringifyValue } from "@/components/renderer/tokens";
import type { TableBlock } from "@/components/renderer/types";

function formatCell(value: unknown, format?: TableBlock["columns"][number]["format"]) {
  if (value === null || value === undefined) return "—";
  if (format === "number") return Number(value).toLocaleString("vi-VN");
  if (format === "currency") return `${Number(value).toLocaleString("vi-VN")}₫`;
  if (format === "percent") return `${(Number(value) * 100).toFixed(1)}%`;
  if (format === "date" || format === "datetime") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return stringifyValue(value);
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: format === "datetime" ? "short" : undefined,
    }).format(date);
  }
  return stringifyValue(value);
}

function shouldHighlight(row: Record<string, unknown>, rule: TableBlock["highlightRowWhere"]) {
  if (!rule) return false;
  const left = row[rule.key];
  if (typeof left === "number" && typeof rule.value === "number") {
    if (rule.op === ">") return left > rule.value;
    if (rule.op === "<") return left < rule.value;
  }
  if (rule.op === "=") return left === rule.value;
  if (rule.op === "!=") return left !== rule.value;
  return false;
}

export function TableBlockComponent({ data }: { data: TableBlock }) {
  const rows = data.pageSize ? data.rows.slice(0, data.pageSize) : data.rows;
  return (
    <div data-testid="render-block-table">
      <ChartFrame subtitle={data.subtitle} title={data.title}>
        <div className="max-h-[280px] overflow-auto rounded-md border border-black/[0.07] dark:border-white/10">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-zinc-50 dark:bg-white/[0.06]">
                {data.columns.map((column) => (
                  <th
                    className={cn(
                      "border-b border-black/[0.07] px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-zinc-500 dark:border-white/10 dark:text-zinc-400",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      (!column.align || column.align === "left") && "text-left",
                    )}
                    key={column.key}
                    scope="col"
                    style={{ width: column.width }}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const highlighted = shouldHighlight(row, data.highlightRowWhere);
                return (
                  <tr
                    className={cn(
                      "border-b border-black/[0.06] last:border-b-0 dark:border-white/[0.08]",
                      highlighted && "bg-[rgba(255,159,10,0.08)] dark:bg-[rgba(255,159,10,0.14)]",
                    )}
                    key={rowIndex}
                  >
                    {data.columns.map((column) => (
                      <td
                        className={cn(
                          "px-2.5 py-2 text-zinc-800 dark:text-zinc-200",
                          column.align === "right" && "text-right",
                          column.align === "center" && "text-center",
                          (!column.align || column.align === "left") && "text-left",
                          ["number", "currency", "percent"].includes(column.format ?? "") && "font-mono tabular-nums",
                        )}
                        key={column.key}
                      >
                        {column.format === "badge" ? (
                          <span className="inline-flex rounded-full bg-[rgba(0,122,255,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[#0A66E0] dark:bg-[rgba(0,122,255,0.18)] dark:text-[#6DB4FF]">
                            {formatCell(row[column.key], column.format)}
                          </span>
                        ) : (
                          formatCell(row[column.key], column.format)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartFrame>
    </div>
  );
}

