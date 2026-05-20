import { chromium } from "playwright";
import { z } from "zod";

import {
  buildReportMarkdown,
  renderAiReportHtml,
  safeReportFilename,
} from "@/lib/reports/ai-report-template";
import type { CreateAiReportPayload, CreateAiReportResponse } from "@/types/report";

export const runtime = "nodejs";

const turnSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  createdAt: z.string().min(1),
  status: z.enum(["streaming", "done", "error"]).optional(),
  totalMs: z.number().optional(),
});

const blockSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string().optional(),
  createdAt: z.string().min(1),
  data: z.unknown(),
});

const createReportSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().min(1),
  lastMessageAt: z.string().min(1),
  activeContext: z.enum(["fleet", "production", "maintenance"]),
  shareUrl: z.string().optional(),
  turns: z.array(turnSchema),
  blocks: z.array(blockSchema),
});

async function launchPdfBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return chromium.launch({ channel: "chrome", headless: true });
  }
}

async function renderPdfFromHtml(html: string) {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await launchPdfBrowser();
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    return await page.pdf({
      format: "A4",
      margin: {
        bottom: "0mm",
        left: "0mm",
        right: "0mm",
        top: "0mm",
      },
      preferCSSPageSize: true,
      printBackground: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Không thể render PDF. Hãy cài browser bằng "pnpm exec playwright install chromium". Chi tiết: ${message}`);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function POST(request: Request) {
  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = createReportSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid report payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data satisfies CreateAiReportPayload;
  if (payload.turns.length === 0 && payload.blocks.length === 0) {
    return Response.json({ error: "Không có nội dung để tạo báo cáo" }, { status: 400 });
  }

  const createdAt = new Date().toISOString();
  const id = `report-${Date.now().toString(36)}`;
  const title = payload.title.trim();
  const html = renderAiReportHtml(payload, id);
  const markdown = buildReportMarkdown(payload, id);
  const pdf = await renderPdfFromHtml(html);
  const filename = `${safeReportFilename(title)}-${createdAt.slice(0, 10)}.pdf`;

  const report: CreateAiReportResponse = {
    id,
    conversationId: payload.conversationId,
    title,
    createdAt,
    filename,
    format: "pdf",
    mimeType: "application/pdf",
    markdown,
    blockCount: payload.blocks.length,
    turnCount: payload.turns.length,
    pdfBase64: Buffer.from(pdf).toString("base64"),
    sizeBytes: pdf.byteLength,
  };

  return Response.json(report);
}
