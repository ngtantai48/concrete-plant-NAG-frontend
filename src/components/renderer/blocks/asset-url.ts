"use client";

type LocalAsset = {
  url?: string;
  path?: string;
  dataUrl?: string;
  base64?: string;
  mimeType?: string;
};

// Backend đôi khi trả URL absolute kèm domain frontend (vd https://nguyenanhdonghoi.com/static/nag/artifacts/xxx.png)
// — tức là backend dùng request.base_url để build URL. Domain này KHÔNG host file artifact,
// chỉ backend `chat.svnagentic.site` mới có. Rewrite về relative path để Next.js proxy
// `src/app/static/nag/artifacts/[...path]/route.ts` forward đúng upstream.
function normalizeArtifactUrl(value: string): string {
  try {
    const url = new URL(value, "https://placeholder.invalid/");
    if (url.pathname.startsWith("/static/nag/artifacts/")) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    /* noop */
  }
  return value;
}

function safeUrl(value: string): string | null {
  const normalized = normalizeArtifactUrl(value);
  if (normalized.startsWith("/") || normalized.startsWith("#")) return normalized;

  try {
    const url = new URL(normalized);
    if (["http:", "https:", "blob:", "data:"].includes(url.protocol)) return normalized;
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
