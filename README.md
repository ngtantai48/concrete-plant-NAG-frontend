# Concrete Plant NAG Frontend

Next.js App Router frontend for the NAG concrete plant operations assistant.

## AI Renderer

The production Chat AI renderer is integrated into the admin app at `/admin/ai-assistant`.

- `:::render` JSON blocks are parsed by `src/components/renderer/parseStream.ts`.
- Valid blocks render through `src/components/renderer/RenderBlock.tsx`.
- Invalid block JSON/schema falls back to `UnknownBlock` without crashing.
- Full-Page shell from `fullpage-export/option3-fullpage-detailed.jsx` is the active layout: conversation sidebar, chat workspace, and right Inspector.
- Conversations, pinned render blocks, pinned entities, feedback, Inspector state, and model mode persist in localStorage via Zustand.
- Chat uses the existing popup flow in `src/services/chat.service.ts`: router completion -> internal tool dispatch -> streamed answer with the render system prompt.
- Streaming goes through `/api/chat/stream` and `/api/chat/complete`, both proxying `CHAT_API_URL` with `CHAT_API_TOKEN`.
- The report action posts conversation turns plus render-block JSON to `/api/reports`; the server renders the HTML report template and returns a PDF download.
- No renderer mock endpoint or fixture tool layer is kept in production source.
- Legacy/incorrect chart output (`<chart>`, Chart.js JSON, `pie_chart`, mermaid/yaml chart fences) is normalized to the locked 14 render types where possible; unresolved chart buffers render as a blurred loading skeleton instead of leaking raw code.

## Environment Variables

```bash
CHAT_API_URL=https://chat.svnagentic.site/v1/nag/chat/stream
CHAT_API_TOKEN=...

NEXT_PUBLIC_API_URL=https://backend.na.savinatestinghub.com/api/v1/
```

The live tool layer reuses `src/services/chat-tools/*` from the existing chat popup and calls the backend APIs already used by the admin app. Replace or extend those tool handlers when adding new real backend capabilities.

## Structure

```text
src/app/api/chat/stream/route.ts Proxy streaming endpoint for CHAT_API_URL
src/app/api/chat/complete/route.ts Proxy non-stream endpoint for CHAT_API_URL
src/app/api/chat/action/route.ts dispatch_action validator; returns 501 until a real dispatch endpoint is wired
src/app/api/reports/route.ts HTML-to-PDF report generator for pinned AI render blocks
src/app/(dashboard)/admin/ai-assistant/page.tsx Full-page renderer shell entry
src/components/renderer/         Stream parser, render blocks, shell, reasoning tree
src/components/charts/           SVG chart primitives
src/lib/prompts/system.ts        System prompt template
src/services/chat-tools/         Real tool router/handlers reused from chat popup
tests/e2e/renderer.spec.ts       Playwright smoke test
tests/e2e/renderer-buffer.spec.ts Parser regression test for leaked chart buffers
```

## Run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000/admin/ai-assistant](http://localhost:3000/admin/ai-assistant) after logging in as admin.

## Test

```bash
pnpm exec playwright test
```
