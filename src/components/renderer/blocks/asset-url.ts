"use client";

type LocalAsset = {
  url?: string;
  path?: string;
  dataUrl?: string;
  base64?: string;
  mimeType?: string;
};

function safeUrl(value: string): string | null {
  if (value.startsWith("/") || value.startsWith("#")) return value;

  try {
    const url = new URL(value);
    if (["http:", "https:", "blob:", "data:"].includes(url.protocol)) return value;
  } catch {
    return null;
  }

  return null;
}

export function assetHref(asset: LocalAsset, options: { download?: boolean } = {}): string | null {
  if (asset.dataUrl) return safeUrl(asset.dataUrl);
  if (asset.base64) {
    const mimeType = asset.mimeType ?? "application/octet-stream";
    return `data:${mimeType};base64,${asset.base64}`;
  }
  if (asset.url) return safeUrl(asset.url);
  if (!asset.path) return null;

  const params = new URLSearchParams({ path: asset.path });
  if (options.download) params.set("download", "1");
  return `/api/ai-artifacts?${params.toString()}`;
}

export function formatBytes(value?: number): string | undefined {
  if (value === undefined) return undefined;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
