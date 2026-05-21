"use client";

const SPEECH_BASE_URL =
  process.env.NEXT_PUBLIC_SPEECH2TEXT_URL || "https://speechtotext.svnagentic.site";
const TTS_BASE_URL = process.env.NEXT_PUBLIC_TTS_URL || SPEECH_BASE_URL;

export interface SpeechTranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

export interface SpeechSynthesizeOptions {
  speed?: number;
  seed?: number;
  signal?: AbortSignal;
}

export interface SpeechSynthesizeResult {
  fileId: string;
  url: string;
}

export interface SpeechHealth {
  ok: boolean;
  stt: boolean;
  tts: boolean;
  raw?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickFileId(payload: unknown): string {
  if (isRecord(payload)) {
    const candidates = [
      payload.file_id,
      payload.fileId,
      payload.id,
      isRecord(payload.data) ? payload.data.file_id : undefined,
      isRecord(payload.data) ? payload.data.id : undefined,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  throw new Error("Speech synthesize response missing file_id");
}

export const speechApi = {
  transcribe: async (
    file: File,
    signal?: AbortSignal
  ): Promise<SpeechTranscriptionResult> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${SPEECH_BASE_URL}/v1/audio/transcriptions`, {
      method: "POST",
      body: formData,
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        errorBody?.detail ||
        errorBody?.error ||
        `Speech-to-Text error: ${response.status}`;
      throw new Error(message);
    }

    const data = await response.json();
    return {
      text: typeof data?.text === "string" ? data.text : "",
      language: typeof data?.language === "string" ? data.language : undefined,
      duration: typeof data?.duration === "number" ? data.duration : undefined,
    };
  },

  synthesize: async (
    text: string,
    options: SpeechSynthesizeOptions = {}
  ): Promise<SpeechSynthesizeResult> => {
    const body: Record<string, unknown> = { text };
    if (typeof options.speed === "number") body.speed = options.speed;
    if (typeof options.seed === "number") body.seed = options.seed;

    const response = await fetch(`${TTS_BASE_URL}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        errorBody?.detail ||
        errorBody?.error ||
        `Text-to-Speech error: ${response.status}`;
      throw new Error(message);
    }

    const data = await response.json();
    const fileId = pickFileId(data);
    return {
      fileId,
      url: speechApi.getSpeechDownloadUrl(fileId),
    };
  },

  getSpeechDownloadUrl: (fileId: string): string =>
    `${TTS_BASE_URL}/v1/audio/speech/download/${encodeURIComponent(fileId)}`,

  health: async (signal?: AbortSignal): Promise<SpeechHealth> => {
    const response = await fetch(`${SPEECH_BASE_URL}/health`, {
      method: "GET",
      signal,
    });
    if (!response.ok) {
      return { ok: false, stt: false, tts: false };
    }
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const status = typeof data.status === "string" ? data.status.toLowerCase() : undefined;
    const ok = status ? status === "ok" || status === "healthy" : Boolean(data.ok);
    const sttFlag =
      data.stt === true ||
      data.speech_to_text === true ||
      (typeof data.stt === "string" &&
        (data.stt as string).toLowerCase() === "ok") ||
      ok;
    const ttsFlag =
      data.tts === true ||
      data.text_to_speech === true ||
      (typeof data.tts === "string" &&
        (data.tts as string).toLowerCase() === "ok") ||
      ok;
    return {
      ok: Boolean(sttFlag || ttsFlag),
      stt: Boolean(sttFlag),
      tts: Boolean(ttsFlag),
      raw: data,
    };
  },
};

export default speechApi;
