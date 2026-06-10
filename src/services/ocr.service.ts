"use client";

export interface OcrExtractResult {
  text: string;
  raw?: unknown;
  upstream?: { url?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(payload: unknown, fallback: string) {
  if (isRecord(payload)) {
    const candidates = [payload.error, payload.message, payload.detail];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return fallback;
}

const ocrApi = {
  extractInvoiceText: async (file: File, signal?: AbortSignal): Promise<OcrExtractResult> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", "vi");
    formData.append("document_type", "invoice");

    const response = await fetch("/api/ocr", {
      method: "POST",
      body: formData,
      signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(errorMessage(payload, `OCR failed: ${response.status}`));
    }

    return {
      text: typeof payload?.text === "string" ? payload.text : "",
      raw: payload?.raw,
      upstream: isRecord(payload?.upstream) ? payload.upstream : undefined,
    };
  },
};

export default ocrApi;
