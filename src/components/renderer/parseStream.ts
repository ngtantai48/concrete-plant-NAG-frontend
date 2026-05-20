import type { StreamChunk } from "./types";
import {
  findPendingRenderStart,
  hideUnresolvedRenderBuffers,
  normalizeLooseRenderBlocks,
  normalizeRenderBlockData,
  renderLoadingMarker,
} from "./looseRenderNormalizer";

const renderFencePattern = /:::render\s*([\s\S]*?):::/g;

type ParseStreamOptions = {
  showPendingLoading?: boolean;
};

function pushMarkdownOrLoading(
  chunks: StreamChunk[],
  markdown: string,
  showPendingLoading: boolean
): void {
  const pieces = markdown.split(renderLoadingMarker);
  pieces.forEach((piece, index) => {
    const body = piece.trim();
    if (body) chunks.push({ kind: "md", body });
    if (showPendingLoading && index < pieces.length - 1) chunks.push({ kind: "block-loading" });
  });
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isShortNoDataFallback(body: string): boolean {
  const normalized = normalizeText(body);
  const words = normalized.split(" ").filter(Boolean);
  if (words.length > 34) return false;
  if (/[|{}[\]<>]|^[-*#]/m.test(body.trim())) return false;

  return (
    /^toi khong tim thay thong tin nay(?: trong du lieu nguyen anh group)?\.?$/.test(normalized) ||
    /^khong tim thay thong tin nay(?: trong du lieu nguyen anh group)?\.?$/.test(normalized) ||
    /^khong co du lieu(?: phu hop| de hien thi| trong ngay da chon)?\.?$/.test(normalized) ||
    /^du lieu hien co khong co thong tin nay\.?$/.test(normalized)
  );
}

function removeContradictoryTrailingFallback(chunks: StreamChunk[]): StreamChunk[] {
  const hasRenderedData = chunks.some((chunk) => chunk.kind === "block");
  const lastChunk = chunks[chunks.length - 1];
  if (!hasRenderedData || lastChunk?.kind !== "md" || !isShortNoDataFallback(lastChunk.body)) {
    return chunks;
  }

  return chunks.slice(0, -1);
}

export function parseStream(text: string, options: ParseStreamOptions = {}): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  if (!text) return chunks;
  const showPendingLoading = options.showPendingLoading ?? true;
  const normalizedText = hideUnresolvedRenderBuffers(normalizeLooseRenderBlocks(text));

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  renderFencePattern.lastIndex = 0;

  while ((match = renderFencePattern.exec(normalizedText)) !== null) {
    if (match.index > lastIndex) {
      const markdown = normalizedText.slice(lastIndex, match.index).trim();
      if (markdown) pushMarkdownOrLoading(chunks, markdown, showPendingLoading);
    }

    try {
      chunks.push({
        kind: "block",
        data: normalizeRenderBlockData(JSON.parse(match[1]?.trim() ?? "") as unknown),
      });
    } catch {
      chunks.push({ kind: "md", body: "_(invalid render block)_" });
    }

    lastIndex = renderFencePattern.lastIndex;
  }

  const tail = normalizedText.slice(lastIndex);
  const pendingRenderStart = findPendingRenderStart(tail);
  if (pendingRenderStart >= 0) {
    const before = tail.slice(0, pendingRenderStart).trim();
    if (before) pushMarkdownOrLoading(chunks, before, showPendingLoading);
    if (showPendingLoading) chunks.push({ kind: "block-loading" });
    return chunks;
  }

  const trailingMarkdown = tail.trim();
  if (trailingMarkdown) pushMarkdownOrLoading(chunks, trailingMarkdown, showPendingLoading);
  return removeContradictoryTrailingFallback(chunks);
}
