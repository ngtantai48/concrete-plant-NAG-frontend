import { Suspense } from "react";

import { RendererShellEntry } from "@/components/renderer/RendererShellEntry";

export default function AiAssistantPage() {
  return (
    <Suspense fallback={null}>
      <RendererShellEntry />
    </Suspense>
  );
}
