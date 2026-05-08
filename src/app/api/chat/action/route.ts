import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const actionPayloadSchema = z
  .object({
    kind: z.string().min(1).optional(),
    reason: z.string().optional(),
  })
  .passthrough();

const actionRequestSchema = z.object({
  payload: actionPayloadSchema,
});

export async function POST(request: Request) {
  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = actionRequestSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json({ error: "Invalid dispatch action", issues: parsed.error.issues }, { status: 400 });
  }

  return Response.json(
    {
      error: "dispatch_action backend is not configured",
      intent: parsed.data.payload.kind ?? null,
    },
    { status: 501 },
  );
}
