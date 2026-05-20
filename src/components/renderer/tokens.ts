import type { RenderTone } from "./types";

export const renderPalette = {
  blue: "#007AFF",
  blueDeep: "#0A66E0",
  green: "#34C759",
  greenDeep: "#1F8E47",
  amber: "#FF9F0A",
  amberDeep: "#B86E00",
  red: "#FF453A",
  redDeep: "#C8281D",
  purple: "#AF52DE",
  purpleDeep: "#7B33B0",
  neutral: "#8E8E93",
  ink: "#1C1C1E",
  ink2: "#3A3A3C",
  ink3: "#636366",
} as const;

export type ColorToken = keyof typeof renderPalette;

type ToneMeta = {
  hex: string;
  deepHex: string;
  text: string;
  soft: string;
  border: string;
  solid: string;
  rail: string;
};

const tones: Record<RenderTone, ToneMeta> = {
  blue: {
    hex: renderPalette.blue,
    deepHex: renderPalette.blueDeep,
    text: "text-[#0A66E0] dark:text-[#6DB4FF]",
    soft: "bg-[rgba(0,122,255,0.10)] dark:bg-[rgba(0,122,255,0.16)]",
    border: "border-[rgba(0,122,255,0.28)] dark:border-[rgba(109,180,255,0.32)]",
    solid: "bg-[#007AFF] text-white",
    rail: "bg-[rgba(0,122,255,0.08)] dark:bg-[rgba(0,122,255,0.18)]",
  },
  green: {
    hex: renderPalette.green,
    deepHex: renderPalette.greenDeep,
    text: "text-[#1F8E47] dark:text-[#63DB82]",
    soft: "bg-[rgba(52,199,89,0.11)] dark:bg-[rgba(52,199,89,0.17)]",
    border: "border-[rgba(52,199,89,0.30)] dark:border-[rgba(99,219,130,0.32)]",
    solid: "bg-[#34C759] text-white",
    rail: "bg-[rgba(52,199,89,0.08)] dark:bg-[rgba(52,199,89,0.18)]",
  },
  amber: {
    hex: renderPalette.amber,
    deepHex: renderPalette.amberDeep,
    text: "text-[#B86E00] dark:text-[#FFC45D]",
    soft: "bg-[rgba(255,159,10,0.12)] dark:bg-[rgba(255,159,10,0.18)]",
    border: "border-[rgba(255,159,10,0.32)] dark:border-[rgba(255,196,93,0.34)]",
    solid: "bg-[#FF9F0A] text-[#1C1C1E]",
    rail: "bg-[rgba(255,159,10,0.08)] dark:bg-[rgba(255,159,10,0.18)]",
  },
  red: {
    hex: renderPalette.red,
    deepHex: renderPalette.redDeep,
    text: "text-[#C8281D] dark:text-[#FF7C73]",
    soft: "bg-[rgba(255,69,58,0.10)] dark:bg-[rgba(255,69,58,0.17)]",
    border: "border-[rgba(255,69,58,0.30)] dark:border-[rgba(255,124,115,0.34)]",
    solid: "bg-[#FF453A] text-white",
    rail: "bg-[rgba(255,69,58,0.08)] dark:bg-[rgba(255,69,58,0.18)]",
  },
  purple: {
    hex: renderPalette.purple,
    deepHex: renderPalette.purpleDeep,
    text: "text-[#7B33B0] dark:text-[#D996F0]",
    soft: "bg-[rgba(175,82,222,0.11)] dark:bg-[rgba(175,82,222,0.18)]",
    border: "border-[rgba(175,82,222,0.30)] dark:border-[rgba(217,150,240,0.34)]",
    solid: "bg-[#AF52DE] text-white",
    rail: "bg-[rgba(175,82,222,0.08)] dark:bg-[rgba(175,82,222,0.18)]",
  },
  neutral: {
    hex: renderPalette.neutral,
    deepHex: renderPalette.ink2,
    text: "text-[#3A3A3C] dark:text-[#D8D8DE]",
    soft: "bg-[rgba(60,60,67,0.07)] dark:bg-[rgba(255,255,255,0.08)]",
    border: "border-[rgba(60,60,67,0.16)] dark:border-[rgba(255,255,255,0.13)]",
    solid: "bg-[#3A3A3C] text-white",
    rail: "bg-[rgba(60,60,67,0.05)] dark:bg-[rgba(255,255,255,0.07)]",
  },
  good: {} as ToneMeta,
  warn: {} as ToneMeta,
  bad: {} as ToneMeta,
  info: {} as ToneMeta,
};

tones.good = tones.green;
tones.warn = tones.amber;
tones.bad = tones.red;
tones.info = tones.blue;

export function toneMeta(tone?: string): ToneMeta {
  if (!tone) return tones.blue;
  return tones[tone as RenderTone] ?? tones.blue;
}

export function colorToHex(color?: string): string {
  if (!color) return renderPalette.blue;
  if (color.startsWith("#")) return color;
  return renderPalette[color as ColorToken] ?? toneMeta(color).hex;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

