export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CHAT_COMPLETIONS_PATH = "/chat/completions";
const DEFAULT_OCR_MODEL = "gpt-4o-mini";
const DEFAULT_OCR_PROMPT =
  "Bạn là hệ thống OCR hóa đơn sửa chữa/bảo dưỡng xe. Hãy đọc toàn bộ nội dung trong ảnh hoặc tài liệu, trả về văn bản tiếng Việt rõ ràng. Nếu có thể, giữ các thông tin quan trọng như đơn vị sửa chữa, địa chỉ, ngày hóa đơn, số hóa đơn, hạng mục sửa chữa, số tiền, biển số xe. Không suy luận từng bước, không trả reasoning/thinking, không giải thích thêm. Chỉ trả về nội dung OCR trong message.content.";

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, path: string) {
  if (!path) return baseUrl;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function chatCompletionsUrl(baseUrl: string) {
  if (/\/chat\/completions$/i.test(baseUrl)) return baseUrl;
  return joinUrl(baseUrl, envValue("OCR_CHAT_COMPLETIONS_PATH") || DEFAULT_CHAT_COMPLETIONS_PATH);
}

function ocrHeaders(contentType?: string): HeadersInit {
  const token = envValue("OCR_API_TOKEN", "OCR_API_KEY", "OCR_TOKEN");
  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(token
      ? {
        Authorization: `Bearer ${token}`,
        "X-API-Key": token,
      }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textCandidate(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanReasoningOcrText(value: string) {
  const markers = [
    "Final check of the text:",
    "*Final check of the text:*",
    "Construct the final output:",
    "Final output:",
    "Kết quả OCR:",
  ];
  let text = value.trim();
  for (const marker of markers) {
    const index = text.lastIndexOf(marker);
    if (index >= 0) {
      text = text.slice(index + marker.length).trim();
      break;
    }
  }

  const stopMarkers = ["\n\n    *Wait", "\n\n*Wait", "\n\n    *Self-Correction", "\n\n*Self-Correction"];
  for (const marker of stopMarkers) {
    const index = text.indexOf(marker);
    if (index >= 0) {
      text = text.slice(0, index).trim();
    }
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s{2,}/, "").trimEnd())
    .join("\n")
    .trim();
}

function extractContentParts(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!isRecord(part)) return "";
      return textCandidate(part.text) || extractText(part);
    })
    .filter(Boolean)
    .join("\n\n");
}

function extractText(payload: unknown): string {
  if (typeof payload === "string") return payload.trim();
  if (!isRecord(payload)) return "";

  const directCandidates = [
    payload.text,
    payload.ocr_text,
    payload.ocrText,
    payload.raw_text,
    payload.rawText,
    payload.translate,
    payload.translation,
    payload.result,
    payload.output,
    payload.content,
  ];

  for (const candidate of directCandidates) {
    const text = textCandidate(candidate);
    if (text) return text;
  }

  const contentText = extractContentParts(payload.content);
  if (contentText) return contentText;

  const reasoningText = textCandidate(payload.reasoning_content);
  if (reasoningText) return cleanReasoningOcrText(reasoningText);

  if (isRecord(payload.data)) {
    const text = extractText(payload.data);
    if (text) return text;
  }

  if (Array.isArray(payload.pages)) {
    const text = payload.pages.map(extractText).filter(Boolean).join("\n\n");
    if (text) return text;
  }

  if (Array.isArray(payload.results)) {
    const text = payload.results.map(extractText).filter(Boolean).join("\n\n");
    if (text) return text;
  }

  if (Array.isArray(payload.choices)) {
    const text = payload.choices
      .map((choice) => {
        if (!isRecord(choice)) return "";
        if (isRecord(choice.message)) return extractText(choice.message);
        return extractText(choice);
      })
      .filter(Boolean)
      .join("\n\n");
    if (text) return text;
  }

  return "";
}

async function parseUpstreamResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => ({}));
  }
  return response.text().catch(() => "");
}

function numberEnv(name: string, fallback: number) {
  const value = Number(envValue(name));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function boolEnv(name: string, fallback: boolean) {
  const value = envValue(name);
  if (!value) return fallback;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

function mimeType(file: File) {
  if (file.type) return file.type;
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

async function fileDataUrl(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${mimeType(file)};base64,${buffer.toString("base64")}`;
}

async function openAiContent(file: File, prompt: string) {
  const dataUrl = await fileDataUrl(file);
  if (mimeType(file) === "application/pdf") {
    return [
      { type: "text", text: prompt },
      {
        type: "file",
        file: {
          filename: file.name,
          file_data: dataUrl,
        },
      },
    ];
  }

  return [
    { type: "text", text: prompt },
    {
      type: "image_url",
      image_url: {
        url: dataUrl,
        detail: "auto",
      },
    },
  ];
}

async function chatCompletionsPayload(file: File, originalForm: FormData) {
  const prompt = String(originalForm.get("prompt") || envValue("OCR_PROMPT") || DEFAULT_OCR_PROMPT);
  const disableThinking = boolEnv("OCR_DISABLE_THINKING", true);
  return {
    model: envValue("OCR_MODEL", "OCR_API_MODEL") || DEFAULT_OCR_MODEL,
    temperature: numberEnv("OCR_TEMPERATURE", 0.1),
    max_tokens: numberEnv("OCR_MAX_TOKENS", 16000),
    ...(disableThinking
      ? {
          enable_thinking: false,
          thinking: false,
          reasoning: { effort: "none", exclude: true },
          chat_template_kwargs: { enable_thinking: false },
        }
      : {}),
    messages: [
      {
        role: "user",
        content: await openAiContent(file, prompt),
      },
    ],
  };
}

export async function GET() {
  const baseUrl = envValue("OCR_API_URL", "NEXT_PUBLIC_OCR_API_URL");
  if (!baseUrl) {
    return Response.json(
      { configured: false, error: "OCR_API_URL is not configured" },
      { status: 500 }
    );
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const targetUrl = chatCompletionsUrl(normalizedBaseUrl);
  const checks = await Promise.all(
    [normalizedBaseUrl, targetUrl].map(async (url) => {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: ocrHeaders(),
        });
        const payload = await parseUpstreamResponse(response);
        return {
          url,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          payload,
        };
      } catch (error) {
        return {
          url,
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    })
  );

  return Response.json({
    configured: true,
    baseUrl: normalizedBaseUrl,
    targetUrl,
    mode: "openai_chat_completions",
    model: envValue("OCR_MODEL", "OCR_API_MODEL") || DEFAULT_OCR_MODEL,
    hasToken: Boolean(envValue("OCR_API_TOKEN", "OCR_API_KEY", "OCR_TOKEN")),
    checks,
  });
}

export async function POST(request: Request) {
  const baseUrl = envValue("OCR_API_URL", "NEXT_PUBLIC_OCR_API_URL");
  if (!baseUrl) {
    return Response.json({ error: "OCR_API_URL is not configured" }, { status: 500 });
  }

  const originalForm = await request.formData();
  const file = originalForm.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing OCR file" }, { status: 400 });
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const url = chatCompletionsUrl(normalizedBaseUrl);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: ocrHeaders("application/json"),
      body: JSON.stringify(await chatCompletionsPayload(file, originalForm)),
      signal: request.signal,
    });

    const payload = await parseUpstreamResponse(upstream);
    if (!upstream.ok) {
      return Response.json(
        {
          error: "OCR chat completions request failed",
          attempted: [url],
          detail: {
            status: upstream.status,
            statusText: upstream.statusText,
            payload,
            url,
          },
        },
        { status: 502 }
      );
    }

    return Response.json({
      text: extractText(payload),
      raw: payload,
      upstream: { url },
    });
  } catch (error) {
    return Response.json(
      {
        error: "OCR chat completions request failed",
        attempted: [url],
        detail: error instanceof Error ? error.message : undefined,
      },
      { status: 502 }
    );
  }
}
