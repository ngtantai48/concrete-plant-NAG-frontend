"use client";

const SPEECH2TEXT_URL =
  process.env.NEXT_PUBLIC_SPEECH2TEXT_URL || "https://speechtotext.svnagentic.site";

export interface SpeechTranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

export const speechApi = {
  transcribe: async (
    file: File,
    signal?: AbortSignal
  ): Promise<SpeechTranscriptionResult> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${SPEECH2TEXT_URL}/v1/audio/transcriptions`, {
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
};

export default speechApi;
