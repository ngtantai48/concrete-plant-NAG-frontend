export const dynamic = "force-dynamic";

// Model server OpenAI-compatible, KHÔNG cần key. stream:false → trả JSON chuẩn
// choices[0].message.content (reasoning_content tách riêng, không lấy).
const AI_URL = process.env.LOT_TAG_AI_URL || "https://api.svnagentic.site/v1/chat/completions";
const AI_MODEL = process.env.LOT_TAG_AI_MODEL || "Qwopus3.6-35B-A3B-v1-MTP-Q6_K.gguf";

export async function POST(request: Request) {
  let payload: { messages?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const messages = payload?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "missing_messages" }, { status: 400 });
  }

  // Model "thinking" có thể suy luận lâu → timeout rộng để không treo vô hạn.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const upstream = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      // max_tokens cao: model "thinking" tiêu budget vào reasoning trước, thấp quá → content rỗng.
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        stream: false,
        temperature: 0.2,
        max_tokens: 3000,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return Response.json(
        { error: `upstream_${upstream.status}`, detail: detail.slice(0, 500) },
        { status: 502 }
      );
    }

    const data = (await upstream.json().catch(() => null)) as {
      choices?: { message?: { content?: string }; text?: string }[];
    } | null;
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
    return Response.json({ content });
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    return Response.json(
      { error: aborted ? "timeout" : "fetch_failed", detail: (error as Error)?.message },
      { status: aborted ? 504 : 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
